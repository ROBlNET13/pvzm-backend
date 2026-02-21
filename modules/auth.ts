import { betterAuth } from "better-auth";
import { username, admin, openAPI, captcha } from "better-auth/plugins";
import { config } from "./config.ts";
import { DatabaseSync } from "node:sqlite";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";

const VALID_USERNAME_RE = /^[a-zA-Z0-9_.]+$/;
const EMAIL_DOMAIN = "noemail.local";

export const auth = betterAuth({
	appName: "Plants vs. Zombies: MODDED",
	baseURL: config.backendUrl,
	trustedOrigins: config.allowedOrigins,
	advanced: {
		disableOriginCheck: !config.corsEnabled,
	},
	secret: config.authSecret,
	database: new DatabaseSync(config.dbPath),

	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},

	logger: {
		level: "debug",
	},

	emailAndPassword: {
		enabled: true,
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const name = (user as any).username;
					if (!name || typeof name !== "string") {
						throw new Error("Username is required");
					}
					if (!VALID_USERNAME_RE.test(name)) {
						throw new Error("Username can only contain letters, numbers, underscores, and periods");
					}
					// enforce email matches username@noemail.local
					if (user.email !== `${name}@${EMAIL_DOMAIN}`) {
						throw new Error("Invalid email format");
					}
					return { data: user };
				},
			},
		},
	},
	...(config.githubClientId &&
		config.githubClientSecret && {
			socialProviders: {
				github: {
					clientId: config.githubClientId,
					clientSecret: config.githubClientSecret,
				},
			},
		}),
	plugins: [
		username({
			usernameValidator: (username) => {
				return VALID_USERNAME_RE.test(username);
			},
		}),
		admin({
			...(config.authAdminUserIds.length > 0 && { adminUserIds: config.authAdminUserIds }),
		}),
		openAPI({ disableDefaultReference: true }),
		...(config.useTurnstile
			? [
					captcha({
						provider: "cloudflare-turnstile" as const,
						secretKey: config.turnstileSecret!,
					}),
				]
			: []),
	],
});

export function setupAuth(app: any) {
	const handler = toNodeHandler(auth);
	app.all("/api/auth/*splat", async (req: any, res: any, next: any) => {
		try {
			await handler(req, res);
		} catch (error: any) {
			// Handle UNIQUE constraint errors for better user feedback
			if (error?.message?.includes("UNIQUE constraint failed: user.username")) {
				return res.status(400).json({
					error: "Username already exists",
					code: "USERNAME_TAKEN",
				});
			}
			if (error?.message?.includes("UNIQUE constraint failed: user.email")) {
				return res.status(400).json({
					error: "Email already exists",
					code: "EMAIL_TAKEN",
				});
			}
			// Pass other errors to Express error handler
			next(error);
		}
	});
}

async function getSessionFromRequest(req: any) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});
	return session;
}

export function ensureAuthenticated() {
	return async function (req: any, res: any, next: () => void) {
		const session = await getSessionFromRequest(req);
		if (!session?.user || (session.user as any).role !== "admin") {
			return res.status(401).json({ error: "Unauthorized" });
		}
		req.user = session.user;
		return next();
	};
}

export function ensureAuthenticatedOrConsumeTokenForLevelParam(consumeOneTimeTokenForLevel: (token: string, levelId: number) => boolean) {
	return async function (req: any, res: any, next: () => void) {
		const session = await getSessionFromRequest(req);
		if (session?.user && (session.user as any).role === "admin") {
			req.user = session.user;
			return next();
		}

		const token = typeof req.query?.token === "string" ? req.query.token : "";
		const levelId = parseInt(String(req.params?.id));

		if (!token) {
			return res.status(401).json({ error: "Unauthorized" });
		}
		if (!Number.isFinite(levelId) || levelId <= 0) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		const consumed = consumeOneTimeTokenForLevel(token, levelId);
		if (!consumed) {
			return res.status(401).json({ error: "Invalid token" });
		}

		return next();
	};
}

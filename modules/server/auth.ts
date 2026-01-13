import session from "express-session";
import memorystore from "memorystore";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";

import type { ServerConfig } from "./config.ts";

export function setupSession(app: any, config: ServerConfig) {
	const MemoryStore = (memorystore as any)(session);
	const maxAgeMs = 24 * 60 * 60 * 1000;

	app.use(
		session({
			secret: config.sessionSecret,
			resave: false,
			saveUninitialized: false,
			store: new MemoryStore({
				checkPeriod: maxAgeMs,
			}),
			cookie: {
				secure: "auto" as any,
				sameSite: "lax",
				maxAge: maxAgeMs,
			},
		})
	);
}

export function setupGithubAuth(app: any, config: ServerConfig) {
	if (!config.useGithubAuth) return;

	app.use(passport.initialize());
	app.use(passport.session());

	passport.use(
		new GitHubStrategy(
			{
				clientID: config.githubClientID,
				clientSecret: config.githubClientSecret,
				callbackURL: `/api/auth/github/callback`,
				scope: ["user:email"],
			},
			function (_accessToken: string, _refreshToken: string, profile: any, done: (error: any, user?: any, info?: any) => void) {
				if (config.allowedUsers.includes(profile.username)) {
					return done(null, profile);
				}
				return done(null, false, { message: "Unauthorized user" });
			}
		)
	);

	passport.serializeUser(function (user: any, done: (error: any, id?: any) => void) {
		done(null, user);
	});

	passport.deserializeUser(function (obj: any, done: (error: any, user?: any) => void) {
		done(null, obj);
	});

	app.get("/api/auth/github", passport.authenticate("github", { session: true }));

	app.get(
		"/api/auth/github/callback",
		passport.authenticate("github", {
			successRedirect: "/admin.html",
			failureRedirect: "/auth-error.html",
		})
	);

	app.get("/api/auth/status", (req: any, res: any) => {
		if (req.isAuthenticated()) {
			res.json({
				authenticated: true,
				user: {
					username: req.user.username,
					displayName: req.user.displayName || req.user.username,
					profileUrl: req.user.profileUrl,
					avatarUrl: req.user.photos?.[0]?.value,
				},
			});
		} else {
			res.json({ authenticated: false });
		}
	});

	app.get("/api/auth/logout", (req: any, res: any) => {
		req.logout(function (err: Error) {
			if (err) {
				console.error("Error during logout:", err);
				return res.status(500).json({ error: "Failed to logout" });
			}
			res.redirect("/");
		});
	});
}

export function ensureAuthenticated(config: ServerConfig) {
	return function (req: any, res: any, next: () => void) {
		if (!config.useGithubAuth) {
			return next();
		}

		if (req.isAuthenticated()) {
			return next();
		}

		res.status(401).json({ error: "Unauthorized" });
	};
}

export function ensureAuthenticatedOrConsumeTokenForLevelParam(config: ServerConfig, consumeOneTimeTokenForLevel: (token: string, levelId: number) => boolean) {
	return function (req: any, res: any, next: () => void) {
		if (!config.useGithubAuth) {
			return next();
		}

		if (req.isAuthenticated && req.isAuthenticated()) {
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

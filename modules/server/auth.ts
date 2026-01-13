import session from "express-session";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Database } from "@db/sqlite";

import type { ServerConfig } from "./config.ts";

class SqliteSessionStore extends session.Store {
	db: Database;

	constructor(dbPath: string) {
		super();
		this.db = new Database(dbPath);
		this.db.exec(
			`CREATE TABLE IF NOT EXISTS sessions (
				sid TEXT PRIMARY KEY,
				sess TEXT NOT NULL,
				expire INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);`
		);
	}

	private cleanupExpired(nowMs: number) {
		try {
			this.db.prepare("DELETE FROM sessions WHERE expire < ?").run(nowMs);
		} catch {
			// best-effort cleanup
		}
	}

	private computeExpireMs(sess: any): number {
		const cookie = sess?.cookie;
		if (cookie?.expires) {
			const d = new Date(cookie.expires);
			if (!Number.isNaN(d.getTime())) return d.getTime();
		}
		const maxAge = typeof cookie?.maxAge === "number" ? cookie.maxAge : null;
		if (maxAge !== null) return Date.now() + maxAge;
		return Date.now() + 24 * 60 * 60 * 1000;
	}

	get(sid: string, cb: (err?: any, session?: any | null) => void) {
		try {
			const nowMs = Date.now();
			const row = this.db.prepare("SELECT sess, expire FROM sessions WHERE sid = ?").get(sid) as { sess: string; expire: number } | undefined;
			if (!row) return cb(null, null);
			if (row.expire < nowMs) {
				this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
				return cb(null, null);
			}
			return cb(null, JSON.parse(row.sess));
		} catch (err) {
			return cb(err);
		}
	}

	set(sid: string, sess: any, cb: (err?: any) => void) {
		try {
			const nowMs = Date.now();
			this.cleanupExpired(nowMs);
			const expire = this.computeExpireMs(sess);
			this.db
				.prepare("INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire")
				.run(sid, JSON.stringify(sess), expire);
			return cb(null);
		} catch (err) {
			return cb(err);
		}
	}

	destroy(sid: string, cb: (err?: any) => void) {
		try {
			this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
			return cb(null);
		} catch (err) {
			return cb(err);
		}
	}

	touch(sid: string, sess: any, cb: (err?: any) => void) {
		try {
			const nowMs = Date.now();
			this.cleanupExpired(nowMs);
			const expire = this.computeExpireMs(sess);
			this.db.prepare("UPDATE sessions SET expire = ? WHERE sid = ?").run(expire, sid);
			return cb(null);
		} catch (err) {
			return cb(err);
		}
	}
}

export function setupSession(app: any, config: ServerConfig) {
	const store = new SqliteSessionStore(config.dbPath);
	app.use(
		session({
			store,
			secret: config.sessionSecret,
			resave: false,
			saveUninitialized: false,
			cookie: {
				secure: true,
				maxAge: 24 * 60 * 60 * 1000,
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

import { Buffer } from "node:buffer";
import cors from "npm:cors";
import express from "npm:express";
import { createServer } from "node:https";
import { TurnstileVerify } from "jsr:@mathis/turnstile-verify";
import OpenAI from "jsr:@openai/openai";
import { Database } from "jsr:@db/sqlite";
import session from "npm:express-session";
import passport from "npm:passport";
import { Strategy as GitHubStrategy } from "npm:passport-github2";

import { decodeFile } from "./modules/decode.ts";
import { validateClone } from "./modules/validate.ts";

// initialize express app using any type to avoid typescript errors
const app = express() as any;

// custom type for level request body
interface LevelRequest {
	author: string;
	turnstileResponse: string;
	levelBinary?: Uint8Array;
	level_data?: string;
}

// define openai moderation response types
interface ModerationCategories {
	[key: string]: boolean;
}

interface ModerationCategoryScores {
	[key: string]: number;
}

// set up server variables from environment
const port = Deno.env.get("PORT") || 3000;
const corsEnabled = Deno.env.get("CORS_ENABLED") === "true";
const allowedOriginsString = Deno.env.get("ALLOWED_ORIGINS") || "";
const allowedOrigins = allowedOriginsString
	? allowedOriginsString.split(",")
	: [];

// GitHub OAuth settings
const useGithubAuth = Deno.env.get("USE_GITHUB_AUTH") === "true";
const githubClientID = Deno.env.get("GITHUB_CLIENT_ID") || "";
const githubClientSecret = Deno.env.get("GITHUB_CLIENT_SECRET") || "";
const allowedUsersString = Deno.env.get("GITHUB_ALLOWED_USERS") || "";
const allowedUsers = allowedUsersString ? allowedUsersString.split(",") : [];
const sessionSecret = Deno.env.get("SESSION_SECRET") || "default-secret";

// UI Configuration
const useTestUI = Deno.env.get("USE_TEST_UI") === "true";
const useAdminUI = Deno.env.get("USE_ADMIN_UI") === "true";

// configure cors
if (corsEnabled) {
	const corsOptions = {
		origin: function (
			origin: string | undefined,
			callback: (err: Error | null, allow?: boolean) => void,
		) {
			// allow requests with no origin (like mobile apps, curl, etc)
			if (!origin) return callback(null, true);

			// check if this origin is allowed
			if (allowedOrigins.includes(origin)) {
				return callback(null, true);
			} else {
				return callback(new Error("Not allowed by CORS"));
			}
		},
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	};

	app.use(cors(corsOptions));
	console.log(
		`CORS enabled for origins: ${allowedOrigins.join(", ") || "none"}`,
	);
} else {
	// when CORS is disabled, allow all origins
	app.use(cors());
	console.log("CORS disabled - allowing all origins");
}

// Log UI status
console.log(
	`UI Status - Test UI: ${useTestUI ? "enabled" : "disabled"}, Admin UI: ${
		useAdminUI ? "enabled" : "disabled"
	}`,
);

// set up middleware
app.use(express.json());
app.use(
	express.raw({
		type: "application/octet-stream",
		limit: "10mb",
	}),
);

// Set up session management
app.use(
	session({
		secret: sessionSecret,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: Deno.env.get("USE_SSL") === "true",
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
		},
	}),
);

// Setup Passport with GitHub OAuth
if (useGithubAuth) {
	// Initialize Passport
	app.use(passport.initialize());
	app.use(passport.session());

	// Configure Passport to use GitHub strategy
	passport.use(
		new GitHubStrategy(
			{
				clientID: githubClientID,
				clientSecret: githubClientSecret,
				callbackURL: `/api/auth/github/callback`,
				scope: ["user:email"],
			},
			function (
				_accessToken: string,
				_refreshToken: string,
				profile: any,
				done: (error: any, user?: any, info?: any) => void,
			) {
				// Check if the user is in the allowed users list
				if (allowedUsers.includes(profile.username)) {
					return done(null, profile);
				}
				return done(null, false, { message: "Unauthorized user" });
			},
		),
	);

	// Serialize and deserialize user for session management
	passport.serializeUser(
		function (user: any, done: (error: any, id?: any) => void) {
			done(null, user);
		},
	);

	passport.deserializeUser(
		function (obj: any, done: (error: any, user?: any) => void) {
			done(null, obj);
		},
	);

	// Authentication routes
	app.get(
		"/api/auth/github",
		passport.authenticate("github", { session: true }),
	);

	app.get(
		"/api/auth/github/callback",
		passport.authenticate("github", {
			successRedirect: "/admin.html",
			failureRedirect: "/auth-error.html",
		}),
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

// Middleware to check if user is authenticated for admin routes
function ensureAuthenticated(req: any, res: any, next: () => void) {
	if (!useGithubAuth) {
		return next();
	}

	if (req.isAuthenticated()) {
		return next();
	}

	res.status(401).json({ error: "Unauthorized" });
}

if (Deno.env.get("USE_PUBLIC_FOLDER") === "true") {
	// set up static file serving from the public directory
	const publicFolderPath = Deno.env.get("PUBLIC_FOLDER_PATH") || "./public";
	try {
		Deno.mkdirSync(publicFolderPath, { recursive: true });
		console.log(`Created public folder at: ${publicFolderPath}`);
	} catch (error) {
		if (error instanceof Deno.errors.AlreadyExists) {
			// directory already exists, no action needed
		} else {
			console.error(
				`Error creating public folder: ${(error as Error).message}`,
			);
		}
	}

	// Add conditional route handlers BEFORE static file serving
	// Block access to index.html if test UI is disabled
	if (!useTestUI) {
		app.get("/index.html", (_req: any, res: any) => {
			res.status(404).send("Test UI is disabled");
		});
	}

	// Block access to admin.html if admin UI is disabled
	if (!useAdminUI) {
		app.get("/admin.html", (_req: any, res: any) => {
			res.status(404).send("Admin UI is disabled");
		});
	}

	// Serve static files after conditional blocking
	app.use(express.static(publicFolderPath));
}

// set up database
const dbPath = Deno.env.get("DB_PATH") || "database.db";
const db = new Database(dbPath);

// set up data folder for level files
const dataFolderPath = Deno.env.get("DATA_FOLDER_PATH") || "./data";
const createDataFolder = Deno.env.get("CREATE_DATA_FOLDER") === "true";

if (createDataFolder) {
	try {
		Deno.mkdirSync(dataFolderPath, { recursive: true });
		console.log(`Created data folder at: ${dataFolderPath}`);
	} catch (error) {
		if (error instanceof Deno.errors.AlreadyExists) {
			// directory already exists, no action needed
		} else {
			console.error(
				`Error creating data folder: ${(error as Error).message}`,
			);
		}
	}
}

// initialize turnstile for captcha verification
const useTurnstile = Deno.env.get("USE_TURNSTILE") === "true";
let turnstile: TurnstileVerify | undefined;
if (useTurnstile) {
	const turnstileSecret = Deno.env.get("TURNSTILE_SECRET");
	if (turnstileSecret) {
		turnstile = new TurnstileVerify({ token: turnstileSecret });
		console.log("Turnstile verification enabled");
	} else {
		console.error(
			"TURNSTILE_SECRET not provided, turnstile verification disabled",
		);
	}
}

// initialize openai for content moderation
const useOpenAIModeration = Deno.env.get("USE_OPENAI_MODERATION") === "true";
let openai: OpenAI | undefined;
if (useOpenAIModeration) {
	const apiKey = Deno.env.get("OPENAI_API_KEY");
	if (apiKey) {
		openai = new OpenAI({
			apiKey: apiKey,
		});
		console.log("OpenAI moderation enabled");
	} else {
		console.error(
			"OPENAI_API_KEY not provided, OpenAI moderation disabled",
		);
	}
}

// initialize database tables
// create levels table
db.prepare(`
  CREATE TABLE IF NOT EXISTS levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at INTEGER NOT NULL, 
    sun INTEGER NOT NULL,
    is_water INTEGER NOT NULL, 
    likes INTEGER NOT NULL DEFAULT 0,
    dislikes INTEGER NOT NULL DEFAULT 0,
    plays INTEGER NOT NULL DEFAULT 0,
    difficulty INTEGER, 
    author_id INTEGER,
    version INTEGER DEFAULT 1
  )
`).run();

// create authors table
db.prepare(`
  CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    names TEXT NOT NULL, 
    first_level_id INTEGER NOT NULL,
    first_level_created_at INTEGER NOT NULL, 
    level_ids TEXT NOT NULL, 
    origin_ip TEXT NOT NULL
  )
`).run();

// create ratings table
db.prepare(
	`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    ip_address TEXT NOT NULL,
    rating TEXT NOT NULL, 
    created_at INTEGER NOT NULL, 
    UNIQUE(level_id, ip_address)
  )
`,
).run();

// define interfaces for responses
interface TurnstileResponse {
	valid: boolean;
	messages?: string[];
}

interface ModerationResult {
	flagged: boolean;
	categories?: ModerationCategories;
	categoryScores?: ModerationCategoryScores;
	error?: string;
}

// helper function to get client ip
function getClientIP(req: any): string {
	const cfIp = req.headers?.["cf-connecting-ip"];
	const forwardedIp = req.headers?.["x-forwarded-for"];
	const remoteIp = req.socket?.remoteAddress || "";

	return (
		cfIp || (typeof forwardedIp === "string" ? forwardedIp : "") || remoteIp
	);
}

// helper function to validate turnstile captcha
async function validateTurnstile(
	response: string,
	remoteip: string,
): Promise<TurnstileResponse> {
	if (!useTurnstile || !turnstile) return { valid: true };

	// check for testing mode
	const turnstileTesting = Deno.env.get("TURNSTILE_TESTING") === "true";
	if (turnstileTesting && response === "XXXX.DUMMY.TOKEN.XXXX") {
		return { valid: true };
	}

	try {
		const turnstileResponse = await turnstile.validate({
			response: response,
			remoteip: remoteip,
		});
		return turnstileResponse;
	} catch (error) {
		console.error("Turnstile validation error:", error);
		return { valid: false, messages: ["Error validating captcha"] };
	}
}

// helper function to moderate content with openai
async function moderateContent(text: string): Promise<ModerationResult> {
	if (!useOpenAIModeration || !openai) return { flagged: false };

	try {
		const moderation = await openai.moderations.create({
			model: "text-moderation-latest",
			input: text,
		});

		return {
			flagged: moderation.results[0].flagged,
			categories: moderation.results[0]
				.categories as unknown as ModerationCategories,
			categoryScores: moderation.results[0]
				.category_scores as unknown as ModerationCategoryScores,
		};
	} catch (error) {
		console.error("OpenAI moderation error:", error);
		// in case of error, we allow the content but log the issue
		return { flagged: false, error: (error as Error).message };
	}
}

// helper function to detect level format version
function detectVersion(fileBytes: Uint8Array): number {
	// check if first 4 bytes are "IZL3" (49 5A 4C 33)
	const izl3Header = new Uint8Array([0x49, 0x5A, 0x4C, 0x33]);
	const fileHeader = fileBytes.slice(0, 4);

	if (
		fileHeader.length >= 4 &&
		fileHeader[0] === izl3Header[0] &&
		fileHeader[1] === izl3Header[1] &&
		fileHeader[2] === izl3Header[2] &&
		fileHeader[3] === izl3Header[3]
	) {
		// IZL3 format
		return 3;
	}

	// Check for deflate header (0x78 followed by various possible second bytes)
	if (fileBytes.length >= 2 && fileBytes[0] === 0x78) {
		// Deflate format detected - IZL2
		return 2;
	}

	// Default to version 1 for unknown formats
	return 1;
}

// api endpoints
// create a new level
app.post("/api/levels", async (req: any, res: any) => {
	try {
		let author: string;
		let _is_water: boolean;
		let turnstileResponse: string;
		let levelBinary: Uint8Array;
		const contentType = req.headers["content-type"] || "";

		if (contentType.includes("application/octet-stream")) {
			author = req.query.author as string;
			turnstileResponse = req.query.turnstileResponse as string;
			levelBinary = req.body;
		} else {
			const {
				author: reqAuthor,
				turnstileResponse: reqTurnstileResponse,
				level_data,
			} = req.body as LevelRequest;

			author = reqAuthor;
			turnstileResponse = reqTurnstileResponse;
			levelBinary = level_data
				? new Uint8Array(Buffer.from(level_data))
				: new Uint8Array();
		}

		// validate inputs
		if (!author || !levelBinary) {
			return res.status(400).json({ error: "Invalid input" });
		}

		const clientIP = getClientIP(req);

		const version = detectVersion(levelBinary);

		// decode and validate level data
		let cloneData;
		try {
			cloneData = decodeFile(levelBinary);

			// validate the level/clone data
			if (!validateClone(cloneData)) {
				return res.status(400).json({
					error: "Invalid level data",
					message: "The level data failed validation checks",
				});
			}

			// extract stuff from level data
			const name = cloneData.name;
			const sun = cloneData.sun;
			const is_water = cloneData.lfValue[3] === 2;

			if (!name || isNaN(sun)) {
				return res.status(400).json({
					error: "Invalid level data",
					message:
						"Level data must contain a valid name and sun value",
				});
			}

			// validate turnstile
			const turnstileResult = await validateTurnstile(
				turnstileResponse,
				clientIP,
			);

			if (!turnstileResult.valid) {
				return res.status(400).json({
					error: "Captcha validation failed",
					messages: turnstileResult.messages,
				});
			}

			// moderate content
			const nameResult = await moderateContent(name);
			const authorResult = await moderateContent(author);

			if (nameResult.flagged || authorResult.flagged) {
				return res.status(400).json({
					error: "Content moderation failed",
					nameResult,
					authorResult,
				});
			}

			// store in database
			const now = Math.floor(Date.now() / 1000);
			// execute the insert statement (result not used)
			db.prepare(
				`
        			INSERT INTO levels (name, author, created_at, sun, is_water, version)
        			VALUES (?, ?, ?, ?, ?, ?)
      			`,
			).run(name, author, now, sun, is_water ? 1 : 0, version);

			// get the last insert id
			const queryResult = db
				.prepare("SELECT last_insert_rowid() as id")
				.get();
			const levelId = queryResult
				? (queryResult as { id: number }).id
				: 0;

			// store the level binary data
			const levelFilename = `${levelId}.izl${version}`;
			const levelPath = `${dataFolderPath}/${levelFilename}`;
			await Deno.writeFile(levelPath, levelBinary);

			// save author information
			const authorStmt = db.prepare(`
        		SELECT * FROM authors WHERE names = ? AND origin_ip = ? LIMIT 1
      		`);
			const existingAuthor = authorStmt.get(author, clientIP);

			type AuthorRecord = {
				id: number;
				level_ids: string;
				names: string;
			};

			if (existingAuthor) {
				// update existing author
				const authorRecord = existingAuthor as AuthorRecord;
				const levelIds = JSON.parse(authorRecord.level_ids);
				levelIds.push(levelId);

				db.prepare(
					`
          				UPDATE authors
          				SET level_ids = ?
          				WHERE id = ?
        			`,
				).run(JSON.stringify(levelIds), authorRecord.id);
			} else {
				// create new author
				db.prepare(
					`
          				INSERT INTO authors (names, first_level_id, first_level_created_at, level_ids, origin_ip)
          				VALUES (?, ?, ?, ?, ?)
        			`,
				).run(
					author,
					levelId,
					now,
					JSON.stringify([levelId]),
					clientIP,
				);
			}

			res.status(201).json({
				id: levelId,
				name,
				author,
				created_at: now,
				sun,
				is_water,
				version,
			});
		} catch (decodeError) {
			console.error("Error decoding level data:", decodeError);
			return res.status(400).json({
				error: "Invalid level data format",
				message: "Could not decode the level data",
			});
		}
	} catch (error) {
		console.error("Error creating level:", error);
		res.status(500).json({
			error: "Error creating level",
			message: (error as Error).message,
		});
	}
});

// get all levels with optional filtering
app.get("/api/levels", (req: any, res: any) => {
	try {
		const page = parseInt(String(req.query.page)) || 1;
		const limit = parseInt(String(req.query.limit)) || 10;
		const offset = (page - 1) * limit;

		const filters: string[] = [];
		const params: (string | number)[] = [];

		if (req.query.author) {
			filters.push("author LIKE ?");
			params.push(`%${req.query.author}%`);
		}

		if (req.query.is_water !== undefined) {
			filters.push("is_water = ?");
			params.push(req.query.is_water === "true" ? 1 : 0);
		}

		// only filter by version if explicitly provided
		if (req.query.version !== undefined) {
			const version = parseInt(String(req.query.version));
			filters.push("version = ?");
			params.push(version);
		}

		let query =
			`SELECT id, name, author, created_at, sun, is_water, likes, dislikes, plays, version FROM levels`;

		if (filters.length > 0) {
			query += " WHERE " + filters.join(" AND ");
		}

		query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
		params.push(limit, offset);

		const levels = db.prepare(query).all(...params);

		let countQuery = "SELECT COUNT(*) as count FROM levels";

		if (filters.length > 0) {
			countQuery += " WHERE " + filters.join(" AND ");
		}

		const countParams = params.slice(0, params.length - 2);
		const countResult = db.prepare(countQuery).get(...countParams);
		const totalCount = countResult
			? (countResult as { count: number }).count
			: 0;

		res.json({
			levels,
			pagination: {
				total: totalCount,
				page,
				limit,
				pages: Math.ceil(totalCount / limit),
			},
		});
	} catch (error) {
		console.error("Error listing levels:", error);
		res.status(500).json({
			error: "Failed to list levels",
			message: (error as Error).message,
		});
	}
});

// get a specific level by id
app.get("/api/levels/:id", (req: any, res: any) => {
	try {
		const levelId = parseInt(req.params.id);

		if (isNaN(levelId)) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		const level = db
			.prepare(`
      			SELECT id, name, author, created_at, sun, is_water, likes, dislikes, plays, difficulty, version
      			FROM levels WHERE id = ?
    		`)
			.get(levelId);

		if (!level) {
			return res.status(404).json({ error: "Level not found" });
		}

		res.json(level);
	} catch (error) {
		console.error("Error getting level:", error);
		res.status(500).json({
			error: "Failed to get level",
			message: (error as Error).message,
		});
	}
});

// download a level - supports both izl2 and izl3 formats
app.get("/api/levels/:id/download", (req: any, res: any) => {
	try {
		const levelId = parseInt(req.params.id);

		if (isNaN(levelId)) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		const level = db
			.prepare("SELECT * FROM levels WHERE id = ?")
			.get(levelId);

		if (!level) {
			return res.status(404).json({ error: "Level not found" });
		}

		db.prepare("UPDATE levels SET plays = plays + 1 WHERE id = ?").run(
			levelId,
		);

		// define level type for type safety
		type LevelRecord = {
			id: number;
			name: string;
			author: string;
			version: number;
			is_water: number;
		};

		const typedLevel = level as LevelRecord;

		// use appropriate file extension based on version
		const fileExtension = `izl${typedLevel.version || 2}`;
		const filePath = `${dataFolderPath}/${levelId}.${fileExtension}`;

		try {
			const fileContent = Deno.readFileSync(filePath);

			res.setHeader("Content-Type", "application/octet-stream");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${
					typedLevel.name.replace(
						/[^a-zA-Z0-9]/g,
						"_",
					)
				}.${fileExtension}"`,
			);
			res.send(Buffer.from(fileContent));
		} catch (fileError) {
			console.error("Error reading level file:", fileError);
			res.status(404).json({
				error: "Level file not found",
			});
		}
	} catch (error) {
		console.error("Error downloading level:", error);
		res.status(500).json({
			error: "Failed to download level",
			message: (error as Error).message,
		});
	}
});

interface RatingRequest {
	rating: string;
	turnstileResponse?: string; // now optional and not required as captcha verification is disabled for rating
}

// rate a level
app.post("/api/levels/:id/rate", (req: any, res: any) => {
	try {
		const levelId = parseInt(req.params.id);
		const { rating, turnstileResponse: _turnstileResponse } = req
			.body as RatingRequest;

		if (isNaN(levelId)) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		if (!rating || (rating !== "like" && rating !== "dislike")) {
			return res.status(400).json({ error: "Invalid rating" });
		}

		const level = db
			.prepare("SELECT * FROM levels WHERE id = ?")
			.get(levelId);

		if (!level) {
			return res.status(404).json({ error: "Level not found" });
		}

		const clientIP = getClientIP(req);

		// captcha verification removed from all endpoints except level uploading
		// if you want to re-enable captcha for this endpoint, uncomment the code below:
		/*
    if (useTurnstile) {
      if (!turnstileResponse) {
        return res.status(400).json({
          error: "Captcha verification required",
        });
      }

      const turnstileResult = await validateTurnstile(
        turnstileResponse,
        clientIP
      );
      if (!turnstileResult.valid) {
        return res.status(400).json({
          error: "Invalid captcha",
          messages: turnstileResult.messages,
        });
      }
    }
    */

		// check if the user has already rated this level
		const existingRating = db
			.prepare(
				`
      				SELECT * FROM ratings 
      				WHERE level_id = ? AND ip_address = ?
    			`,
			)
			.get(levelId, clientIP);

		type RatingRecord = {
			id: number;
			level_id: number;
			ip_address: string;
			rating: string;
			created_at: number;
		};

		if (existingRating) {
			const typedRating = existingRating as RatingRecord;
			if (typedRating.rating === rating) {
				return res.status(400).json({
					error: "You have already rated this level",
				});
			}

			// update the rating
			db.prepare(
				`
        			UPDATE ratings 
        			SET rating = ?, created_at = ? 
        			WHERE level_id = ? AND ip_address = ?
      			`,
			).run(rating, Math.floor(Date.now() / 1000), levelId, clientIP);

			// update the level likes/dislikes
			const updateLikesQuery = rating === "like"
				? `UPDATE levels SET likes = likes + 1, dislikes = dislikes - 1 WHERE id = ?`
				: `UPDATE levels SET likes = likes - 1, dislikes = dislikes + 1 WHERE id = ?`;

			db.prepare(updateLikesQuery).run(levelId);
		} else {
			// insert new rating
			db.prepare(
				`
        			INSERT INTO ratings (level_id, ip_address, rating, created_at)
        			VALUES (?, ?, ?, ?)
      			`,
			).run(levelId, clientIP, rating, Math.floor(Date.now() / 1000));

			// update the level likes/dislikes
			const columnToUpdate = rating === "like" ? "likes" : "dislikes";
			db.prepare(
				`UPDATE levels SET ${columnToUpdate} = ${columnToUpdate} + 1 WHERE id = ?`,
			).run(levelId);
		}

		// get the updated level
		const updatedLevel = db
			.prepare(
				`
      				SELECT id, name, author, likes, dislikes
      				FROM levels WHERE id = ?
    			`,
			)
			.get(levelId);

		res.json({ success: true, level: updatedLevel });
	} catch (error) {
		console.error("Error rating level:", error);
		res.status(500).json({
			error: "Failed to rate level",
			message: (error as Error).message,
		});
	}
});

// redirect root to appropriate page
app.get("/", (_req: any, res: any) => {
	if (useTestUI) {
		res.redirect("/index.html");
	} else if (useAdminUI) {
		res.redirect("/admin.html");
	} else {
		res.status(404).send("No UI interfaces are enabled");
	}
});

// ADMIN DASHBOARD API ENDPOINTS
// get all levels with pagination and search
app.get("/api/admin/levels", ensureAuthenticated, (req: any, res: any) => {
	try {
		// get query parameters
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const searchQuery = req.query.q || "";

		// calculate offset for pagination
		const offset = (page - 1) * limit;

		// build the query based on whether a search term is provided
		let queryParams: (string | number)[] = [];
		let countQueryParams: (string | number)[] = [];
		let whereClause = "";

		if (searchQuery) {
			whereClause = `WHERE name LIKE ? OR author LIKE ? OR id = ?`;
			const likeParam = `%${searchQuery}%`;
			queryParams = [likeParam, likeParam, searchQuery];
			countQueryParams = [...queryParams];
		}

		// get total count for pagination
		const countQuery =
			`SELECT COUNT(*) as count FROM levels ${whereClause}`;
		const countResult = db.prepare(countQuery).get(...countQueryParams);
		const total = countResult
			? (countResult as { count: number }).count
			: 0;

		// get levels for current page
		const query = `
			SELECT * FROM levels ${whereClause}
			ORDER BY id DESC
			LIMIT ? OFFSET ?
		`;

		// add pagination params
		queryParams.push(limit, offset);

		// execute the query
		const levels = db.prepare(query).all(...queryParams);

		res.json({
			levels,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error("Error fetching levels for admin:", error);
		res.status(500).json({
			error: "Failed to fetch levels",
			message: (error as Error).message,
		});
	}
});

// update a level (admin only)
app.put("/api/admin/levels/:id", ensureAuthenticated, (req: any, res: any) => {
	try {
		const levelId = parseInt(req.params.id);

		if (!levelId) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		// get the level to make sure it exists
		const existingLevel = db.prepare("SELECT * FROM levels WHERE id = ?")
			.get(levelId);

		if (!existingLevel) {
			return res.status(404).json({ error: "Level not found" });
		}

		// get the updated data from the request
		const {
			name,
			author,
			sun,
			is_water,
			difficulty,
			likes,
			dislikes,
			plays,
		} = req.body;

		// update the level
		db.prepare(`
			UPDATE levels
			SET 
				name = ?,
				author = ?,
				sun = ?,
				is_water = ?,
				difficulty = ?,
				likes = ?,
				dislikes = ?,
				plays = ?
			WHERE id = ?
		`).run(
			name,
			author,
			sun,
			is_water,
			difficulty,
			likes,
			dislikes,
			plays,
			levelId,
		);

		// get the updated level
		const updatedLevel = db.prepare("SELECT * FROM levels WHERE id = ?")
			.get(levelId);

		res.json({
			success: true,
			level: updatedLevel,
		});
	} catch (error) {
		console.error("Error updating level:", error);
		res.status(500).json({
			error: "Failed to update level",
			message: (error as Error).message,
		});
	}
});

// delete a level (admin only)
app.delete(
	"/api/admin/levels/:id",
	ensureAuthenticated,
	async (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (!levelId) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			// get the level to make sure it exists
			const existingLevel = db.prepare(
				"SELECT * FROM levels WHERE id = ?",
			).get(levelId);

			if (!existingLevel) {
				return res.status(404).json({ error: "Level not found" });
			}

			// define level type for type safety
			type LevelRecord = {
				id: number;
				version: number;
			};

			const typedLevel = existingLevel as LevelRecord;

			// delete related ratings
			db.prepare("DELETE FROM ratings WHERE level_id = ?").run(levelId);

			// delete the level from the database
			db.prepare("DELETE FROM levels WHERE id = ?").run(levelId);

			// delete the level file
			try {
				const fileExtension = `izl${typedLevel.version || 2}`;
				const levelPath =
					`${dataFolderPath}/${levelId}.${fileExtension}`;
				await Deno.remove(levelPath);
			} catch (fileError) {
				console.error(
					"Warning: Could not delete level file:",
					fileError,
				);
				// continue with the response even if file deletion fails
			}

			// update any authors who had this level
			const authors = db.prepare("SELECT * FROM authors").all() as any[];

			for (const author of authors) {
				try {
					const levelIds = JSON.parse(author.level_ids);
					const updatedLevelIds = levelIds.filter((id: number) =>
						id !== levelId
					);

					if (levelIds.length !== updatedLevelIds.length) {
						db.prepare(
							"UPDATE authors SET level_ids = ? WHERE id = ?",
						).run(JSON.stringify(updatedLevelIds), author.id);
					}
				} catch (parseError) {
					console.error(
						"Error parsing level_ids for author:",
						parseError,
					);
				}
			}

			res.json({ success: true });
		} catch (error) {
			console.error("Error deleting level:", error);
			res.status(500).json({
				error: "Failed to delete level",
				message: (error as Error).message,
			});
		}
	},
);

// configuration endpoint for the frontend
app.get("/api/config", (_req: any, res: any) => {
	res.json({
		turnstileEnabled: useTurnstile,
		turnstileSiteKey: useTurnstile
			? Deno.env.get("TURNSTILE_SITE_KEY")
			: null,
		moderationEnabled: useOpenAIModeration,
	});
});

// check if ssl is enabled
const useSSL = Deno.env.get("USE_SSL") === "true";

if (useSSL) {
	try {
		const sslKeyPath = Deno.env.get("SSL_KEY_PATH");
		const sslCertPath = Deno.env.get("SSL_CERT_PATH");

		// make sure the necessary paths are provided
		if (!sslKeyPath || !sslCertPath) {
			console.error(
				"SSL_KEY_PATH and SSL_CERT_PATH must be provided when USE_SSL is true",
			);
			Deno.exit(1);
		}

		// read ssl certificate and key
		const cert = Deno.readTextFileSync(sslCertPath);
		const key = Deno.readTextFileSync(sslKeyPath);

		// create HTTPS server
		const httpsServer = createServer({ key, cert }, app);

		httpsServer.listen(Number(port), () => {
			console.log(
				`SSL enabled - HTTPS server running on https://localhost:${port}`,
			);
		});
	} catch (error) {
		console.error("Error setting up SSL server:", error);
		console.log("Falling back to HTTP...");

		// start http server as fallback using express
		app.listen(Number(port), () => {
			console.log(`HTTP server running on http://localhost:${port}`);
		});
	}
} else {
	// start http server using express
	app.listen(Number(port), () => {
		console.log(`HTTP server running on http://localhost:${port}`);
	});
}

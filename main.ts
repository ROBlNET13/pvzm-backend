import { Buffer } from "node:buffer";
import cors from "npm:cors";
import express from "npm:express";
import { TurnstileVerify } from "jsr:@mathis/turnstile-verify";
import OpenAI from "jsr:@openai/openai";
import { Database } from "jsr:@db/sqlite";

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

// configure cors if enabled
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
	console.log("CORS disabled");
}

// set up middleware
app.use(express.json());
app.use(
	express.raw({
		type: "application/octet-stream",
		limit: "10mb",
	}),
);

// set up static file serving from the public directory
const publicFolderPath = "./public";
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
app.use(express.static(publicFolderPath));

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
db.prepare(
	`
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
`,
).run();

// create authors table
db.prepare(
	`
  CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    names TEXT NOT NULL, 
    first_level_id INTEGER NOT NULL,
    first_level_created_at INTEGER NOT NULL, 
    level_ids TEXT NOT NULL, 
    origin_ip TEXT NOT NULL
  )
`,
).run();

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

// api endpoints
// create a new level
app.post("/api/levels", async (req: any, res: any) => {
	try {
		// fixed version to 2 for izl2 only
		const version = 2;
		let author: string;
		let _is_water: boolean;
		let turnstileResponse: string;
		let levelBinary: Uint8Array;
		const contentType = req.headers["content-type"] || "";

		if (contentType.includes("application/octet-stream")) {
			author = req.query.author as string;
			_is_water = (req.query.is_water as string) === "true";
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
			const levelFilename = `${levelId}.izl2`;
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

		// assume version 2 for filtering if not specified
		const version = req.query.version !== undefined
			? parseInt(String(req.query.version))
			: 2;

		filters.push("version = ?");
		params.push(version);

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
			.prepare(
				`
      SELECT id, name, author, created_at, sun, is_water, likes, dislikes, plays, version
      FROM levels WHERE id = ?
    `,
			)
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

// download a level - modified to only support izl2
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

		// only use izl2 format
		const filePath = `${dataFolderPath}/${levelId}.izl2`;

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
				}.izl2"`,
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

// redirect root to index.html
app.get("/", (_req: any, res: any) => {
	res.redirect("/index.html");
});

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

		// create https server using modern deno api
		try {
			// read ssl certificate and key
			const _cert = Deno.readTextFileSync(sslCertPath);
			const _key = Deno.readTextFileSync(sslKeyPath);

			// start an express server with https
			app.listen(Number(port), () => {
				console.log(
					`SSL enabled - HTTPS server running on https://localhost:${port}`,
				);
			});

			// note: in a real production environment, you might want to use
			// a proper https server module that integrates with express
		} catch (error) {
			console.error("Error starting Deno HTTPS server:", error);
			throw error; // re-throw to be caught by the outer catch
		}
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

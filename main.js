import express from "npm:express@4";
import { Database } from "jsr:@db/sqlite";
import { TurnstileVerify } from "jsr:@mathis/turnstile-verify";
import OpenAI from "jsr:@openai/openai";
import { Buffer } from "node:buffer";
import cors from "npm:cors";

const app = express();
const port = Deno.env.get("PORT") || 3000;

const corsEnabled = Deno.env.get("CORS_ENABLED") === "true";
const allowedOriginsString = Deno.env.get("ALLOWED_ORIGINS") || "";
const allowedOrigins = allowedOriginsString
	? allowedOriginsString.split(",")
	: [];

if (corsEnabled) {
	const corsOptions = {
		origin: function (origin, callback) {
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

app.use(express.json());
app.use(express.raw({
	type: "application/octet-stream",
	limit: "10mb",
}));

// set up static file serving from the public directory
const publicFolderPath = "./public";
try {
	Deno.mkdirSync(publicFolderPath, { recursive: true });
	console.log(`created public folder at: ${publicFolderPath}`);
} catch (error) {
	if (!(error instanceof Deno.errors.AlreadyExists)) {
		console.error(`error creating public folder: ${error.message}`);
	}
}
app.use(express.static(publicFolderPath));

const dbPath = Deno.env.get("DB_PATH") || "database.db";
const db = new Database(dbPath);

const dataFolderPath = Deno.env.get("DATA_FOLDER_PATH") || "./data";
const createDataFolder = Deno.env.get("CREATE_DATA_FOLDER") === "true";

if (createDataFolder) {
	try {
		Deno.mkdirSync(dataFolderPath, { recursive: true });
		console.log(`created data folder at: ${dataFolderPath}`);
	} catch (error) {
		if (!(error instanceof Deno.errors.AlreadyExists)) {
			console.error(`error creating data folder: ${error.message}`);
		}
	}
}

const useTurnstile = Deno.env.get("USE_TURNSTILE") === "true";
let turnstile;
if (useTurnstile) {
	const turnstileSecret = Deno.env.get("TURNSTILE_SECRET");
	turnstile = new TurnstileVerify({ token: turnstileSecret });
	console.log("turnstile verification enabled");
}

// initialize OpenAI for content moderation
const useOpenAIModeration = Deno.env.get("USE_OPENAI_MODERATION") === "true";
let openai;
if (useOpenAIModeration) {
	openai = new OpenAI({
		apiKey: Deno.env.get("OPENAI_API_KEY"),
	});
	console.log("openai moderation enabled");
}

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
db.prepare(`
	CREATE TABLE IF NOT EXISTS ratings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		level_id INTEGER NOT NULL,
		ip_address TEXT NOT NULL,
		rating TEXT NOT NULL, 
		created_at INTEGER NOT NULL, 
		UNIQUE(level_id, ip_address)
	)
`).run();

function getClientIP(req) {
	return req.headers["cf-connecting-ip"] ||
		req.headers["x-forwarded-for"] ||
		req.socket.remoteAddress;
}

async function validateTurnstile(response, remoteip) {
	if (!useTurnstile) return { valid: true };

	try {
		const turnstileResponse = await turnstile.validate({
			response: response,
			remoteip: remoteip,
		});
		return turnstileResponse;
	} catch (error) {
		console.error("turnstile validation error:", error);
		return { valid: false, messages: ["error validating captcha"] };
	}
}

async function moderateContent(text) {
	if (!useOpenAIModeration) return { flagged: false };

	try {
		const moderation = await openai.moderations.create({
			model: "text-moderation-latest",
			input: text,
		});

		return {
			flagged: moderation.results[0].flagged,
			categories: moderation.results[0].categories,
			categoryScores: moderation.results[0].category_scores,
		};
	} catch (error) {
		console.error("OpenAI moderation error:", error);
		// in case of error, we allow the content but log the issue
		return { flagged: false, error: error.message };
	}
}

app.post("/api/levels", async (req, res) => {
	try {
		let name,
			author,
			is_water,
			sun,
			turnstileResponse,
			levelBinary,
			version;
		const contentType = req.headers["content-type"] || "";

		if (contentType.includes("application/octet-stream")) {
			name = req.query.name;
			author = req.query.author;
			is_water = req.query.is_water === "true";
			sun = parseInt(req.query.sun);
			turnstileResponse = req.query.turnstileResponse;
			// get version from query params (default to 1 if not provided)
			version = parseInt(req.query.version) || 1;
			levelBinary = req.body;
		} else {
			const {
				name: n,
				author: a,
				is_water: w,
				sun: s,
				version: v,
				level_data,
				turnstileResponse: tr,
			} = req.body;
			name = n;
			author = a;
			is_water = w;
			sun = s;
			version = v || 1; // default to version 1 if not provided
			turnstileResponse = tr;

			if (level_data) {
				try {
					levelBinary = Deno.core.decode(level_data);
				} catch (_error) {
					return res.status(400).json({
						error: "Invalid level data encoding",
					});
				}
			}
		}

		if (
			!name || !author || is_water === undefined || !sun || !levelBinary
		) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		const clientIP = getClientIP(req);

		// moderate content if enabled
		if (useOpenAIModeration) {
			// moderate both level name and author name
			const contentToModerate = `${name} ${author}`;
			const moderationResult = await moderateContent(contentToModerate);

			if (moderationResult.flagged) {
				console.log(
					`Content moderation flagged: ${
						JSON.stringify(moderationResult)
					}`,
				);
				return res.status(400).json({
					error: "Content contains inappropriate language or content",
					moderation: moderationResult,
				});
			}
		}

		if (useTurnstile) {
			if (!turnstileResponse) {
				return res.status(400).json({
					error: "Captcha verification required",
				});
			}

			const turnstileResult = await validateTurnstile(
				turnstileResponse,
				clientIP,
			);
			if (!turnstileResult.valid) {
				return res.status(400).json({
					error: "Invalid captcha",
					messages: turnstileResult.messages,
				});
			}
		}
		const insertLevelQuery = db.prepare(`
	  INSERT INTO levels (name, author, created_at, sun, is_water, difficulty, version)
	  VALUES (?, ?, ?, ?, ?, NULL, ?)
	`);

		const timestamp = Math.floor(Date.now() / 1000);
		// execute the insert query
		insertLevelQuery.run(
			name,
			author,
			timestamp,
			sun,
			is_water ? 1 : 0,
			version,
		);

		// get the ID of the newly inserted level
		// the lastInsertRowid is more reliable than lastInsertId
		const result = db.prepare("SELECT last_insert_rowid() as id").get();

		if (!result || result.id === undefined) {
			return res.status(500).json({ error: "failed to create level" });
		}

		const levelId = result.id;
		const levelIdString = String(levelId); // convert to string safely

		// check if the author already exists
		const findAuthorQuery = db.prepare(`
      SELECT * FROM authors WHERE names LIKE ? OR origin_ip = ?
    `);
		const existingAuthor = findAuthorQuery.all(`%${author}%`, clientIP);

		if (existingAuthor.length === 0) {
			const insertAuthorQuery = db.prepare(`
        INSERT INTO authors (names, first_level_id, first_level_created_at, level_ids, origin_ip)
        VALUES (?, ?, ?, ?, ?)
      `);

			insertAuthorQuery.run(
				author,
				levelId,
				timestamp,
				levelIdString,
				clientIP,
			);

			// get the ID of the newly inserted author
			const authorId =
				db.prepare("SELECT last_insert_rowid() as id").get().id;

			if (!authorId) {
				console.error("failed to get author id after insert");
				// we can still continue as the level was created successfully
			} else {
				// update level with author_id
				const updateLevelQuery = db.prepare(`
					UPDATE levels SET author_id = ? WHERE id = ?
				`);
				updateLevelQuery.run(authorId, levelId);
			}
		} else {
			const authorRecord = existingAuthor[0];
			const levelIds = authorRecord.level_ids.split(",");
			levelIds.push(levelIdString); // use the previously created safe string

			const namesArray = authorRecord.names.split(",");
			if (!namesArray.includes(author)) {
				namesArray.push(author);
			}

			const updateAuthorQuery = db.prepare(`
        UPDATE authors
        SET names = ?, level_ids = ?
        WHERE id = ?
      `);

			updateAuthorQuery.run(
				namesArray.join(","),
				levelIds.join(","),
				authorRecord.id,
			);

			const updateLevelQuery = db.prepare(`
        UPDATE levels SET author_id = ? WHERE id = ?
      `);
			updateLevelQuery.run(authorRecord.id, levelId);
		}

		// write the level binary data to a file
		try {
			// use the correct file extension based on version
			const fileExtension = version === 2 ? ".izl2" : ".izl";
			const levelFilePath =
				`${dataFolderPath}/${levelId}${fileExtension}`;
			Deno.writeFileSync(levelFilePath, levelBinary);
		} catch (fileError) {
			console.error("error writing level file:", fileError);
			// continue since the level metadata is already in the database
		}

		res.status(201).json({
			id: levelId,
			name,
			author,
			created_at: timestamp,
			is_water: is_water ? 1 : 0,
			sun,
			version,
		});
	} catch (error) {
		console.error("Error uploading level:", error);
		res.status(500).json({ error: "Failed to upload level" });
	}
});

app.get("/api/levels", (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const offset = (page - 1) * limit;

		const filters = [];
		const params = [];

		if (req.query.author) {
			filters.push("author LIKE ?");
			params.push(`%${req.query.author}%`);
		}

		if (req.query.is_water !== undefined) {
			filters.push("is_water = ?");
			params.push(req.query.is_water === "true" ? 1 : 0);
		}

		if (req.query.version !== undefined) {
			filters.push("version = ?");
			params.push(parseInt(req.query.version));
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
		const totalCount = db.prepare(countQuery).get(...countParams).count;

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
		res.status(500).json({ error: "Failed to list levels" });
	}
});

app.get("/api/levels/:id", (req, res) => {
	try {
		const levelId = parseInt(req.params.id);

		if (isNaN(levelId)) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		const level = db.prepare(`
      SELECT id, name, author, created_at, sun, is_water, likes, dislikes, plays, version
      FROM levels WHERE id = ?
    `).get(levelId);

		if (!level) {
			return res.status(404).json({ error: "Level not found" });
		}

		res.json(level);
	} catch (error) {
		console.error("Error getting level:", error);
		res.status(500).json({ error: "Failed to get level" });
	}
});

app.get("/api/levels/:id/download", (req, res) => {
	try {
		const levelId = parseInt(req.params.id);

		if (isNaN(levelId)) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		const level = db.prepare("SELECT * FROM levels WHERE id = ?").get(
			levelId,
		);

		if (!level) {
			return res.status(404).json({ error: "Level not found" });
		}

		db.prepare("UPDATE levels SET plays = plays + 1 WHERE id = ?").run(
			levelId,
		);
		// determine file extension based on version
		const primaryExtension = level.version === 2 ? ".izl2" : ".izl";
		const fallbackExtension = level.version === 2 ? ".izl" : ".izl2";
		const primaryFilePath =
			`${dataFolderPath}/${levelId}${primaryExtension}`;
		const fallbackFilePath =
			`${dataFolderPath}/${levelId}${fallbackExtension}`;

		try {
			let fileContent;
			let usedExtension = primaryExtension;

			try {
				// try to read the file with primary extension
				fileContent = Deno.readFileSync(primaryFilePath);
			} catch (_err) {
				// if primary file doesn't exist, try fallback extension
				console.log(
					`File ${primaryFilePath} not found, trying ${fallbackFilePath}`,
				);
				fileContent = Deno.readFileSync(fallbackFilePath);
				usedExtension = fallbackExtension;
			}

			res.setHeader("Content-Type", "application/octet-stream");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${levelId}${usedExtension}"`,
			);
			// convert Uint8Array to Buffer to ensure proper binary transmission
			const buffer = Buffer.from(fileContent);
			res.end(buffer);
		} catch (fileError) {
			console.error("error reading level file:", fileError);
			res.status(404).json({ error: "level file not found" });
		}
	} catch (error) {
		console.error("Error downloading level:", error);
		res.status(500).json({ error: "Failed to download level" });
	}
});

app.post("/api/levels/:id/rate", (req, res) => {
	try {
		const levelId = parseInt(req.params.id);
		const { rating } = req.body;

		if (isNaN(levelId)) {
			return res.status(400).json({ error: "Invalid level ID" });
		}

		if (rating !== "like" && rating !== "dislike") {
			return res.status(400).json({
				error: "Rating must be 'like' or 'dislike'",
			});
		}

		const level = db.prepare("SELECT * FROM levels WHERE id = ?").get(
			levelId,
		);

		if (!level) {
			return res.status(404).json({ error: "Level not found" });
		}

		const clientIP = getClientIP(req);
		const existingRating = db.prepare(
			"SELECT * FROM ratings WHERE level_id = ? AND ip_address = ?",
		).get(levelId, clientIP);

		if (existingRating) {
			if (existingRating.rating === rating) {
				return res.json({
					success: true,
					message: "You've already rated this level",
				});
			}
			db.prepare(
				"UPDATE ratings SET rating = ? WHERE level_id = ? AND ip_address = ?",
			).run(rating, levelId, clientIP);

			if (rating === "like") {
				db.prepare(
					"UPDATE levels SET likes = likes + 1, dislikes = dislikes - 1 WHERE id = ?",
				).run(levelId);
			} else {
				db.prepare(
					"UPDATE levels SET likes = likes - 1, dislikes = dislikes + 1 WHERE id = ?",
				).run(levelId);
			}

			return res.json({ success: true, message: "Rating updated" });
		} else {
			const timestamp = Math.floor(Date.now() / 1000);
			db.prepare(
				"INSERT INTO ratings (level_id, ip_address, rating, created_at) VALUES (?, ?, ?, ?)",
			).run(levelId, clientIP, rating, timestamp);

			if (rating === "like") {
				db.prepare("UPDATE levels SET likes = likes + 1 WHERE id = ?")
					.run(levelId);
			} else {
				db.prepare(
					"UPDATE levels SET dislikes = dislikes + 1 WHERE id = ?",
				).run(levelId);
			}

			res.json({ success: true });
		}
	} catch (error) {
		console.error("Error rating level:", error);
		res.status(500).json({ error: "Failed to rate level" });
	}
});

app.get("/", (_req, res) => {
	res.redirect("/index.html");
});

// configuration endpoint for the frontend
app.get("/api/config", (_req, res) => {
	res.json({
		turnstileEnabled: useTurnstile,
		turnstileSiteKey: useTurnstile
			? Deno.env.get("TURNSTILE_SITE_KEY")
			: null,
		moderationEnabled: useOpenAIModeration,
	});
});

// check if SSL is enabled
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

		// read the SSL files (not needed as Deno.listenTls takes file paths)
		// const key = Deno.readTextFileSync(sslKeyPath);
		// const cert = Deno.readTextFileSync(sslCertPath);

		// create the HTTPS server
		// const httpsOptions = { key, cert };

		// start HTTPS server
		const server = Deno.listenTls({
			port: Number(port),
			certFile: sslCertPath,
			keyFile: sslKeyPath,
		});

		console.log(
			`SSL enabled - HTTPS server running on https://localhost:${port}`,
		);

		// handle HTTP requests using Express
		for await (const conn of server) {
			(async () => {
				const httpConn = Deno.serve(conn);
				for await (const requestEvent of httpConn) {
					await new Promise((resolve) => {
						app(
							new Request(requestEvent.request),
							{
								respondWith: (response) => {
									requestEvent.respondWith(response);
									resolve();
								},
							},
						);
					});
				}
			})();
		}
	} catch (error) {
		console.error("Error starting HTTPS server:", error);
		console.log("Falling back to HTTP...");
		app.listen(port, () => {
			console.log(`HTTP server running on http://localhost:${port}`);
		});
	}
} else {
	// start HTTP server if SSL is not enabled
	app.listen(port, () => {
		console.log(`HTTP server running on http://localhost:${port}`);
	});
}

import { Buffer } from "node:buffer";
import { EmbedBuilder, type WebhookClient } from "discord.js";

import { allPlantsStringArray, decodeFile } from "../../decode.ts";
import { validateClone } from "../../validate.ts";

import type { ServerConfig } from "../config.ts";
import type { DbContext } from "../db.ts";
import { trySendDiscordWebhook } from "../discord.ts";
import { decodeLevelFromDisk, detectVersion } from "../levels_io.ts";
import type { ModerationResult } from "../moderation.ts";
import type { TurnstileResponse } from "../turnstile.ts";
import { getClientIP } from "../request.ts";

export function registerLevelRoutes(
	app: any,
	config: ServerConfig,
	dbCtx: DbContext,
	deps: {
		validateTurnstile: (response: string, remoteip: string) => Promise<TurnstileResponse>;
		moderateContent: (text: string) => Promise<ModerationResult>;
		reportWebhookClient?: WebhookClient;
		uploadWebhookClient?: WebhookClient;
	}
) {
	// create a new level
	app.post("/api/levels", async (req: any, res: any) => {
		try {
			// deno-lint-ignore prefer-const
			let author: string;
			let _is_water: boolean;
			// deno-lint-ignore prefer-const
			let turnstileResponse: string;
			// deno-lint-ignore prefer-const
			let levelBinary: Uint8Array;
			const contentType = req.headers["content-type"] || "";

			if (!contentType.includes("application/octet-stream")) {
				return res.status(415).json({
					error: "Unsupported Media Type",
					message: "Only application/octet-stream uploads are supported.",
				});
			}

			author = req.query.author as string;
			turnstileResponse = req.query.turnstileResponse as string;
			levelBinary = req.body;

			// validate inputs
			if (!author || !levelBinary) {
				return res.status(400).json({ error: "Invalid input" });
			}

			const clientIP = getClientIP(req);

			const version = detectVersion(levelBinary);
			if (version !== 3) {
				return res.status(400).json({
					error: "Invalid level data format",
					message: "Only IZL3 levels are supported. IZL2 is deprecated.",
				});
			}

			// decode and validate level data
			let cloneData;
			try {
				cloneData = decodeFile(levelBinary);

				if (!validateClone(cloneData)) {
					return res.status(400).json({
						error: "Invalid level data",
						message: "The level data failed validation checks",
					});
				}

				const name = cloneData.name;
				const sun = cloneData.sun;
				const is_water = cloneData.lfValue[3] === 2;

				if (!name || isNaN(sun)) {
					return res.status(400).json({
						error: "Invalid level data",
						message: "Level data must contain a valid name and sun value",
					});
				}

				// validate turnstile
				const turnstileResult = await deps.validateTurnstile(turnstileResponse, clientIP);

				if (!turnstileResult.valid) {
					return res.status(400).json({
						error: "Captcha validation failed",
						messages: turnstileResult.messages,
					});
				}

				// moderate content
				const nameResult = await deps.moderateContent(name);
				const authorResult = await deps.moderateContent(author);

				if (nameResult.flagged || authorResult.flagged) {
					return res.status(400).json({
						error: "Content moderation failed",
						/* nameResult,
						authorResult, */
					});
				}

				// store in database
				const now = Math.floor(Date.now() / 1000);
				dbCtx.db
					.prepare(
						`
        			INSERT INTO levels (name, author, created_at, sun, is_water, version)
        			VALUES (?, ?, ?, ?, ?, ?)
      		`
					)
					.run(name, author, now, sun, is_water ? 1 : 0, version);

				const queryResult = dbCtx.db.prepare("SELECT last_insert_rowid() as id").get();
				const levelId = queryResult ? (queryResult as { id: number }).id : 0;

				// store the level binary data
				const levelFilename = `${levelId}.izl${version}`;
				const levelPath = `${dbCtx.dataFolderPath}/${levelFilename}`;
				await Deno.writeFile(levelPath, levelBinary);

				// save author information
				const authorStmt = dbCtx.db.prepare(`SELECT * FROM authors WHERE names = ? AND origin_ip = ? LIMIT 1`);
				const existingAuthor = authorStmt.get(author, clientIP);

				type AuthorRecord = {
					id: number;
					level_ids: string;
					names: string;
				};

				if (existingAuthor) {
					const authorRecord = existingAuthor as AuthorRecord;
					const levelIds = JSON.parse(authorRecord.level_ids);
					levelIds.push(levelId);

					dbCtx.db
						.prepare(
							`UPDATE authors
          			SET level_ids = ?
          			WHERE id = ?`
						)
						.run(JSON.stringify(levelIds), authorRecord.id);
				} else {
					dbCtx.db
						.prepare(
							`INSERT INTO authors (names, first_level_id, first_level_created_at, level_ids, origin_ip)
          			VALUES (?, ?, ?, ?, ?)`
						)
						.run(author, levelId, now, JSON.stringify([levelId]), clientIP);
				}

				if (config.useUploadLogging) {
					await trySendDiscordWebhook(deps.uploadWebhookClient, {
						username: "Level Uploads",
						content: "",
						embeds: [
							new EmbedBuilder()
								.setTitle(name)
								.setDescription(
									`By **${author}**\n\n` +
										`**[Play](<${config.gameUrl}/?izl_id=${levelId}>)** | ` +
										`[Download](<${config.backendUrl}/api/levels/${levelId}/download>)`
								)
								.setAuthor({
									name: "New level uploaded",
								}),
						],
					});
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
	app.get("/api/levels", async (req: any, res: any) => {
		try {
			const requestedToken = typeof req.query?.token === "string" ? req.query.token : "";
			const tokenLevelId = requestedToken ? dbCtx.getTokenLevelId(requestedToken) : null;
			if (requestedToken && tokenLevelId === null) {
				return res.status(401).json({ error: "Invalid token" });
			}

			const page = tokenLevelId !== null ? 1 : parseInt(String(req.query.page)) || 1;
			const limit = tokenLevelId !== null ? 1 : parseInt(String(req.query.limit)) || 10;
			const offset = tokenLevelId !== null ? 0 : (page - 1) * limit;

			const sort = String(req.query.sort ?? "").toLowerCase();
			const reversedOrder = req.query.reversed_order === "true" || req.query.reversed_order === "1";
			const orderDirection = reversedOrder ? "ASC" : "DESC";
			const orderColumn = sort === "recent" ? "created_at" : sort === "favorites" ? "favorites" : "plays";

			const filters: string[] = [];
			const params: (string | number)[] = [];

			if (tokenLevelId !== null) {
				filters.push("id = ?");
				params.push(tokenLevelId);
			}

			if (tokenLevelId === null && req.query.author) {
				filters.push("author LIKE ?");
				params.push(`%${req.query.author}%`);
			}

			if (tokenLevelId === null && req.query.is_water !== undefined) {
				filters.push("is_water = ?");
				params.push(req.query.is_water === "true" ? 1 : 0);
			}

			if (tokenLevelId === null && req.query.version !== undefined) {
				const version = parseInt(String(req.query.version));
				filters.push("version = ?");
				params.push(version);
			}

			let query = `SELECT id, name, author, created_at, sun, is_water, favorites, plays, difficulty, version FROM levels`;

			if (filters.length > 0) {
				query += " WHERE " + filters.join(" AND ");
			}

			query += ` ORDER BY ${orderColumn} ${orderDirection}, id ${orderDirection} LIMIT ? OFFSET ?`;
			params.push(limit, offset);

			const levels = dbCtx.db.prepare(query).all(...params);

			type LevelRow = {
				id: number;
				version: number;
				[key: string]: unknown;
			};

			const levelsWithThumbnail = await Promise.all(
				(levels as LevelRow[]).map(async (level) => {
					const { decoded, decodeError } = await decodeLevelFromDisk(dbCtx.dataFolderPath, level.id, level.version);
					if (decodeError || !decoded) {
						return { ...level, thumbnail: null };
					}
					const thumbnail = decoded.plants.map((plant: any) => [
						allPlantsStringArray.indexOf(plant.plantName),
						plant.eleLeft,
						plant.eleTop,
						plant.eleWidth,
						plant.eleHeight,
						plant.zIndex,
					]);
					return { ...level, thumbnail };
				})
			);

			let countQuery = "SELECT COUNT(*) as count FROM levels";
			if (filters.length > 0) {
				countQuery += " WHERE " + filters.join(" AND ");
			}

			const countParams = params.slice(0, params.length - 2);
			const countResult = dbCtx.db.prepare(countQuery).get(...countParams);
			const totalCount = countResult ? (countResult as { count: number }).count : 0;

			if (tokenLevelId !== null && totalCount === 0) {
				return res.status(404).json({ error: "Level not found" });
			}

			res.json({
				levels: levelsWithThumbnail,
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
	app.get("/api/levels/:id", async (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (isNaN(levelId)) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			type LevelRow = {
				id: number;
				version: number;
				[key: string]: unknown;
			};

			const level = dbCtx.db
				.prepare(
					`SELECT id, name, author, created_at, sun, is_water, favorites, plays, difficulty, version
      				FROM levels WHERE id = ?`
				)
				.get(levelId);

			if (!level) {
				return res.status(404).json({ error: "Level not found" });
			}

			const typedLevel = level as LevelRow;
			const { decoded, decodeError } = await decodeLevelFromDisk(dbCtx.dataFolderPath, typedLevel.id, typedLevel.version);
			if (decodeError || !decoded) {
				return res.json({ ...typedLevel, thumbnail: null });
			}

			const thumbnail = decoded.plants.map((plant: any) => [
				allPlantsStringArray.indexOf(plant.plantName),
				plant.eleLeft,
				plant.eleTop,
				plant.eleWidth,
				plant.eleHeight,
				plant.zIndex,
			]);

			res.json({ ...typedLevel, thumbnail });
		} catch (error) {
			console.error("Error getting level:", error);
			res.status(500).json({
				error: "Failed to get level",
				message: (error as Error).message,
			});
		}
	});

	// download a level
	app.get("/api/levels/:id/download", (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (isNaN(levelId)) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const level = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId);

			if (!level) {
				return res.status(404).json({ error: "Level not found" });
			}

			dbCtx.db.prepare("UPDATE levels SET plays = plays + 1 WHERE id = ?").run(levelId);

			type LevelRecord = {
				id: number;
				name: string;
				author: string;
				version: number;
				is_water: number;
			};

			const typedLevel = level as LevelRecord;

			const fileExtension = `izl${typedLevel.version || 3}`;
			const filePath = `${dbCtx.dataFolderPath}/${levelId}.${fileExtension}`;

			try {
				const fileContent = Deno.readFileSync(filePath);

				res.setHeader("Content-Type", "application/octet-stream");
				res.setHeader("Content-Disposition", `attachment; filename="${typedLevel.name.replace(/[^a-zA-Z0-9]/g, "_")}.${fileExtension}"`);
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

	// report a level
	app.post("/api/levels/:id/report", async (req: any, res: any) => {
		try {
			if (!config.useReporting) {
				return res.status(404).json({ error: "Reporting is disabled" });
			}

			const levelId = parseInt(req.params.id);
			const { reason } = req.body as { reason: string };
			const level = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId);

			if (!level) {
				return res.status(404).json({ error: "Level not found" });
			}

			type LevelRecord = {
				id: number;
				name: string;
				author: string;
				version?: number | null;
			};

			const typedLevel = level as LevelRecord;

			if (deps.reportWebhookClient) {
				const version = typedLevel.version ?? 3;
				const fileExtension = `izl${version || 3}`;
				const filePath = `${dbCtx.dataFolderPath}/${levelId}.${fileExtension}`;

				const safeName = (typedLevel.name || `level_${levelId}`).replace(/[^a-zA-Z0-9]/g, "_");

				let fileContent: Uint8Array | null = null;
				try {
					fileContent = Deno.readFileSync(filePath);
				} catch (fileError) {
					console.error("Error reading level file for report:", fileError);
				}

				const mentionString = (function (): string {
					if (config.discordMentionUserIds.length === 0) return "";
					return config.discordMentionUserIds.map((m) => `<@${m}>`).join(" ");
				})();

				await trySendDiscordWebhook(deps.reportWebhookClient, {
					username: "Level Reports",
					content:
						`${mentionString} New level report received:\n` +
						`Level ID: ${levelId}\n` +
						`Level Name: ${typedLevel.name}\n` +
						`Author: ${typedLevel.author}\n` +
						`Reason: ${reason}\n` +
						`Reported from IP: ${getClientIP(req)}\n` +
						`**[Edit level metadata](<${config.backendUrl}/admin.html?token=${encodeURIComponent(
							dbCtx.createOneTimeTokenForLevel(levelId)
						)}&action=edit&level=${levelId}>)**` +
						` | **[Delete level](<${config.backendUrl}/admin.html?token=${encodeURIComponent(
							dbCtx.createOneTimeTokenForLevel(levelId)
						)}&action=delete&level=${levelId}>)**` +
						` | **[View level](<${config.gameUrl}/?izl_id=${levelId}>)**` +
						(fileContent ? "" : "\n\n(Attachment missing: level file not found)"),
					...(fileContent
						? {
								files: [
									{
										attachment: Buffer.from(fileContent),
										name: `${safeName}.${fileExtension}`,
									},
								],
							}
						: {}),
				});
			}

			res.json({ success: true });
		} catch (error) {
			console.error("Error reporting level:", error);
			res.status(500).json({
				error: "Failed to report level",
				message: (error as Error).message,
			});
		}
	});

	function setFavorite(levelId: number, clientIP: string, favorite: boolean) {
		const now = Math.floor(Date.now() / 1000);
		if (favorite) {
			dbCtx.db.prepare("INSERT OR IGNORE INTO favorites (level_id, ip_address, created_at) VALUES (?, ?, ?)").run(levelId, clientIP, now);
		} else {
			dbCtx.db.prepare("DELETE FROM favorites WHERE level_id = ? AND ip_address = ?").run(levelId, clientIP);
		}
		dbCtx.recomputeFavorites(levelId);
	}

	function favoriteToggleRouteHandler(req: any, res: any) {
		try {
			const levelId = parseInt(req.params.id);

			if (isNaN(levelId)) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const level = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId);

			if (!level) {
				return res.status(404).json({ error: "Level not found" });
			}

			const clientIP = getClientIP(req);
			const existingFavorite = dbCtx.db.prepare("SELECT 1 FROM favorites WHERE level_id = ? AND ip_address = ? LIMIT 1").get(levelId, clientIP);
			setFavorite(levelId, clientIP, !existingFavorite);

			const updatedLevel = dbCtx.db
				.prepare(
					`SELECT id, name, author, favorites
					 FROM levels WHERE id = ?`
				)
				.get(levelId);

			res.json({ success: true, level: updatedLevel });
		} catch (error) {
			console.error("Error favoriting level:", error);
			res.status(500).json({
				error: "Failed to favorite level",
				message: (error as Error).message,
			});
		}
	}

	app.post("/api/levels/:id/favorite", favoriteToggleRouteHandler);
}

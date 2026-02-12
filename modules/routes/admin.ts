import type { ServerConfig } from "../config.ts";
import type { DbContext, LevelRecord } from "../db.ts";
import type { LoggingManager } from "../logging/index.ts";
import { decodeLevelFromDisk, encodeIZL3FileToDisk } from "../levels_io.ts";
import { postHogClient } from "../posthog.ts";
import { getClientIP } from "../request.ts";

export function registerAdminRoutes(
	app: any,
	config: ServerConfig,
	dbCtx: DbContext,
	deps: {
		ensureAuthenticated: any;
		ensureAuthenticatedOrConsumeTokenForLevelParam: any;
		loggingManager: LoggingManager;
	}
) {
	// get all levels with pagination and search
	app.get("/api/admin/levels", deps.ensureAuthenticated, (req: any, res: any) => {
		try {
			const page = parseInt(req.query.page) || 1;
			const limit = parseInt(req.query.limit) || 10;
			const searchQuery = req.query.q || "";

			const offset = (page - 1) * limit;

			let queryParams: (string | number)[] = [];
			let countQueryParams: (string | number)[] = [];
			let whereClause = "";

			if (searchQuery) {
				whereClause = `WHERE name LIKE ? OR author LIKE ? OR id = ?`;
				const likeParam = `%${searchQuery}%`;
				queryParams = [likeParam, likeParam, searchQuery];
				countQueryParams = [...queryParams];
			}

			const countQuery = `SELECT COUNT(*) as count FROM levels ${whereClause}`;
			const countResult = dbCtx.db.prepare(countQuery).get(...countQueryParams);
			const total = countResult ? (countResult as { count: number }).count : 0;

			const query = `
				SELECT id, name, author, created_at, sun, is_water, favorites, plays, difficulty, version, featured, featured_at
				FROM levels ${whereClause}
				ORDER BY id DESC
				LIMIT ? OFFSET ?
			`;

			queryParams.push(limit, offset);
			const levels = dbCtx.db.prepare(query).all(...queryParams);

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

	// generate a one-time token scoped to a specific level (admin only)
	app.post("/api/admin/levels/:id/token", deps.ensureAuthenticated, (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);
			if (!Number.isFinite(levelId) || levelId <= 0) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const exists = dbCtx.db.prepare("SELECT 1 FROM levels WHERE id = ?").get(levelId);
			if (!exists) {
				return res.status(404).json({ error: "Level not found" });
			}

			const token = dbCtx.createOneTimeTokenForLevel(levelId);
			res.json({ token, level_id: levelId });
		} catch (error) {
			console.error("Error generating one-time token:", error);
			res.status(500).json({
				error: "Failed to generate token",
				message: (error as Error).message,
			});
		}
	});

	// update a level (admin only)
	app.put("/api/admin/levels/:id", deps.ensureAuthenticatedOrConsumeTokenForLevelParam, async (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (!levelId) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const existingLevel = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId) as LevelRecord | undefined;

			if (!existingLevel) {
				return res.status(404).json({ error: "Level not found" });
			}

			const { name, author, sun, is_water, difficulty, favorites, plays, featured, featured_at } = req.body;

			// build update query dynamically to only update provided fields
			const updates: string[] = [];
			const updateParams: any[] = [];

			if (name !== undefined) {
				updates.push("name = ?");
				updateParams.push(name);
			}
			if (author !== undefined) {
				updates.push("author = ?");
				updateParams.push(author);
			}
			if (sun !== undefined) {
				updates.push("sun = ?");
				updateParams.push(sun);
			}
			if (is_water !== undefined) {
				updates.push("is_water = ?");
				updateParams.push(is_water);
			}
			if (difficulty !== undefined) {
				updates.push("difficulty = ?");
				updateParams.push(difficulty);
			}
			if (favorites !== undefined) {
				updates.push("favorites = ?");
				updateParams.push(favorites);
			}
			if (plays !== undefined) {
				updates.push("plays = ?");
				updateParams.push(plays);
			}
			if (featured !== undefined) {
				updates.push("featured = ?");
				updateParams.push(featured);
			}
			if (featured_at !== undefined) {
				updates.push("featured_at = ?");
				updateParams.push(featured_at);
			}

			if (updates.length === 0) {
				return res.status(400).json({ error: "No fields to update" });
			}

			updateParams.push(levelId);

			dbCtx.db.prepare(`UPDATE levels SET ${updates.join(", ")} WHERE id = ?`).run(...updateParams);

			const updatedLevel = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId);

			// now update the level file on disk if name or sun changed
			if (name !== existingLevel.name || sun !== existingLevel.sun) {
				const levelData = await decodeLevelFromDisk(dbCtx.dataFolderPath, levelId, existingLevel.version);
				if (levelData.decoded) {
					levelData.decoded.name = name;
					levelData.decoded.sun = sun;

					encodeIZL3FileToDisk(dbCtx.dataFolderPath, levelId, levelData.decoded);
				}
			}

			// update logging messages if name or author changed
			const typedUpdatedLevel = updatedLevel as LevelRecord;
			const changes: string[] = [];
			if (name !== undefined && name !== existingLevel.name) {
				changes.push(`Name: "${existingLevel.name}" → "${name}"`);
			}
			if (author !== undefined && author !== existingLevel.author) {
				changes.push(`Author: "${existingLevel.author}" → "${author}"`);
			}
			if (sun !== undefined && sun !== existingLevel.sun) {
				changes.push(`Sun: ${existingLevel.sun} → ${sun}`);
			}
			if (difficulty !== undefined && difficulty !== existingLevel.difficulty) {
				changes.push(`Difficulty: ${existingLevel.difficulty} → ${difficulty}`);
			}
			if (favorites !== undefined && favorites !== existingLevel.favorites) {
				changes.push(`Favorites: ${existingLevel.favorites} → ${favorites}`);
			}
			if (plays !== undefined && plays !== existingLevel.plays) {
				changes.push(`Plays: ${existingLevel.plays} → ${plays}`);
			}

			if (changes.length > 0) {
				// update logging messages (fire-and-forget, don't block the response)
				if (typedUpdatedLevel.logging_data) {
					const levelInfo = {
						id: levelId,
						name: typedUpdatedLevel.name,
						author: typedUpdatedLevel.author,
						gameUrl: config.gameUrl,
						backendUrl: config.backendUrl,
					};

					const adminLevelInfo = {
						...levelInfo,
						editUrl: `${config.backendUrl}/admin.html?token=${encodeURIComponent(
							dbCtx.createOneTimeTokenForLevel(levelId)
						)}&action=edit&level=${levelId}`,
						deleteUrl: `${config.backendUrl}/admin.html?token=${encodeURIComponent(
							dbCtx.createOneTimeTokenForLevel(levelId)
						)}&action=delete&level=${levelId}`,
					};

					Promise.allSettled([
						deps.loggingManager.editLevelMessage(typedUpdatedLevel.logging_data, levelInfo),
						deps.loggingManager.editAdminLevelMessage(typedUpdatedLevel.logging_data, adminLevelInfo),
					]).catch((err) => console.error("Warning: Failed to update logging messages for level", levelId, err));
				}

				deps.loggingManager
					.sendAuditLog({
						action: "edit",
						levelId,
						levelName: typedUpdatedLevel.name,
						author: typedUpdatedLevel.author,
						changes: changes.join("\n"),
					})
					.catch((err) => console.error("Warning: Failed to send audit log for level edit", levelId, err));
			}

			// send to posthog
			if (postHogClient) {
				postHogClient.capture({
					distinctId: req.user?.username ?? getClientIP(req),
					event: "admin_level_edited",
					properties: {
						level_id: levelId,
						changes: changes,
					},
				});
			}

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

	// feature a level (admin only)
	app.post("/api/admin/levels/:id/feature", deps.ensureAuthenticated, async (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (!Number.isFinite(levelId) || levelId <= 0) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const exists = dbCtx.db.prepare("SELECT logging_data FROM levels WHERE id = ?").get(levelId) as { logging_data: string | null } | undefined;
			if (!exists) {
				return res.status(404).json({ error: "Level not found" });
			}

			const now = Math.floor(Date.now() / 1000);
			dbCtx.db.prepare("UPDATE levels SET featured = 1, featured_at = ? WHERE id = ?").run(now, levelId);

			const updatedLevel = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId) as LevelRecord;

			await deps.loggingManager.sendAuditLog({
				action: "feature",
				levelId,
				levelName: updatedLevel.name,
				author: updatedLevel.author,
			});

			// send featured message to logging providers (e.g., bluesky)
			const loggingData = await deps.loggingManager.sendFeaturedMessage(
				{
					id: levelId,
					name: updatedLevel.name,
					author: updatedLevel.author,
					gameUrl: config.gameUrl,
					backendUrl: config.backendUrl,
					featuredAt: now,
				},
				exists.logging_data
			);

			if (loggingData) {
				dbCtx.db.prepare("UPDATE levels SET logging_data = ? WHERE id = ?").run(loggingData, levelId);
			}

			// send to posthog
			if (postHogClient) {
				postHogClient.capture({
					distinctId: req.user?.username ?? getClientIP(req),
					event: "admin_level_featured",
					properties: {
						level_id: levelId,
					},
				});
			}

			res.json({ success: true, level: updatedLevel });
		} catch (error) {
			console.error("Error featuring level:", error);
			res.status(500).json({
				error: "Failed to feature level",
				message: (error as Error).message,
			});
		}
	});

	// unfeature a level (admin only)
	app.delete("/api/admin/levels/:id/feature", deps.ensureAuthenticated, async (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (!Number.isFinite(levelId) || levelId <= 0) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const levelRow = dbCtx.db.prepare("SELECT logging_data FROM levels WHERE id = ?").get(levelId) as { logging_data: string | null } | undefined;
			if (!levelRow) {
				return res.status(404).json({ error: "Level not found" });
			}

			// delete featured message from logging providers (e.g., bluesky)
			const loggingData = await deps.loggingManager.deleteFeaturedMessage(levelRow.logging_data);

			dbCtx.db.prepare("UPDATE levels SET featured = 0, featured_at = NULL, logging_data = ? WHERE id = ?").run(loggingData, levelId);

			const updatedLevel = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId) as LevelRecord;

			await deps.loggingManager.sendAuditLog({
				action: "unfeature",
				levelId,
				levelName: updatedLevel.name,
				author: updatedLevel.author,
			});

			// send to posthog
			if (postHogClient) {
				postHogClient.capture({
					distinctId: req.user?.username ?? getClientIP(req),
					event: "admin_level_unfeatured",
					properties: {
						level_id: levelId,
					},
				});
			}

			res.json({ success: true, level: updatedLevel });
		} catch (error) {
			console.error("Error unfeaturing level:", error);
			res.status(500).json({
				error: "Failed to unfeature level",
				message: (error as Error).message,
			});
		}
	});

	// delete a level (admin only)
	app.delete("/api/admin/levels/:id", deps.ensureAuthenticatedOrConsumeTokenForLevelParam, async (req: any, res: any) => {
		try {
			const levelId = parseInt(req.params.id);

			if (!levelId) {
				return res.status(400).json({ error: "Invalid level ID" });
			}

			const existingLevel = dbCtx.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId);

			if (!existingLevel) {
				return res.status(404).json({ error: "Level not found" });
			}

			const typedLevel = existingLevel as LevelRecord;

			// delete the level from the database first (critical operation)
			dbCtx.db.prepare("DELETE FROM favorites WHERE level_id = ?").run(levelId);
			dbCtx.db.prepare("DELETE FROM levels WHERE id = ?").run(levelId);

			// clean up logging messages (fire-and-forget, don't block the response)
			if (typedLevel.logging_data) {
				Promise.allSettled([
					deps.loggingManager.deleteLevelMessage(typedLevel.logging_data),
					deps.loggingManager.deleteAdminLevelMessage(typedLevel.logging_data),
					deps.loggingManager.deleteFeaturedMessage(typedLevel.logging_data),
				]).catch((err) => console.error("Warning: Failed to clean up logging messages for level", levelId, err));
			}

			deps.loggingManager
				.sendAuditLog({
					action: "delete",
					levelId,
					levelName: typedLevel.name,
					author: typedLevel.author,
				})
				.catch((err) => console.error("Warning: Failed to send audit log for level deletion", levelId, err));

			try {
				const fileExtension = `izl${typedLevel.version || 3}`;
				const levelPath = `${dbCtx.dataFolderPath}/${levelId}.${fileExtension}`;
				await Deno.remove(levelPath);
			} catch (fileError) {
				console.error("Warning: Could not delete level file:", fileError);
			}

			const authors = dbCtx.db.prepare("SELECT * FROM authors").all() as any[];
			for (const author of authors) {
				try {
					const levelIds = JSON.parse(author.level_ids);
					const updatedLevelIds = levelIds.filter((id: number) => id !== levelId);

					if (levelIds.length !== updatedLevelIds.length) {
						dbCtx.db.prepare("UPDATE authors SET level_ids = ? WHERE id = ?").run(JSON.stringify(updatedLevelIds), author.id);
					}
				} catch (parseError) {
					console.error("Error parsing level_ids for author:", parseError);
				}
			}

			// send to posthog
			if (postHogClient) {
				postHogClient.capture({
					distinctId: req.user?.username ?? getClientIP(req),
					event: "admin_level_deleted",
					properties: {
						level_id: levelId,
					},
				});
			}

			res.json({ success: true });
		} catch (error) {
			console.error("Error deleting level:", error);
			res.status(500).json({
				error: "Failed to delete level",
				message: (error as Error).message,
			});
		}
	});
}

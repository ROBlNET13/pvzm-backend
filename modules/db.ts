import { Database } from "@db/sqlite";

import type { ServerConfig } from "./config.ts";

export type DbContext = {
	db: Database;
	dataFolderPath: string;
	recomputeFavorites: (levelId: number) => void;
	createOneTimeTokenForLevel: (levelId: number) => string;
	getTokenLevelId: (token: string) => number | null;
	consumeOneTimeTokenForLevel: (token: string, levelId: number) => boolean;
};

export type LevelRecord = {
	id: number;
	name: string;
	author: string;
	sun: number;
	is_water: number;
	difficulty: number;
	favorites: number;
	plays: number;
	version: number;
	featured: number;
	featured_at: number | null;
	logging_data: string | null;
};

function tableHasColumn(db: Database, tableName: string, columnName: string) {
	try {
		const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
		return cols.some((c) => c?.name === columnName);
	} catch (_err) {
		return false;
	}
}

function recomputeFavorites(db: Database, levelId: number) {
	db.prepare(
		`UPDATE levels
		 SET favorites = (
			SELECT COUNT(*) FROM favorites WHERE favorites.level_id = ?
		 )
		 WHERE id = ?`
	).run(levelId, levelId);
}

function generateOneTimeToken(): string {
	// 24 bytes -> ~32 chars base64url (no padding)
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	const base64url = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
	return `token_${base64url}`;
}

export function initDatabase(config: ServerConfig): DbContext {
	const db = new Database(config.dbPath);

	// levels
	db.prepare(`
  		CREATE TABLE IF NOT EXISTS levels (
    		id INTEGER PRIMARY KEY AUTOINCREMENT,
    		name TEXT NOT NULL,
    		author TEXT NOT NULL,
    		created_at INTEGER NOT NULL, 
    		sun INTEGER NOT NULL,
    		is_water INTEGER NOT NULL, 
			favorites INTEGER NOT NULL DEFAULT 0,
    		plays INTEGER NOT NULL DEFAULT 0,
    		difficulty INTEGER, 
    		author_id INTEGER,
			version INTEGER DEFAULT 3
  		)
	`).run();

	// authors
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

	// favorites
	db.prepare(`
		CREATE TABLE IF NOT EXISTS favorites (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  level_id INTEGER NOT NULL,
		  ip_address TEXT NOT NULL,
		  created_at INTEGER NOT NULL,
		  UNIQUE(level_id, ip_address)
		)
	`).run();

	// one-time admin tokens
	db.prepare(`
		CREATE TABLE IF NOT EXISTS admin_tokens (
			token TEXT PRIMARY KEY,
			level_id INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		)
	`).run();

	try {
		db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_tokens_level_id ON admin_tokens(level_id)").run();
	} catch (indexError) {
		console.error("Admin tokens index creation error:", indexError);
	}

	// lightweight runtime migration: favorites
	try {
		if (!tableHasColumn(db, "levels", "favorites")) {
			db.prepare("ALTER TABLE levels ADD COLUMN favorites INTEGER NOT NULL DEFAULT 0").run();
		}

		db.prepare(
			`UPDATE levels
			 SET favorites = (
				SELECT COUNT(*) FROM favorites WHERE favorites.level_id = levels.id
			 )`
		).run();
	} catch (migrationError) {
		console.error("Favorites migration error:", migrationError);
	}

	// lightweight runtime migration: featured system
	try {
		if (!tableHasColumn(db, "levels", "featured")) {
			db.prepare("ALTER TABLE levels ADD COLUMN featured INTEGER NOT NULL DEFAULT 0").run();
		}
		if (!tableHasColumn(db, "levels", "featured_at")) {
			db.prepare("ALTER TABLE levels ADD COLUMN featured_at INTEGER").run();
		}
	} catch (migrationError) {
		console.error("Featured migration error:", migrationError);
	}

	// lightweight runtime migration: logging data (provider message IDs as JSON)
	try {
		if (!tableHasColumn(db, "levels", "logging_data")) {
			db.prepare("ALTER TABLE levels ADD COLUMN logging_data TEXT").run();
		}

		// migrate old flat logging_data format to nested structure
		// old: { "discord": "msg_id" } -> new: { "discord": { "public": "msg_id" } }
		const levelsWithOldFormat = db.prepare("SELECT id, logging_data FROM levels WHERE logging_data IS NOT NULL").all() as {
			id: number;
			logging_data: string;
		}[];

		let migratedCount = 0;
		for (const level of levelsWithOldFormat) {
			try {
				const data = JSON.parse(level.logging_data);
				let needsMigration = false;

				// check if any provider has flat string value instead of object
				for (const [provider, value] of Object.entries(data)) {
					if (typeof value === "string") {
						needsMigration = true;
						data[provider] = { public: value };
					}
				}

				if (needsMigration) {
					db.prepare("UPDATE levels SET logging_data = ? WHERE id = ?").run(JSON.stringify(data), level.id);
					migratedCount++;
				}
			} catch {
				// skip levels with invalid JSON
			}
		}
		if (migratedCount > 0) {
			console.log(`Migrated ${migratedCount} levels from flat to nested logging_data format`);
		}

		// migrate old admin_logging_data into unified logging_data structure
		if (tableHasColumn(db, "levels", "admin_logging_data")) {
			const levelsToMigrate = db.prepare("SELECT id, logging_data, admin_logging_data FROM levels WHERE admin_logging_data IS NOT NULL").all() as {
				id: number;
				logging_data: string | null;
				admin_logging_data: string | null;
			}[];

			for (const level of levelsToMigrate) {
				try {
					const existingData = level.logging_data ? JSON.parse(level.logging_data) : {};
					const adminData = JSON.parse(level.admin_logging_data!);

					// merge admin message IDs into unified structure
					// old format: { "discord": "msg_id" }
					// new format: { "discord": { "public": "...", "admin": "msg_id" } }
					for (const [provider, messageId] of Object.entries(adminData)) {
						if (!existingData[provider]) existingData[provider] = {};
						existingData[provider].admin = messageId;
					}

					db.prepare("UPDATE levels SET logging_data = ? WHERE id = ?").run(JSON.stringify(existingData), level.id);
				} catch {
					// skip levels with invalid JSON
				}
			}
			console.log(`Migrated ${levelsToMigrate.length} levels from admin_logging_data to unified logging_data`);

			// drop the old column
			db.prepare("ALTER TABLE levels DROP COLUMN admin_logging_data").run();
			console.log("Dropped admin_logging_data column");
		}
	} catch (migrationError) {
		console.error("Logging data migration error:", migrationError);
	}

	function createOneTimeTokenForLevel(levelId: number): string {
		const now = Math.floor(Date.now() / 1000);
		for (let attempt = 0; attempt < 8; attempt++) {
			const token = generateOneTimeToken();
			try {
				db.prepare("INSERT INTO admin_tokens (token, level_id, created_at) VALUES (?, ?, ?)").run(token, levelId, now);
				return token;
			} catch (err) {
				const msg = String(err);
				if (msg.includes("UNIQUE") || msg.toLowerCase().includes("constraint")) {
					continue;
				}
				throw err;
			}
		}
		throw new Error("Failed to generate unique token");
	}

	function getTokenLevelId(token: string): number | null {
		const row = db.prepare("SELECT level_id FROM admin_tokens WHERE token = ?").get(token) as any;
		if (!row) return null;
		const levelId = Number(row.level_id);
		return Number.isFinite(levelId) ? levelId : null;
	}

	function consumeOneTimeTokenForLevel(token: string, levelId: number): boolean {
		const changes = db.prepare("DELETE FROM admin_tokens WHERE token = ? AND level_id = ?").run(token, levelId);
		return changes === 1;
	}

	return {
		db,
		dataFolderPath: config.dataFolderPath,
		recomputeFavorites: (levelId: number) => recomputeFavorites(db, levelId),
		createOneTimeTokenForLevel,
		getTokenLevelId,
		consumeOneTimeTokenForLevel,
	};
}

export function ensureDataFolder(config: ServerConfig) {
	if (!config.createDataFolder) return;
	try {
		Deno.mkdirSync(config.dataFolderPath, { recursive: true });
		console.log(`Created data folder at: ${config.dataFolderPath}`);
	} catch (error) {
		if (error instanceof Deno.errors.AlreadyExists) {
			// no-op
		} else {
			console.error(`Error creating data folder: ${(error as Error).message}`);
		}
	}
}

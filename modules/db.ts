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
	db.prepare(
		`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id INTEGER NOT NULL,
    ip_address TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(level_id, ip_address)
  )
`
	).run();

	// one-time admin tokens
	db.prepare(
		`
	CREATE TABLE IF NOT EXISTS admin_tokens (
		token TEXT PRIMARY KEY,
		level_id INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	)
`
	).run();

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

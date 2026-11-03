// DB layer — same pattern as the League site (src/lib/server/db.js there):
// Postgres via `pg` Pool when DATABASE_URL is set; otherwise a local SQLite file
// (data/app.db) via node:sqlite so the app runs with zero setup locally.
// (SQLite on Vercel would be ephemeral — production must set DATABASE_URL.)
//
// SQL is kept portable: TEXT ids generated in JS, JSON as TEXT, ISO timestamps as
// TEXT, booleans as INTEGER. The query() wrapper translates $n placeholders to ?
// for SQLite and returns a plain array of row objects either way.

import fs from 'node:fs';
import path from 'node:path';

const usePg = !!process.env.DATABASE_URL;

let pool = null;
let sqlite = null;
let initPromise = null;

async function backend() {
	if (usePg) {
		if (!pool) {
			const pg = (await import('pg')).default;
			pool = new pg.Pool({
				connectionString: process.env.DATABASE_URL,
				ssl: { rejectUnauthorized: false }
			});
		}
		return 'pg';
	}
	if (!sqlite) {
		const { DatabaseSync } = await import('node:sqlite');
		const dir = path.join(process.cwd(), 'data');
		fs.mkdirSync(dir, { recursive: true });
		sqlite = new DatabaseSync(path.join(dir, 'app.db'));
	}
	return 'sqlite';
}

const TABLES = [
	`CREATE TABLE IF NOT EXISTS entrants (
		id TEXT PRIMARY KEY, name TEXT UNIQUE, pin_hash TEXT, salt TEXT, created_at TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS players (
		id TEXT PRIMARY KEY, name TEXT, team TEXT, position TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS rosters (
		entrant_id TEXT, player_id TEXT, PRIMARY KEY (entrant_id, player_id)
	)`,
	`CREATE TABLE IF NOT EXISTS doubler_picks (
		entrant_id TEXT, round TEXT, player_id TEXT, submitted_at TEXT,
		PRIMARY KEY (entrant_id, round)
	)`,
	`CREATE TABLE IF NOT EXISTS player_scores (
		player_id TEXT, round TEXT, stat_line_json TEXT, points REAL,
		PRIMARY KEY (player_id, round)
	)`,
	`CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY, value TEXT
	)`
];

/** Create tables idempotently. Safe to call on every boot. */
export function initDb() {
	if (!initPromise) {
		initPromise = (async () => {
			const kind = await backend();
			for (const ddl of TABLES) {
				if (kind === 'pg') await pool.query(ddl);
				else sqlite.exec(ddl);
			}
		})();
	}
	return initPromise;
}

/**
 * Run a parameterized query. Returns an array of rows (empty for writes).
 * SQL must use $1..$n placeholders in both backends.
 */
export async function query(sql, params = []) {
	await initDb();
	const kind = await backend();
	if (kind === 'pg') {
		const { rows } = await pool.query(sql, params);
		return rows;
	}
	const translated = sql.replace(/\$\d+/g, '?');
	const verb = sql.trimStart().slice(0, 6).toUpperCase();
	const stmt = sqlite.prepare(translated);
	if (verb.startsWith('SELECT')) return stmt.all(...params);
	stmt.run(...params);
	return [];
}

export const dbKind = usePg ? 'postgres' : 'sqlite';

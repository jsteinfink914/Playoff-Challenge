// Server-side store: seeding, settings, PIN auth, admin auth, shared reads.
// Everything goes through the portable query() wrapper in db.js.

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { query } from './db.js';
import { getContest } from './contest.js';
import { computePoints } from '../core.js';
import { ROUND_IDS } from '../config.js';

let seedPromise = null;

/** Seed pool + default settings if the DB is empty. Idempotent. */
export function ensureSeeded() {
	if (!seedPromise) {
		seedPromise = (async () => {
			const rows = await query('SELECT COUNT(*) AS n FROM players');
			if (Number(rows[0].n) === 0) await seedAll(false);
		})();
	}
	return seedPromise;
}

/**
 * Full (re)seed: wipes entrants/rosters/picks/scores and reloads the active
 * contest (shadow if src/lib/shadow-data.json exists, else the demo).
 * Returns the active contest mode ('shadow' | 'demo').
 */
export async function reseed() {
	await seedAll(true);
	return (await getContest()).mode;
}

async function seedAll(wipe) {
	const contest = await getContest();
	if (wipe) {
		for (const t of ['rosters', 'doubler_picks', 'player_scores', 'entrants', 'players', 'settings']) {
			await query(`DELETE FROM ${t}`);
		}
	}
	for (const p of contest.players) {
		await query('INSERT INTO players (id, name, team, position) VALUES ($1,$2,$3,$4)', [p.id, p.name, p.team, p.position]);
	}
	let defaults;
	if (contest.locks) {
		// Fixed locks from the active contest (shadow mode).
		defaults = {
			...contest.locks,
			allow_repeat_doubler: contest.allowRepeatDoubler ? 'true' : 'false',
			teams_by_round: JSON.stringify(contest.teamsByRound),
			round_labels: JSON.stringify(contest.roundLabels || {})
		};
	} else {
		// Demo locks: comfortably in the future so the demo is usable out of the box.
		// In January these get set to the real kickoff times via /admin.
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		defaults = {
			roster_lock_at: new Date(now + 30 * day).toISOString(),
			lock_WC: new Date(now + 30 * day).toISOString(),
			lock_DIV: new Date(now + 37 * day).toISOString(),
			lock_CONF: new Date(now + 44 * day).toISOString(),
			lock_SB: new Date(now + 58 * day).toISOString(),
			allow_repeat_doubler: contest.allowRepeatDoubler ? 'true' : 'false',
			teams_by_round: JSON.stringify(contest.teamsByRound),
			round_labels: JSON.stringify(contest.roundLabels || {})
		};
	}
	for (const [k, v] of Object.entries(defaults)) {
		await query('INSERT INTO settings (key, value) VALUES ($1,$2)', [k, v]);
	}
	seedPromise = Promise.resolve();
}

export async function getSettings() {
	await ensureSeeded();
	const contest = await getContest();
	const rows = await query('SELECT key, value FROM settings');
	const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	let teamsByRound = contest.teamsByRound;
	try { teamsByRound = JSON.parse(raw.teams_by_round || '{}'); } catch { /* keep default */ }
	let roundLabels = contest.roundLabels;
	try { roundLabels = JSON.parse(raw.round_labels || 'null') || roundLabels; } catch { /* keep default */ }
	const roundLocks = {};
	for (const r of ROUND_IDS) roundLocks[r] = raw[`lock_${r}`] || null;
	return {
		rosterLockAt: raw.roster_lock_at || null,
		roundLocks,
		allowRepeatDoubler: raw.allow_repeat_doubler !== 'false',
		teamsByRound,
		roundLabels
	};
}

export async function setSetting(key, value) {
	await ensureSeeded();
	await query('DELETE FROM settings WHERE key = $1', [key]);
	await query('INSERT INTO settings (key, value) VALUES ($1,$2)', [key, String(value)]);
}

/** Read one raw settings value (null when unset). getSettings() is the structured view. */
export async function getSetting(key) {
	await ensureSeeded();
	const rows = await query('SELECT value FROM settings WHERE key = $1', [key]);
	return rows[0]?.value ?? null;
}

export async function getPool() {
	await ensureSeeded();
	return query('SELECT id, name, team, position FROM players ORDER BY team, position, name');
}

/** The active contest's teams (shadow favorites or demo field), in seed order. */
export async function getTeams() {
	await ensureSeeded();
	return (await getContest()).teams;
}

// ---------- PIN auth ----------

export function hashPin(pin, salt) {
	return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

export function newEntrantAuth(pin) {
	const salt = randomBytes(16).toString('hex');
	return { salt, pinHash: hashPin(pin, salt) };
}

export function pinMatches(entrant, pin) {
	if (!entrant || typeof pin !== 'string') return false;
	const a = Buffer.from(hashPin(pin, entrant.salt));
	const b = Buffer.from(entrant.pin_hash);
	return a.length === b.length && timingSafeEqual(a, b);
}

export async function getEntrant(id) {
	await ensureSeeded();
	const rows = await query('SELECT * FROM entrants WHERE id = $1', [id]);
	return rows[0] || null;
}

export async function getEntrantByName(name) {
	await ensureSeeded();
	const rows = await query('SELECT * FROM entrants WHERE name = $1', [name]);
	return rows[0] || null;
}

export async function createEntrant(name, pin) {
	const { salt, pinHash } = newEntrantAuth(pin);
	const id = randomUUID();
	await query('INSERT INTO entrants (id, name, pin_hash, salt, created_at) VALUES ($1,$2,$3,$4,$5)', [
		id, name, pinHash, salt, new Date().toISOString()
	]);
	return id;
}

/** Returns the entrant row if {entrantId, pin} check out, else null. */
export async function verifyPin(entrantId, pin) {
	const entrant = await getEntrant(entrantId);
	return pinMatches(entrant, pin) ? entrant : null;
}

// ---------- Admin auth ----------

export function isAdmin(request, body) {
	const expected = process.env.ADMIN_KEY || 'commish';
	const provided = request.headers.get('x-admin-key') || body?.adminKey || '';
	const a = Buffer.from(String(provided));
	const b = Buffer.from(String(expected));
	return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Shared reads ----------

export async function getRosters() {
	const rows = await query('SELECT entrant_id, player_id FROM rosters');
	const map = {};
	for (const r of rows) (map[r.entrant_id] ||= []).push(r.player_id);
	return map;
}

export async function getDoublerPicks() {
	const rows = await query('SELECT entrant_id, round, player_id FROM doubler_picks');
	return rows.map((r) => ({ entrantId: r.entrant_id, round: r.round, playerId: r.player_id }));
}

export async function getScores() {
	const rows = await query('SELECT player_id, round, points FROM player_scores');
	return rows.map((r) => ({ playerId: r.player_id, round: r.round, points: Number(r.points) }));
}

/**
 * Compute points for a stat line with the contest scoring and upsert the
 * score row. The single write path for scores — used by the admin scores API
 * and by the automatic-scoring cron endpoint. Returns the computed points.
 */
export async function upsertScore(playerId, round, statLine) {
	const line = statLine || {};
	const points = computePoints(line);
	await query('DELETE FROM player_scores WHERE player_id = $1 AND round = $2', [playerId, round]);
	await query('INSERT INTO player_scores (player_id, round, stat_line_json, points) VALUES ($1,$2,$3,$4)', [
		playerId, round, JSON.stringify(line), points
	]);
	return points;
}

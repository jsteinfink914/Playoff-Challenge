// Weekly score loader for the SHADOW contest (and the pattern for January's
// stats feed). Fetches one NFL week's real stat lines from Sleeper for every
// player in the shadow pool and POSTs them to a RUNNING server's admin scores
// endpoint, which computes points with the contest scoring and stores them.
//
//   APP_URL=https://playoff-challenge-brown.vercel.app ADMIN_KEY=<key> \
//     node scripts/post-week-scores.mjs --week 9 --round WC
//
// Shadow mapping: WC = NFL Week 9, DIV = Week 10, CONF = Week 11.
// --dry-run fetches + computes + prints without posting (no ADMIN_KEY needed).
// ADMIN_KEY is read from the environment only — never hardcode it here.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePoints } from '../src/lib/core.js';
import { fetchJSON, toStatLine, isZeroLine } from '../src/lib/server/sleeper.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUNDS = ['WC', 'DIV', 'CONF'];

function fail(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const argVal = (flag) => {
	const i = args.indexOf(flag);
	return i >= 0 ? args[i + 1] : undefined;
};
const week = Number(argVal('--week'));
const round = argVal('--round');
if (!Number.isInteger(week) || week < 1 || week > 18) fail('Usage: node scripts/post-week-scores.mjs --week <1-18> --round <WC|DIV|CONF> [--dry-run]');
if (!ROUNDS.includes(round)) fail(`--round must be one of ${ROUNDS.join(', ')} (got: ${round || 'none'})`);

const APP_URL = (process.env.APP_URL || 'http://localhost:4173').replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!dryRun && !ADMIN_KEY) fail('ADMIN_KEY env var is required (or pass --dry-run to preview without posting).');

// --- pool (shadow-data.json carries each player's Sleeper id) ----------------
let shadow;
try {
	shadow = JSON.parse(await readFile(path.join(ROOT, 'src/lib/shadow-data.json'), 'utf8'));
} catch (e) {
	fail(`Could not read src/lib/shadow-data.json: ${e.message}`);
}
const pool = (shadow.players || []).filter((p) => p.id && p.sleeperId);
if (!pool.length) fail('Shadow pool is empty — run scripts/refresh-shadow.mjs first.');

// --- fetch the week's stats ---------------------------------------------------
const state = await fetchJSON('https://api.sleeper.app/v1/state/nfl').catch((e) => fail(e.message));
const season = state.season;
const stats = await fetchJSON(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`).catch((e) => fail(e.message));

const entries = [];
let skipped = 0;
for (const p of pool) {
	const line = toStatLine(stats[p.sleeperId]);
	if (isZeroLine(line)) { skipped++; continue; } // bye week / did not play / no stats
	entries.push({ player: p, statLine: line, points: computePoints(line) });
}
entries.sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name));

console.log(`Season ${season} Week ${week} → round ${round}: ${entries.length} pool players with a stat line, ${skipped} skipped (all-zero).`);
console.log('Top 5 (contest scoring, computed locally):');
for (const e of entries.slice(0, 5)) console.log(`  ${e.player.name} (${e.player.team} ${e.player.position}) = ${e.points} pts`);

if (dryRun) {
	console.log(`\nDry run — nothing posted to ${APP_URL}.`);
	process.exit(0);
}

// --- post each line to the admin scores endpoint ------------------------------
let posted = 0;
const failures = [];
for (const e of entries) {
	try {
		const res = await fetch(`${APP_URL}/api/admin/scores`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
			body: JSON.stringify({ playerId: e.player.id, round, statLine: e.statLine })
		});
		const d = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(`${res.status} ${d.error || ''}`.trim());
		if (d.points !== e.points) console.warn(`  ⚠ ${e.player.name}: server computed ${d.points}, local ${e.points}`);
		posted++;
	} catch (err) {
		failures.push(`${e.player.id}: ${err.message}`);
	}
}

console.log(`\nPosted ${posted}/${entries.length} stat lines to ${APP_URL}/api/admin/scores (round ${round}).`);
if (failures.length) {
	console.error(`Failures (${failures.length}):\n  ${failures.slice(0, 10).join('\n  ')}`);
	process.exit(1);
}

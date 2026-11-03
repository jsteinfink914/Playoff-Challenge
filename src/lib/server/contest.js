// Active contest resolution (server-only).
//
// If src/lib/shadow-data.json exists and looks valid, the contest is the
// SHADOW contest: Jake plays it himself for a few weeks on the current
// "favorites" field (projected playoff teams), with the contest rounds mapped
// onto regular-season weeks — WC = NFL Week 9, DIV = Week 10, CONF = Week 11,
// SB unused. Otherwise the contest is the original demo (Jan 2026 playoff
// field, relative future locks), exactly as before.
//
// Seeding (initial seed + admin Reseed) loads whichever contest is active —
// so in production, Reseed is the wipe that clears the fake test entrants and
// loads the shadow pool.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYERS as DEMO_PLAYERS, TEAMS as DEMO_TEAMS, TEAMS_BY_ROUND as DEMO_TEAMS_BY_ROUND } from '../seed.js';
import { ALLOW_REPEAT_DOUBLER, ROUNDS } from '../config.js';

// Display labels for the shadow rounds (round ids stay WC/DIV/CONF/SB).
export const SHADOW_ROUND_LABELS = {
	WC: 'Week 9 · Shadow',
	DIV: 'Week 10 · Shadow',
	CONF: 'Week 11 · Shadow',
	SB: 'Super Bowl · unused'
};

// Shadow locks (UTC). Roster lock = WC 2x lock = Thu Nov 5 2026, 8:00 PM ET
// (Week 9 kickoff); then each Thursday 8 PM ET for Weeks 10 and 11.
const SHADOW_LOCKS = {
	roster_lock_at: '2026-11-06T01:00:00Z',
	lock_WC: '2026-11-06T01:00:00Z',
	lock_DIV: '2026-11-13T01:00:00Z',
	lock_CONF: '2026-11-20T01:00:00Z',
	lock_SB: '2027-02-01T00:00:00Z' // placeholder — SB is unused in shadow mode
};

function isValidShadow(data) {
	return (
		data &&
		Array.isArray(data.teams) &&
		data.teams.length === 14 &&
		data.teams.every((t) => t.abbr && t.name) &&
		Array.isArray(data.players) &&
		data.players.length > 0 &&
		data.players.every((p) => p.id && p.name && p.team && p.position)
	);
}

function readShadowFromDisk() {
	// Fallback if the JSON isn't reachable as a module import (e.g. a runtime
	// where Vite didn't bundle it): try next to this source file, then cwd.
	const here = path.dirname(fileURLToPath(import.meta.url));
	for (const file of [path.join(here, '..', 'shadow-data.json'), path.join(process.cwd(), 'src/lib/shadow-data.json')]) {
		try {
			if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch { /* try next candidate */ }
	}
	return null;
}

async function loadShadow() {
	let data = null;
	try {
		data = (await import('../shadow-data.json')).default;
	} catch { /* not bundled / absent */ }
	if (!isValidShadow(data)) data = readShadowFromDisk();
	return isValidShadow(data) ? data : null;
}

let contestPromise = null;

/** Resolve the active contest seed. Cached per process. */
export function getContest() {
	if (!contestPromise) {
		contestPromise = (async () => {
			const shadow = await loadShadow();
			if (shadow) {
				const teams = shadow.teams.map((t) => ({ abbr: t.abbr, name: t.name, conf: t.conf, seed: t.seed }));
				const abbrs = teams.map((t) => t.abbr);
				return {
					mode: 'shadow',
					teams,
					players: shadow.players.map((p) => ({ id: p.id, name: p.name, team: p.team, position: p.position })),
					// All 14 teams play every shadow round (bye-week players score 0); SB unused.
					teamsByRound: { WC: abbrs, DIV: abbrs, CONF: abbrs, SB: [] },
					locks: SHADOW_LOCKS,
					allowRepeatDoubler: true,
					roundLabels: SHADOW_ROUND_LABELS
				};
			}
			return {
				mode: 'demo',
				teams: DEMO_TEAMS,
				players: DEMO_PLAYERS,
				teamsByRound: DEMO_TEAMS_BY_ROUND,
				locks: null, // store.js computes relative demo locks
				allowRepeatDoubler: ALLOW_REPEAT_DOUBLER,
				roundLabels: null
			};
		})();
	}
	return contestPromise;
}

/** ROUNDS from config.js with a contest's round labels applied (ids/shorts unchanged). */
export function roundsWithLabels(roundLabels) {
	return ROUNDS.map((r) => ({ ...r, label: roundLabels?.[r.id] || r.label }));
}

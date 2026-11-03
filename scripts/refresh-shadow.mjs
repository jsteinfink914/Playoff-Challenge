// Shadow mode pipeline — REAL Sleeper data, no DB, no manual entry.
//
// What this does:
//   1. Reads Sleeper's NFL state to find the last completed regular-season week.
//   2. Fetches the Sleeper players map once, plus weekly stats for every completed
//      week not already in the local cache (scripts/.cache/shadow-weeks.json,
//      gitignored — raw trimmed Sleeper entries, so re-runs are incremental and
//      idempotent; delete the cache to force a full refetch).
//   3. Builds the shadow player pool: players whose CURRENT Sleeper team is one
//      of the 14 "favorites" (the if-the-season-ended-today playoff field),
//      ranked by cumulative season pts_ppr, capped per team/position.
//   4. Scores every pool player's week with the app's own computePoints()
//      (imported from src/lib/core.js — scoring is NOT re-implemented here).
//   5. Builds 3 deterministic sample rosters, proves each legal with
//      validateRoster(), picks each roster's weekly top scorer as its 2x, and
//      totals everything with computeLeaderboard().
//   6. Writes src/lib/shadow-data.json, which the /shadow page renders.
//
// Run: node scripts/refresh-shadow.mjs   (or: npm run shadow:refresh)
// Exit code is non-zero on any fetch or validation failure.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePoints, validateRoster, computeLeaderboard } from '../src/lib/core.js';
import { SCORING, POSITION_COUNTS } from '../src/lib/config.js';
import { toStatLine } from '../src/lib/server/sleeper.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'src/lib/shadow-data.json');
const CACHE_FILE = path.join(ROOT, 'scripts/.cache/shadow-weeks.json');

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const POOL_CAPS = { QB: 3, RB: 5, WR: 7, TE: 4 }; // per team

// The shadow field: post-Week 8 "if the season ended today" playoff picture
// (USA Today / GSP, Nov 2 2026). Seeds are conference seeds.
export const SHADOW_TEAMS = [
	{ abbr: 'BUF', name: 'Buffalo Bills', conf: 'AFC', seed: 1 },
	{ abbr: 'DEN', name: 'Denver Broncos', conf: 'AFC', seed: 2 },
	{ abbr: 'PIT', name: 'Pittsburgh Steelers', conf: 'AFC', seed: 3 },
	{ abbr: 'JAX', name: 'Jacksonville Jaguars', conf: 'AFC', seed: 4 },
	{ abbr: 'KC', name: 'Kansas City Chiefs', conf: 'AFC', seed: 5 },
	{ abbr: 'CIN', name: 'Cincinnati Bengals', conf: 'AFC', seed: 6 },
	{ abbr: 'NE', name: 'New England Patriots', conf: 'AFC', seed: 7 },
	{ abbr: 'SF', name: 'San Francisco 49ers', conf: 'NFC', seed: 1 },
	{ abbr: 'MIN', name: 'Minnesota Vikings', conf: 'NFC', seed: 2 },
	{ abbr: 'NYG', name: 'New York Giants', conf: 'NFC', seed: 3 },
	{ abbr: 'CAR', name: 'Carolina Panthers', conf: 'NFC', seed: 4 },
	{ abbr: 'CHI', name: 'Chicago Bears', conf: 'NFC', seed: 5 },
	{ abbr: 'DET', name: 'Detroit Lions', conf: 'NFC', seed: 6 },
	{ abbr: 'GB', name: 'Green Bay Packers', conf: 'NFC', seed: 7 }
];
const TEAM_SET = new Set(SHADOW_TEAMS.map((t) => t.abbr));

// Raw Sleeper stat keys worth caching: everything computePoints can consume,
// plus the fields needed for the pts_ppr parity check and the 2-pt mapping.
const KEEP_KEYS = [
	'pts_ppr', 'pass_yd', 'pass_td', 'pass_int', 'pass_sack',
	'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td',
	'fum', 'fum_lost', 'pass_2pt', 'rush_2pt', 'rec_2pt',
	'fum_rec_td', 'fum_rec', 'ret_td', 'kr_td', 'pr_td'
];

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;

function slug(name) {
	return name
		.toLowerCase()
		.replace(/['’.]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

async function fetchJSON(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
	return res.json();
}

function fail(msg) {
	console.error(`\n✗ SHADOW REFRESH FAILED: ${msg}`);
	process.exit(1);
}

// Stat-line mapping lives in src/lib/server/sleeper.js (shared with the weekly
// score loader and the cron endpoint). NOTE: fum_lost comes only from
// Sleeper's fum_lost — never from fum.

async function main() {
	// --- 1. Season state ------------------------------------------------------
	let state;
	try {
		state = await fetchJSON('https://api.sleeper.app/v1/state/nfl');
	} catch (e) {
		fail(e.message);
	}
	const season = Number(state.season);
	let lastCompleted;
	if (state.season_type === 'regular') lastCompleted = state.week - 1;
	else if (state.season_type === 'post') lastCompleted = 18;
	else lastCompleted = 0;
	lastCompleted = Math.max(0, Math.min(18, lastCompleted));
	if (!season || lastCompleted < 1) fail(`No completed weeks yet (state: ${JSON.stringify(state)})`);
	console.log(`Season ${season}: state week ${state.week} (${state.season_type}) → completed weeks 1–${lastCompleted}`);

	// --- 2. Weekly stats cache (incremental) ----------------------------------
	let cache = { season, weeks: {} };
	if (existsSync(CACHE_FILE)) {
		try {
			const parsed = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
			if (parsed.season === season) cache = parsed;
		} catch {
			console.warn('Cache unreadable — starting fresh.');
		}
	}
	for (let w = 1; w <= lastCompleted; w++) {
		if (cache.weeks[w]) continue;
		let raw;
		try {
			raw = await fetchJSON(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${w}`);
		} catch (e) {
			fail(e.message);
		}
		const trimmed = {};
		for (const [pid, entry] of Object.entries(raw)) {
			if (!entry || typeof entry !== 'object') continue;
			const t = {};
			for (const k of KEEP_KEYS) if (entry[k] != null) t[k] = entry[k];
			if (Object.keys(t).length) trimmed[pid] = t;
		}
		cache.weeks[w] = trimmed;
		console.log(`  fetched week ${w}: ${Object.keys(raw).length} Sleeper entries`);
	}
	await mkdir(path.dirname(CACHE_FILE), { recursive: true });
	await writeFile(CACHE_FILE, JSON.stringify(cache));

	// Season totals (Sleeper pts_ppr) per Sleeper player id.
	const seasonTotals = new Map();
	for (const w of Object.keys(cache.weeks)) {
		for (const [pid, entry] of Object.entries(cache.weeks[w])) {
			if (entry.pts_ppr != null) seasonTotals.set(pid, (seasonTotals.get(pid) || 0) + entry.pts_ppr);
		}
	}

	// --- 3. Players map → pool -------------------------------------------------
	let playersMap;
	try {
		playersMap = await fetchJSON('https://api.sleeper.app/v1/players/nfl');
	} catch (e) {
		fail(e.message);
	}

	// Group candidates by team → position. Resolution is strictly by CURRENT
	// team + position from the map (names are ambiguous in Sleeper's data).
	const groups = new Map(); // "TEAM|POS" -> candidates
	for (const p of Object.values(playersMap)) {
		if (!p || !TEAM_SET.has(p.team) || !p.full_name) continue;
		const pos = [p.position, ...(p.fantasy_positions || [])].find((x) => POSITIONS.includes(x));
		if (!pos) continue;
		const key = `${p.team}|${pos}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push({
			sleeperId: p.player_id,
			name: p.full_name,
			team: p.team,
			position: pos,
			seasonPtsRaw: seasonTotals.get(p.player_id) || 0
		});
	}

	const byRank = (a, b) => b.seasonPtsRaw - a.seasonPtsRaw || a.name.localeCompare(b.name) || String(a.sleeperId).localeCompare(String(b.sleeperId));
	const pool = [];
	const usedSlugs = new Set();
	const groupRankings = new Map(); // "TEAM|POS" -> pool players, ranked (for Second Helping)
	for (const team of SHADOW_TEAMS) {
		for (const pos of POSITIONS) {
			const ranked = (groups.get(`${team.abbr}|${pos}`) || []).sort(byRank);
			// Cap per position, but never fewer than the top 2 (a pool hole is worse than a 0-pt player).
			const finalKept = ranked.slice(0, Math.min(ranked.length, Math.max(2, POOL_CAPS[pos])));
			const playersOut = finalKept.map((c) => {
				let id = `${team.abbr.toLowerCase()}-${slug(c.name)}`;
				if (usedSlugs.has(id)) id = `${id}-${c.sleeperId}`;
				usedSlugs.add(id);
				return { id, sleeperId: c.sleeperId, name: c.name, team: c.team, position: c.position, seasonPts: round1(c.seasonPtsRaw) };
			});
			groupRankings.set(`${team.abbr}|${pos}`, playersOut);
			pool.push(...playersOut);
		}
	}
	console.log(`\nPool: ${pool.length} players across ${SHADOW_TEAMS.length} teams`);
	for (const team of SHADOW_TEAMS) {
		const mine = pool.filter((p) => p.team === team.abbr);
		const counts = POSITIONS.map((pos) => `${pos} ${mine.filter((p) => p.position === pos).length}`).join(' · ');
		console.log(`  ${team.abbr}: ${mine.length} (${counts})`);
	}

	// --- 4. Weekly points for pool players -------------------------------------
	const weekNums = Object.keys(cache.weeks).map(Number).filter((w) => w <= lastCompleted).sort((a, b) => a - b);
	const weeks = {};
	const playerScores = []; // rows for computeLeaderboard
	for (const w of weekNums) {
		const rawWeek = cache.weeks[w];
		const out = {};
		for (const p of pool) {
			const raw = rawWeek[p.sleeperId];
			if (!raw || raw.pts_ppr == null) continue;
			const statLine = toStatLine(raw);
			const points = computePoints(statLine, SCORING);
			out[p.id] = { statLine, points, sleeperPts: round2(raw.pts_ppr) };
			playerScores.push({ playerId: p.id, round: `W${w}`, points });
		}
		weeks[w] = out;
	}
	console.log(`Weeks covered: ${weekNums.join(', ')}`);

	// --- 5. Validation prints ---------------------------------------------------
	const latest = weekNums[weekNums.length - 1];
	// BUF QB1 by season points — resolved by team + position, never by name.
	const bufQb1 = groupRankings.get('BUF|QB')?.[0];
	if (bufQb1) {
		const line = weeks[latest]?.[bufQb1.id];
		console.log(`\nBUF QB1: ${bufQb1.name} (${bufQb1.id}, Sleeper ${bufQb1.sleeperId}) — season ${bufQb1.seasonPts} pts`);
		if (line) {
			console.log(`  Week ${latest} stat line: ${JSON.stringify(line.statLine)}`);
			console.log(`  Week ${latest} points: ours ${line.points} vs Sleeper pts_ppr ${line.sleeperPts}`);
		} else {
			console.log(`  Week ${latest}: no stat entry (bye/inactive)`);
		}
	}
	const kcTe1 = groupRankings.get('KC|TE')?.[0];
	if (kcTe1) console.log(`KC TE1: ${kcTe1.name} — season ${kcTe1.seasonPts} pts`);

	// Parity check: >= 3 non-QB pool players with a latest-week stat entry.
	const parityCandidates = pool
		.filter((p) => p.position !== 'QB' && weeks[latest]?.[p.id])
		.sort((a, b) => weeks[latest][b.id].sleeperPts - weeks[latest][a.id].sleeperPts)
		.slice(0, 3);
	console.log(`\nScoring parity vs Sleeper pts_ppr (Week ${latest}, top non-QB pool players):`);
	const parityLine = (p) => {
		const entry = weeks[latest][p.id];
		const raw = cache.weeks[latest][p.sleeperId];
		const delta = round2(entry.sleeperPts - entry.points);
		const parts = [];
		// Sleeper charges pass INT at -1; our config charges SCORING.passInt (-2).
		const intAdj = round2((entry.statLine.pass_int || 0) * (-1 - SCORING.passInt));
		if (intAdj) parts.push(`INT scoring (Sleeper -1 vs ours ${SCORING.passInt}) explains ${intAdj > 0 ? '+' : ''}${intAdj}`);
		const residual = round2(delta - intAdj);
		if (residual) {
			const extras = ['fum_rec_td', 'fum_rec', 'ret_td', 'kr_td', 'pr_td'].filter((k) => raw[k]).map((k) => `${k}=${raw[k]}`);
			parts.push(`residual ${residual > 0 ? '+' : ''}${residual}${extras.length ? ` (Sleeper-only fields present: ${extras.join(', ')})` : ' (unexplained)'}`);
		}
		return { delta, text: `  ${p.name} (${p.team} ${p.position}): ours ${entry.points} vs Sleeper ${entry.sleeperPts} → delta ${delta > 0 ? '+' : ''}${delta}${parts.length ? ' — ' + parts.join('; ') : ' — exact match'}` };
	};
	const parityShown = new Set();
	for (const p of parityCandidates) {
		console.log(parityLine(p).text);
		parityShown.add(p.id);
	}
	// If any other non-QB pool player has a nonzero delta this week, show the biggest one too.
	const biggestDelta = pool
		.filter((p) => p.position !== 'QB' && weeks[latest]?.[p.id] && !parityShown.has(p.id))
		.map((p) => ({ p, d: Math.abs(round2(weeks[latest][p.id].sleeperPts - weeks[latest][p.id].points)) }))
		.filter((x) => x.d > 0)
		.sort((a, b) => b.d - a.d)[0];
	if (biggestDelta) console.log(parityLine(biggestDelta.p).text + '  ← largest nonzero non-QB delta');

	// --- 6. Sample rosters -------------------------------------------------------
	const quotasLeft = (counts) => ({ ...counts });
	// rankKey: higher sorts earlier. Default is cumulative season points.
	function greedy({ exclude = new Set(), preset = [], quotaOverride = null, skipPositions = new Set(), rankKey = (p) => p.seasonPts } = {}) {
		const quotas = quotaOverride || quotasLeft(POSITION_COUNTS);
		const usedTeams = new Set();
		const picks = [];
		for (const pre of preset) {
			picks.push(pre.id);
			usedTeams.add(pre.team);
			quotas[pre.position] -= 1;
		}
		const candidates = pool
			.filter((p) => !exclude.has(p.id) && !usedTeams.has(p.team) && !skipPositions.has(p.position))
			.sort((a, b) => rankKey(b) - rankKey(a) || b.seasonPts - a.seasonPts || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
		for (const c of candidates) {
			if (usedTeams.has(c.team) || quotas[c.position] <= 0) continue;
			picks.push(c.id);
			usedTeams.add(c.team);
			quotas[c.position] -= 1;
		}
		return picks;
	}

	const teamOrder = new Map(SHADOW_TEAMS.map((t, i) => [t.abbr, i]));
	const byId = new Map(pool.map((p) => [p.id, p]));
	const sortPicks = (picks) =>
		[...picks].sort((a, b) => teamOrder.get(byId.get(a).team) - teamOrder.get(byId.get(b).team) || POSITIONS.indexOf(byId.get(a).position) - POSITIONS.indexOf(byId.get(b).position));

	// Chalk: straight greedy on season points.
	const chalkPicks = sortPicks(greedy());

	// Second Helping: each team's top player at every position is off the board.
	const topPerGroup = new Set();
	for (const ranked of groupRankings.values()) if (ranked[0]) topPerGroup.add(ranked[0].id);
	const secondPicks = sortPicks(greedy({ exclude: topPerGroup }));

	// QB-or-Bust: QB1 from the 3 strongest QB teams first, then fill the rest by
	// single-week CEILING (best weekly score this season), not cumulative points —
	// a deliberately different philosophy from Chalk's floor, so the rosters differ.
	const maxWeekPts = (p) => Math.max(0, ...weekNums.map((w) => weeks[w]?.[p.id]?.points ?? 0));
	const qbTeams = SHADOW_TEAMS
		.map((t) => ({ team: t.abbr, qb1: groupRankings.get(`${t.abbr}|QB`)?.[0] }))
		.filter((x) => x.qb1)
		.sort((a, b) => b.qb1.seasonPts - a.qb1.seasonPts || a.team.localeCompare(b.team));
	const qbPreset = qbTeams.slice(0, 3).map((x) => x.qb1);
	const qbQuotas = { ...POSITION_COUNTS };
	for (const q of qbPreset) qbQuotas[q.position] -= 1;
	const qbPicks = sortPicks(greedy({ preset: qbPreset, quotaOverride: qbQuotas, skipPositions: new Set(['QB']), rankKey: maxWeekPts }));

	const rosters = [
		{ id: 'chalk', name: 'Chalk', picks: chalkPicks },
		{ id: 'second-helping', name: 'Second Helping', picks: secondPicks },
		{ id: 'qb-or-bust', name: 'QB-or-Bust', picks: qbPicks }
	];
	console.log('\nSample rosters (validateRoster):');
	for (const r of rosters) {
		const v = validateRoster(r.picks, pool);
		console.log(`  ${r.name}: ${v.ok ? 'LEGAL ✓' : 'ILLEGAL ✗ ' + v.errors.join(' | ')} (${r.picks.length} picks)`);
		if (!v.ok) fail(`Sample roster "${r.name}" failed validation: ${v.errors.join('; ')}`);
	}

	// --- 7. Doublers + leaderboard (the app's own math) --------------------------
	const rounds = weekNums.map((w) => `W${w}`);
	const pointsOf = (playerId, w) => weeks[w]?.[playerId]?.points ?? 0;
	const doublerPicks = [];
	for (const r of rosters) {
		for (const w of weekNums) {
			const best = [...r.picks].sort((a, b) => pointsOf(b, w) - pointsOf(a, w) || a.localeCompare(b))[0];
			doublerPicks.push({ entrantId: r.id, round: `W${w}`, playerId: best });
		}
	}
	const leaderboard = computeLeaderboard(
		rosters.map((r) => ({ id: r.id, name: r.name })),
		Object.fromEntries(rosters.map((r) => [r.id, r.picks])),
		doublerPicks,
		playerScores,
		rounds
	);
	console.log('\nShadow leaderboard:');
	for (const row of leaderboard) console.log(`  ${row.name}: ${row.total} pts`);

	// --- 8. Write shadow-data.json ------------------------------------------------
	const generatedAt = new Date().toISOString();
	const data = {
		generatedAt,
		season,
		teams: SHADOW_TEAMS,
		players: pool,
		weeks,
		rosters: rosters.map((r) => ({ ...r, players: r.picks.map((id) => byId.get(id)) })),
		doublerPicks,
		leaderboard
	};
	await writeFile(DATA_FILE, JSON.stringify(data));
	console.log(`\n✓ Wrote ${path.relative(ROOT, DATA_FILE)} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB, generated ${generatedAt})`);
}

main().catch((e) => fail(e.message));

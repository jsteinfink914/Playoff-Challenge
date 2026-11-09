// Shared score loading from Sleeper — the single implementation used by the
// leaderboard freshness hook (scoreFreshness.js) and the admin backfill
// endpoint (/api/cron/scores). All writes are idempotent upserts keyed by
// (player, round): re-loading a week changes nothing unless Sleeper's
// numbers changed (in-progress stats finalize; stat corrections land).

import { getContest } from './contest.js';
import { getPool, upsertScore } from './store.js';
import { fetchJSON, toStatLine, isZeroLine } from './sleeper.js';
import { ROUND_IDS } from '../config.js';

const SLEEPER_API = 'https://api.sleeper.app/v1';
const UPSERT_BATCH = 10; // bounded concurrency for the per-player upserts

export async function fetchSleeperState() {
	return fetchJSON(`${SLEEPER_API}/state/nfl`);
}

async function loadContext() {
	const contest = await getContest();
	const pool = await getPool();
	return {
		contest,
		poolIds: pool.map((p) => p.id),
		// getPool() is the public shape (no sleeperId); the join key lives on
		// the contest's player list.
		sleeperIdByPlayerId: new Map(
			(contest.players || []).filter((p) => p.sleeperId).map((p) => [p.id, String(p.sleeperId)])
		)
	};
}

/**
 * Post every pool player's non-zero line from a Sleeper stats payload into a
 * round. Upserts run in parallel batches of UPSERT_BATCH. Returns lines posted.
 */
export async function postStats(stats, round, poolIds, sleeperIdByPlayerId) {
	const jobs = [];
	for (const playerId of poolIds) {
		const sleeperId = sleeperIdByPlayerId.get(playerId);
		if (!sleeperId) continue;
		const line = toStatLine(stats?.[sleeperId]);
		if (isZeroLine(line)) continue; // bye week / did not play / no stats yet
		jobs.push([playerId, line]);
	}
	for (let i = 0; i < jobs.length; i += UPSERT_BATCH) {
		await Promise.all(
			jobs.slice(i, i + UPSERT_BATCH).map(([playerId, line]) => upsertScore(playerId, round, line))
		);
	}
	return jobs.length;
}

/**
 * Load one round's mapped NFL week from Sleeper.
 * `state` may be passed in ({ season, week }) to avoid a duplicate lookup.
 * Returns { status: 'loaded', playersPosted, week } or
 * { status: 'unmapped' | 'future' | 'empty' } — 'empty' means Sleeper has no
 * stats for that week yet (not played / not posted), which callers must NOT
 * treat as a successful load.
 */
export async function loadRoundStats(round, state) {
	const { contest, poolIds, sleeperIdByPlayerId } = await loadContext();
	const m = contest.roundWeeks?.[round];
	if (!m) return { status: 'unmapped' };
	const st = state || (await fetchSleeperState());
	if (m.nflWeek > Number(st.week)) return { status: 'future' };
	const stats = await fetchJSON(`${SLEEPER_API}/stats/nfl/${m.seasonType}/${st.season}/${m.nflWeek}`);
	if (!stats || Object.keys(stats).length === 0) return { status: 'empty' };
	const playersPosted = await postStats(stats, round, poolIds, sleeperIdByPlayerId);
	return { status: 'loaded', playersPosted, week: m.nflWeek };
}

/** Force-load an arbitrary NFL week into a round (manual backfill override). */
export async function loadWeekIntoRound(week, round) {
	const { contest, poolIds, sleeperIdByPlayerId } = await loadContext();
	const state = await fetchSleeperState();
	const seasonType = contest.roundWeeks?.[round]?.seasonType || 'regular';
	const stats = await fetchJSON(`${SLEEPER_API}/stats/nfl/${seasonType}/${state.season}/${week}`);
	const playersPosted = await postStats(stats, round, poolIds, sleeperIdByPlayerId);
	return { playersPosted, stateWeek: Number(state.week) };
}

/**
 * Load every mapped round whose week has stats (the old scheduled-run
 * logic): rounds whose NFL week is still in the future, or whose stats
 * Sleeper hasn't posted, are skipped with a reason.
 * Returns { stateWeek, loaded: [{round, week, playersPosted}], skipped: [{round, reason}] }.
 */
export async function loadDueRounds() {
	const state = await fetchSleeperState();
	const stateWeek = Number(state.week);
	const contest = await getContest();
	const loaded = [];
	const skipped = [];
	if (!contest.roundWeeks) {
		for (const round of ROUND_IDS) {
			skipped.push({ round, reason: 'active contest has no round→week mapping (nothing to load)' });
		}
		return { stateWeek, loaded, skipped };
	}
	for (const round of ROUND_IDS) {
		const m = contest.roundWeeks[round];
		if (!m) {
			skipped.push({ round, reason: 'no NFL week mapped to this round' });
			continue;
		}
		const res = await loadRoundStats(round, state);
		if (res.status === 'loaded') {
			loaded.push({ round, week: m.nflWeek, playersPosted: res.playersPosted });
		} else if (res.status === 'future') {
			skipped.push({ round, reason: `NFL week ${m.nflWeek} is in the future (Sleeper state week ${stateWeek})` });
		} else if (res.status === 'empty') {
			skipped.push({ round, reason: `no stats posted yet for NFL week ${m.nflWeek}` });
		} else {
			skipped.push({ round, reason: 'no NFL week mapped to this round' });
		}
	}
	return { stateWeek, loaded, skipped };
}

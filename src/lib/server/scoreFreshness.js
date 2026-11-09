// Score freshness — automatic scoring happens HERE, on leaderboard reads
// (there is no cron/scheduler anymore; the Vercel Cron design was dropped
// because its invocations could not be authenticated reliably).
//
// THE RULE, per round with an NFL week mapping (contest.roundWeeks):
// refresh the round's scores from Sleeper when
//   (a) it has NEVER loaded successfully, or
//   (b) its last successful load is more than 15 minutes old AND its mapped
//       NFL week is >= (Sleeper state week - 1) — i.e. the live week and the
//       just-finished week keep refreshing (finals + stat corrections),
//       while older rounds freeze forever.
// A round whose mapped week is still in the future is never attempted (no
// stats exist for it). A load only counts as successful when Sleeper
// actually returned stats for the week; a failed or empty load does NOT
// stamp scoresLoadedAt:<round>, so the next read retries.
// The last successful load per round lives in the settings table under
// `scoresLoadedAt:<round>` (ISO string), alongside the locks.
//
// Safety rails: concurrent refreshes of a round coalesce onto one in-flight
// promise; the Sleeper state lookup is cached in-process for ~5 minutes;
// and ANY failure (Sleeper down, DB hiccup) is caught and logged — the
// leaderboard then serves whatever scores are already stored. A refresh
// failure must never fail the leaderboard itself.
//
// JANUARY NOTE: when roundWeeks is remapped to postseason weeks, re-check
// the state-week semantics — Sleeper's state week advances differently in
// the playoffs (weeks 18+ / 'post' season type), and condition (b)'s
// "state week - 1" window assumes the regular-season cadence.

import { getContest } from './contest.js';
import { getSetting, setSetting } from './store.js';
import { fetchSleeperState, loadRoundStats } from './scoreLoader.js';

export const SCORES_FRESH_MS = 15 * 60 * 1000;
const STATE_CACHE_MS = 5 * 60 * 1000;

export const stampKey = (round) => `scoresLoadedAt:${round}`;

/**
 * Pure freshness decision (unit-tested). now/lastLoadedAt are ms / ISO.
 */
export function shouldRefreshRound({ lastLoadedAt, now, nflWeek, stateWeek }) {
	if (nflWeek == null) return false;
	if (nflWeek > stateWeek) return false; // future week: no stats exist yet
	if (!lastLoadedAt) return true; // never loaded successfully
	const last = Date.parse(lastLoadedAt);
	if (Number.isNaN(last)) return true; // corrupt stamp: treat as never loaded
	if (now - last <= SCORES_FRESH_MS) return false; // still fresh
	return nflWeek >= stateWeek - 1; // stale: only the live + just-finished weeks keep refreshing
}

/**
 * Load one round now and stamp it on success. Returns true iff stamped.
 * Exported for tests; production callers should use ensureScoresFresh().
 */
export async function refreshRound(round, state) {
	const res = await loadRoundStats(round, state);
	if (res.status !== 'loaded') return false; // empty/future/unmapped: no stamp, retry next read
	await setSetting(stampKey(round), new Date().toISOString());
	return true;
}

let stateCache = { at: 0, value: null };
async function getStateCached() {
	const now = Date.now();
	if (stateCache.value && now - stateCache.at < STATE_CACHE_MS) return stateCache.value;
	const value = await fetchSleeperState();
	stateCache = { at: now, value };
	return value;
}

const inFlight = new Map(); // round -> Promise<boolean>

/**
 * Refresh every due round per the rule above. Never throws.
 * Called by GET /api/leaderboard before standings are computed.
 */
export async function ensureScoresFresh() {
	try {
		const contest = await getContest();
		const mapping = contest.roundWeeks;
		if (!mapping) return;
		const state = await getStateCached();
		const stateWeek = Number(state.week);
		const now = Date.now();
		const jobs = [];
		for (const round of Object.keys(mapping)) {
			const lastLoadedAt = await getSetting(stampKey(round));
			if (!shouldRefreshRound({ lastLoadedAt, now, nflWeek: mapping[round].nflWeek, stateWeek })) continue;
			if (!inFlight.has(round)) {
				inFlight.set(
					round,
					refreshRound(round, state)
						.catch((e) => {
							console.error(`[scores] refresh of round ${round} failed; serving stored scores:`, e);
							return false;
						})
						.finally(() => inFlight.delete(round))
				);
			}
			jobs.push(inFlight.get(round));
		}
		await Promise.all(jobs);
	} catch (e) {
		console.error('[scores] freshness check failed; serving stored scores:', e);
	}
}

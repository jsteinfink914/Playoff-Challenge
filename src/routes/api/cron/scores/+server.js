import { json } from '@sveltejs/kit';
import { getContest } from '$lib/server/contest.js';
import { ensureSeeded, getPool, isAdmin, upsertScore } from '$lib/server/store.js';
import { fetchJSON, toStatLine, isZeroLine } from '$lib/server/sleeper.js';
import { ROUND_IDS } from '$lib/config.js';

// GET /api/cron/scores — automatic scoring, driven by Vercel Cron
// (see vercel.json: Sun ~8pm ET partial/live pass, Tue morning final pass,
// Wed morning stat-correction pass).
//
// For every contest round with a Sleeper week mapping (contest.roundWeeks)
// whose week has stats, it pulls that week's stat lines from Sleeper and
// upserts them into player_scores via the store — the same write path as the
// admin scores API. Partial weeks are intended: a Sunday-evening run loads
// in-progress stats so standings move live; later runs upsert over them and
// finalize (stat corrections included). The whole run is IDEMPOTENT — scores
// are upserts keyed by (player, round), so re-running changes nothing unless
// Sleeper's numbers changed.
//
// Auth: Vercel Cron invocations carry an `x-vercel-cron` header; manual runs
// may instead pass the admin key (`x-admin-key`). No other env vars needed.
// Manual override (admin key ONLY): ?week=<n>&round=<WC|DIV|CONF> force-loads
// that NFL week into that round regardless of Sleeper state — backfills/tests.

const SLEEPER_API = 'https://api.sleeper.app/v1';

/** Post every pool player's non-zero line from a Sleeper stats payload into a round. Returns lines posted. */
async function postStats(stats, round, poolIds, sleeperIdByPlayerId) {
	let posted = 0;
	for (const playerId of poolIds) {
		const sleeperId = sleeperIdByPlayerId.get(playerId);
		if (!sleeperId) continue;
		const line = toStatLine(stats?.[sleeperId]);
		if (isZeroLine(line)) continue; // bye week / did not play / no stats yet
		await upsertScore(playerId, round, line);
		posted++;
	}
	return posted;
}

export async function GET({ request, url }) {
	const viaCron = request.headers.has('x-vercel-cron');
	const viaKey = isAdmin(request, null);
	if (!viaCron && !viaKey) return json({ error: 'Unauthorized.' }, { status: 401 });

	try {
		await ensureSeeded();
		const state = await fetchJSON(`${SLEEPER_API}/state/nfl`);
		const season = state.season;
		const stateWeek = Number(state.week);
		const contest = await getContest();
		const pool = await getPool();
		const poolIds = pool.map((p) => p.id);
		const sleeperIdByPlayerId = new Map(
			(contest.players || []).filter((p) => p.sleeperId).map((p) => [p.id, String(p.sleeperId)])
		);

		const loaded = [];
		const skipped = [];

		// --- Manual override: force-load one week into one round (key only). ---
		const overrideWeek = url.searchParams.get('week');
		const overrideRound = url.searchParams.get('round');
		if (overrideWeek !== null || overrideRound !== null) {
			if (!viaKey) return json({ error: 'Manual override requires the admin key.' }, { status: 401 });
			const week = Number(overrideWeek);
			if (!ROUND_IDS.includes(overrideRound) || !Number.isInteger(week) || week < 1) {
				return json({ error: 'Override needs ?week=<n> and ?round=<WC|DIV|CONF|SB>.' }, { status: 400 });
			}
			const seasonType = contest.roundWeeks?.[overrideRound]?.seasonType || 'regular';
			const stats = await fetchJSON(`${SLEEPER_API}/stats/nfl/${seasonType}/${season}/${week}`);
			const playersPosted = await postStats(stats, overrideRound, poolIds, sleeperIdByPlayerId);
			loaded.push({ round: overrideRound, week, playersPosted });
			return json({ ok: true, stateWeek, loaded, skipped });
		}

		// --- Scheduled run: every mapped round whose week has stats. ---
		const mapping = contest.roundWeeks;
		if (!mapping) {
			for (const round of ROUND_IDS) {
				skipped.push({ round, reason: 'active contest has no round→week mapping (nothing to load)' });
			}
			return json({ ok: true, stateWeek, loaded, skipped });
		}

		for (const round of ROUND_IDS) {
			const m = mapping[round];
			if (!m) {
				skipped.push({ round, reason: 'no NFL week mapped to this round' });
				continue;
			}
			if (m.nflWeek > stateWeek) {
				skipped.push({ round, reason: `NFL week ${m.nflWeek} is in the future (Sleeper state week ${stateWeek})` });
				continue;
			}
			const stats = await fetchJSON(`${SLEEPER_API}/stats/nfl/${m.seasonType}/${season}/${m.nflWeek}`);
			if (!stats || Object.keys(stats).length === 0) {
				skipped.push({ round, reason: `no stats posted yet for NFL week ${m.nflWeek}` });
				continue;
			}
			const playersPosted = await postStats(stats, round, poolIds, sleeperIdByPlayerId);
			loaded.push({ round, week: m.nflWeek, playersPosted });
		}
		return json({ ok: true, stateWeek, loaded, skipped });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

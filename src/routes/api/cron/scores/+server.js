import { json } from '@sveltejs/kit';
import { ensureSeeded, isAdmin } from '$lib/server/store.js';
import { loadDueRounds, loadWeekIntoRound } from '$lib/server/scoreLoader.js';
import { ROUND_IDS } from '$lib/config.js';

// GET /api/cron/scores — MANUAL backfill tool. (The path is historical:
// this used to be the Vercel Cron target. There is no scheduler anymore.)
//
// Automatic scoring happens on leaderboard reads — GET /api/leaderboard
// refreshes due rounds from Sleeper before computing standings (see
// $lib/server/scoreFreshness.js for the freshness rule). This endpoint
// remains for hand-driven backfills through the same shared loader
// ($lib/server/scoreLoader.js):
//   - no params: load every due round (mapped week reached + stats posted)
//   - ?week=<n>&round=<WC|DIV|CONF|SB>: force-load that NFL week into that
//     round regardless of Sleeper state — backfills/tests.
// All loads are idempotent upserts keyed by (player, round).
//
// Auth: admin key ONLY (`x-admin-key` = ADMIN_KEY). No other header or
// token authorizes — there is no scheduled caller anymore.

export async function GET({ request, url }) {
	if (!isAdmin(request, null)) return json({ error: 'Unauthorized.' }, { status: 401 });

	try {
		await ensureSeeded();

		// --- Manual override: force-load one week into one round. ---
		const overrideWeek = url.searchParams.get('week');
		const overrideRound = url.searchParams.get('round');
		if (overrideWeek !== null || overrideRound !== null) {
			const week = Number(overrideWeek);
			if (!ROUND_IDS.includes(overrideRound) || !Number.isInteger(week) || week < 1) {
				return json({ error: 'Override needs ?week=<n> and ?round=<WC|DIV|CONF|SB>.' }, { status: 400 });
			}
			const { playersPosted, stateWeek } = await loadWeekIntoRound(week, overrideRound);
			return json({ ok: true, stateWeek, loaded: [{ round: overrideRound, week, playersPosted }], skipped: [] });
		}

		// --- Manual full pass: every due round. ---
		const { stateWeek, loaded, skipped } = await loadDueRounds();
		return json({ ok: true, stateWeek, loaded, skipped });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

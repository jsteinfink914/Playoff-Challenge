import { json } from '@sveltejs/kit';
import { getPool, getSettings } from '$lib/server/store.js';
import { TEAMS } from '$lib/seed.js';
import { POSITION_COUNTS, ROUNDS, SCORING } from '$lib/config.js';

// GET /api/pool — playoff teams, player pool, and public contest state (locks, rules).
export async function GET() {
	try {
		const [players, settings] = await Promise.all([getPool(), getSettings()]);
		const now = new Date().toISOString();
		return json({
			demo: true,
			teams: TEAMS,
			players,
			rounds: ROUNDS,
			teamsByRound: settings.teamsByRound,
			positionCounts: POSITION_COUNTS,
			scoring: SCORING,
			locks: {
				rosterLockAt: settings.rosterLockAt,
				roundLocks: settings.roundLocks,
				rosterLocked: settings.rosterLockAt ? now >= settings.rosterLockAt : false
			},
			allowRepeatDoubler: settings.allowRepeatDoubler
		});
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

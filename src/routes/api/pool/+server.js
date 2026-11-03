import { json } from '@sveltejs/kit';
import { getPool, getSettings, getTeams } from '$lib/server/store.js';
import { getContest, roundsWithLabels } from '$lib/server/contest.js';
import { POSITION_COUNTS, SCORING } from '$lib/config.js';

// GET /api/pool — active contest's teams, player pool, and public contest state
// (locks, rules, round labels). Teams/rounds come from the active contest
// (shadow favorites when src/lib/shadow-data.json exists, else the demo field).
export async function GET() {
	try {
		const [players, settings, teams, contest] = await Promise.all([getPool(), getSettings(), getTeams(), getContest()]);
		const now = new Date().toISOString();
		return json({
			mode: contest.mode,
			demo: contest.mode === 'demo',
			teams,
			players,
			rounds: roundsWithLabels(settings.roundLabels),
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

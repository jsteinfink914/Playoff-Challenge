import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import { ensureSeeded, getPool, getRosters, getDoublerPicks, getScores, getSettings } from '$lib/server/store.js';
import { computeLeaderboard } from '$lib/core.js';
import { ROSTER_SIZE } from '$lib/config.js';

// GET /api/leaderboard
// Before the roster lock: entrant names + who has submitted — no roster contents.
// After the lock: full rosters, per-round breakdown, 2x flags, totals.
export async function GET() {
	try {
		await ensureSeeded();
		const settings = await getSettings();
		const locked = settings.rosterLockAt ? new Date().toISOString() >= settings.rosterLockAt : false;
		const entrants = await query('SELECT id, name FROM entrants ORDER BY name');
		const rosters = await getRosters();

		if (!locked) {
			return json({
				locked: false,
				rosterLockAt: settings.rosterLockAt,
				entrants: entrants.map((e) => ({
					entrantId: e.id,
					name: e.name,
					hasSubmitted: (rosters[e.id] || []).length === ROSTER_SIZE
				}))
			});
		}

		const [pool, doublerPicks, scores] = await Promise.all([getPool(), getDoublerPicks(), getScores()]);
		const byId = new Map(pool.map((p) => [p.id, p]));
		const board = computeLeaderboard(entrants, rosters, doublerPicks, scores);
		const doublerFor = (entrantId, round) =>
			doublerPicks.find((d) => d.entrantId === entrantId && d.round === round)?.playerId || null;
		const pointsFor = (playerId, round) =>
			scores.find((s) => s.playerId === playerId && s.round === round)?.points ?? 0;

		return json({
			locked: true,
			rosterLockAt: settings.rosterLockAt,
			standings: board.map((row) => ({
				...row,
				roster: (rosters[row.entrantId] || []).map((pid) => {
					const p = byId.get(pid);
					const perRound = {};
					for (const r of ['WC', 'DIV', 'CONF', 'SB']) perRound[r] = pointsFor(pid, r);
					return {
						playerId: pid,
						name: p?.name || pid,
						team: p?.team || '',
						position: p?.position || '',
						pointsByRound: perRound,
						doubledRounds: ['WC', 'DIV', 'CONF', 'SB'].filter((r) => doublerFor(row.entrantId, r) === pid)
					};
				})
			}))
		});
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

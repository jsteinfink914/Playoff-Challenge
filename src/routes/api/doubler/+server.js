import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import { getPool, getRosters, getDoublerPicks, getScores, getSettings, verifyPin } from '$lib/server/store.js';
import { ROUND_IDS } from '$lib/config.js';

// POST /api/doubler {entrantId, pin, round, playerId}
// Sets the entrant's 2x pick for a round. The player must be on their roster and
// his team must be playing that round. Changeable until the round lock.
export async function POST({ request }) {
	try {
		const { entrantId, pin, round, playerId } = await request.json();
		const entrant = await verifyPin(entrantId, pin);
		if (!entrant) return json({ error: 'Invalid entrant or PIN.' }, { status: 401 });
		if (!ROUND_IDS.includes(round)) return json({ error: `Unknown round: ${round}` }, { status: 400 });

		const settings = await getSettings();
		const lock = settings.roundLocks[round];
		if (lock && new Date().toISOString() >= lock) {
			return json({ error: `The ${round} round is locked.` }, { status: 403 });
		}

		const rosterRows = await query('SELECT player_id FROM rosters WHERE entrant_id = $1', [entrantId]);
		const roster = rosterRows.map((r) => r.player_id);
		if (!roster.includes(playerId)) {
			return json({ error: 'That player is not on your roster.' }, { status: 400 });
		}

		const pool = await getPool();
		const player = pool.find((p) => p.id === playerId);
		const alive = settings.teamsByRound[round] || [];
		if (!player || !alive.includes(player.team)) {
			return json({ error: `${player?.name || 'That player'}'s team is not playing in the ${round} round.` }, { status: 400 });
		}

		if (!settings.allowRepeatDoubler) {
			const others = await query(
				'SELECT round FROM doubler_picks WHERE entrant_id = $1 AND player_id = $2 AND round <> $3',
				[entrantId, playerId, round]
			);
			if (others.length) {
				return json({ error: `${player.name} was already your 2x pick in the ${others[0].round} round — repeat doublers are off.` }, { status: 400 });
			}
		}

		await query('DELETE FROM doubler_picks WHERE entrant_id = $1 AND round = $2', [entrantId, round]);
		await query('INSERT INTO doubler_picks (entrant_id, round, player_id, submitted_at) VALUES ($1,$2,$3,$4)', [
			entrantId, round, playerId, new Date().toISOString()
		]);
		return json({ ok: true, entrantId, round, playerId });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

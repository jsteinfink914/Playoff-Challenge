import { json } from '@sveltejs/kit';
import { getPool, isAdmin, upsertScore } from '$lib/server/store.js';
import { ROUND_IDS } from '$lib/config.js';

// POST /api/admin/scores {playerId, round, statLine}  (admin key: x-admin-key header or adminKey field)
// Computes points from the stat line with the contest scoring and upserts the score row.
export async function POST({ request }) {
	try {
		const body = await request.json();
		if (!isAdmin(request, body)) return json({ error: 'Admin key required.' }, { status: 401 });
		const { playerId, round, statLine } = body;
		if (!ROUND_IDS.includes(round)) return json({ error: `Unknown round: ${round}` }, { status: 400 });
		const pool = await getPool();
		if (!pool.some((p) => p.id === playerId)) return json({ error: `Unknown player: ${playerId}` }, { status: 400 });

		const points = await upsertScore(playerId, round, statLine || {});
		return json({ ok: true, playerId, round, points });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

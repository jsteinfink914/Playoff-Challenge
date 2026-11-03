import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import { getPool, isAdmin } from '$lib/server/store.js';
import { computePoints } from '$lib/core.js';
import { SAMPLE_WC_STATLINES } from '$lib/seed.js';

// POST /api/admin/seed-scores (admin) — load the SAMPLE Wild Card stat lines from
// src/lib/seed.js so the leaderboard can be demoed. Sample data only; wipe with
// POST /api/admin/seed.
export async function POST({ request }) {
	try {
		let body = null;
		try { body = await request.json(); } catch { /* empty body is fine */ }
		if (!isAdmin(request, body)) return json({ error: 'Admin key required.' }, { status: 401 });
		const pool = await getPool();
		const loaded = [];
		for (const s of SAMPLE_WC_STATLINES) {
			if (!pool.some((p) => p.id === s.playerId)) continue;
			const points = computePoints(s.statLine);
			await query('DELETE FROM player_scores WHERE player_id = $1 AND round = $2', [s.playerId, s.round]);
			await query('INSERT INTO player_scores (player_id, round, stat_line_json, points) VALUES ($1,$2,$3,$4)', [
				s.playerId, s.round, JSON.stringify(s.statLine), points
			]);
			loaded.push({ playerId: s.playerId, round: s.round, points });
		}
		return json({ ok: true, sample: true, loaded });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

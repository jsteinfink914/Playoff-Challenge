import { json } from '@sveltejs/kit';
import { isAdmin, reseed } from '$lib/server/store.js';

// POST /api/admin/seed (admin) — wipe everything and reload the active contest.
// With src/lib/shadow-data.json present that's the SHADOW contest (favorites
// pool, shadow locks, no scores, no entrants) — this is the wipe that clears
// the fake test entrants in production. Without it, the demo seed loads.
export async function POST({ request }) {
	try {
		let body = null;
		try { body = await request.json(); } catch { /* empty body is fine */ }
		if (!isAdmin(request, body)) return json({ error: 'Admin key required.' }, { status: 401 });
		const mode = await reseed();
		return json({
			ok: true,
			mode,
			note: mode === 'shadow'
				? 'Shadow contest reseeded: favorites pool + shadow locks loaded. Entrants, rosters, doubler picks and scores were wiped.'
				: 'Demo data reseeded. Entrants, rosters, doubler picks and scores were wiped.'
		});
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

import { json } from '@sveltejs/kit';
import { isAdmin, reseed } from '$lib/server/store.js';

// POST /api/admin/seed (admin) — wipe everything and reload the demo seed
// (Jan 2026 playoff field, future demo locks, no scores, no entrants).
export async function POST({ request }) {
	try {
		let body = null;
		try { body = await request.json(); } catch { /* empty body is fine */ }
		if (!isAdmin(request, body)) return json({ error: 'Admin key required.' }, { status: 401 });
		await reseed();
		return json({ ok: true, note: 'Demo data reseeded. Entrants, rosters, doubler picks and scores were wiped.' });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import { getPool, getSettings, verifyPin } from '$lib/server/store.js';
import { validateRoster } from '$lib/core.js';

// GET /api/roster?entrantId=..&pin=.. — the entrant's own roster + doubler picks
// (PIN-checked; this is the only way to read a roster before the public lock reveal).
export async function GET({ url }) {
	try {
		const entrantId = url.searchParams.get('entrantId');
		const pin = url.searchParams.get('pin');
		const entrant = await verifyPin(entrantId, pin);
		if (!entrant) return json({ error: 'Invalid entrant or PIN.' }, { status: 401 });
		const rosterRows = await query('SELECT player_id FROM rosters WHERE entrant_id = $1', [entrantId]);
		const pickRows = await query('SELECT round, player_id FROM doubler_picks WHERE entrant_id = $1', [entrantId]);
		return json({
			entrantId,
			picks: rosterRows.map((r) => r.player_id),
			doublers: Object.fromEntries(pickRows.map((r) => [r.round, r.player_id]))
		});
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

// POST /api/roster {entrantId, pin, picks:[playerId]}
// Saves/replaces the entrant's roster after PIN check + full server-side validation.
export async function POST({ request }) {
	try {
		const { entrantId, pin, picks } = await request.json();
		const entrant = await verifyPin(entrantId, pin);
		if (!entrant) return json({ error: 'Invalid entrant or PIN.' }, { status: 401 });

		const settings = await getSettings();
		if (settings.rosterLockAt && new Date().toISOString() >= settings.rosterLockAt) {
			return json({ error: 'Rosters are locked.' }, { status: 403 });
		}

		const pool = await getPool();
		const { ok, errors } = validateRoster(picks, pool);
		if (!ok) return json({ error: 'Invalid roster.', errors }, { status: 400 });

		await query('DELETE FROM rosters WHERE entrant_id = $1', [entrantId]);
		for (const pid of picks) {
			await query('INSERT INTO rosters (entrant_id, player_id) VALUES ($1,$2)', [entrantId, pid]);
		}
		return json({ ok: true, entrantId, picks });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

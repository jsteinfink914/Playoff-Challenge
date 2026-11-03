import { json } from '@sveltejs/kit';
import { createEntrant, getEntrantByName, pinMatches } from '$lib/server/store.js';

// POST /api/entrants {name, pin}
// Claims a name with a 4–8 digit PIN. If the name already exists and the PIN
// matches, this acts as a sign-in and returns the existing entrant id.
export async function POST({ request }) {
	try {
		const { name, pin } = await request.json();
		const cleanName = typeof name === 'string' ? name.trim() : '';
		if (!cleanName) return json({ error: 'Name is required.' }, { status: 400 });
		if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
			return json({ error: 'PIN must be 4–8 digits.' }, { status: 400 });
		}
		const existing = await getEntrantByName(cleanName);
		if (existing) {
			if (pinMatches(existing, pin)) return json({ id: existing.id, name: existing.name, returning: true });
			return json({ error: 'That name is already claimed and the PIN does not match.' }, { status: 409 });
		}
		const id = await createEntrant(cleanName, pin);
		return json({ id, name: cleanName }, { status: 201 });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

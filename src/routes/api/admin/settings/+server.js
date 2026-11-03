import { json } from '@sveltejs/kit';
import { getSettings, isAdmin, setSetting } from '$lib/server/store.js';
import { ROUND_IDS } from '$lib/config.js';

// GET  /api/admin/settings (admin) — current settings.
// POST /api/admin/settings (admin) — body may include:
//   rosterLockAt (ISO string), roundLocks {WC|DIV|CONF|SB: ISO string},
//   allowRepeatDoubler (boolean), teamsByRound {round: [teamAbbr]}
export async function GET({ request }) {
	try {
		if (!isAdmin(request, null)) return json({ error: 'Admin key required.' }, { status: 401 });
		return json(await getSettings());
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		if (!isAdmin(request, body)) return json({ error: 'Admin key required.' }, { status: 401 });

		if (body.rosterLockAt !== undefined) await setSetting('roster_lock_at', body.rosterLockAt);
		if (body.roundLocks) {
			for (const r of ROUND_IDS) {
				if (body.roundLocks[r] !== undefined) await setSetting(`lock_${r}`, body.roundLocks[r]);
			}
		}
		if (body.allowRepeatDoubler !== undefined) {
			await setSetting('allow_repeat_doubler', body.allowRepeatDoubler ? 'true' : 'false');
		}
		if (body.teamsByRound !== undefined) {
			await setSetting('teams_by_round', JSON.stringify(body.teamsByRound));
		}
		return json({ ok: true, settings: await getSettings() });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

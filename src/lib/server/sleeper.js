// Shared Sleeper helpers (server-side canonical copy).
// Used by the automatic-scoring cron endpoint; the shadow scripts in
// scripts/ import from here too, so there is exactly one stat-line mapping.

export async function fetchJSON(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
	return res.json();
}

// Map a raw Sleeper weekly stats entry onto the app's stat-line shape.
// two_pt sums all three 2-pt conversion flavors (pass / rush / rec).
// fum_lost comes ONLY from Sleeper's `fum_lost` field (absent = 0). Do NOT fall
// back to `fum`: that counts every fumble, lost or not, and our scoring only
// penalizes fumbles LOST. Live case: Jaylen Warren, Week 8 2026 — Sleeper had
// fum:1 with no fum_lost (he recovered it); the old fallback charged −2 where
// Sleeper charged 0.
export function toStatLine(raw) {
	if (!raw) return null;
	return {
		pass_yd: raw.pass_yd || 0,
		pass_td: raw.pass_td || 0,
		pass_int: raw.pass_int || 0,
		rush_yd: raw.rush_yd || 0,
		rush_td: raw.rush_td || 0,
		rec: raw.rec || 0,
		rec_yd: raw.rec_yd || 0,
		rec_td: raw.rec_td || 0,
		fum_lost: raw.fum_lost || 0,
		two_pt: (raw.pass_2pt || 0) + (raw.rush_2pt || 0) + (raw.rec_2pt || 0)
	};
}

/** True when a stat line is empty (player didn't record anything that week). */
export function isZeroLine(line) {
	return !line || Object.values(line).every((v) => !v);
}

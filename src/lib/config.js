// Contest configuration: scoring, roster shape, rounds.
// Scoring defaults are full PPR. Confirm the final system with the group before January
// and adjust here (one place) — every points calculation flows through computePoints().

export const ROUNDS = [
	{ id: 'WC', label: 'Wild Card', short: 'WC' },
	{ id: 'DIV', label: 'Divisional', short: 'DIV' },
	{ id: 'CONF', label: 'Conference', short: 'CONF' },
	{ id: 'SB', label: 'Super Bowl', short: 'SB' }
];

export const ROUND_IDS = ROUNDS.map((r) => r.id);

// Exactly one player per playoff team, 14 teams → these position counts must sum to 14.
export const POSITION_COUNTS = { QB: 3, RB: 4, WR: 4, TE: 3 };
export const ROSTER_SIZE = 14;
export const POSITIONS = Object.keys(POSITION_COUNTS);

// Fixed contest rule (Jake, Nov 10 2026): each player may be doubled only ONCE
// per entrant across all rounds — repeat doubling is not allowed. This constant
// is the single source of truth; the legacy `allow_repeat_doubler` settings key
// is no longer consulted anywhere (see store.getSettings and the doubler route).
export const ALLOW_REPEAT_DOUBLER = false;

// Fantasy points per unit of each stat-line field.
export const SCORING = {
	passYd: 0.04, // per passing yard (25 yds = 1 pt)
	passTD: 4,
	passInt: -2,
	rushYd: 0.1,
	rushTD: 6,
	rec: 1, // full PPR
	recYd: 0.1,
	recTD: 6,
	fumbleLost: -2,
	twoPt: 2 // per 2-point conversion (pass / rush / rec all land in two_pt)
};

// Maps a stat-line field (as stored / entered) to its scoring weight key.
export const STAT_FIELDS = {
	pass_yd: 'passYd',
	pass_td: 'passTD',
	pass_int: 'passInt',
	rush_yd: 'rushYd',
	rush_td: 'rushTD',
	rec: 'rec',
	rec_yd: 'recYd',
	rec_td: 'recTD',
	fum_lost: 'fumbleLost',
	two_pt: 'twoPt'
};

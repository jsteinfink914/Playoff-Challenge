// Pure contest logic — no I/O. Used by the API routes and by the unit tests.

import { POSITION_COUNTS, POSITIONS, ROSTER_SIZE, ROUND_IDS, SCORING, STAT_FIELDS } from './config.js';

/**
 * Validate a roster selection.
 * @param {string[]} picks player ids selected by the entrant
 * @param {Array<{id:string,name:string,team:string,position:string}>} pool full player pool
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateRoster(picks, pool) {
	const errors = [];
	if (!Array.isArray(picks)) return { ok: false, errors: ['Picks must be a list of player ids.'] };

	const byId = new Map(pool.map((p) => [p.id, p]));

	if (picks.length !== ROSTER_SIZE) {
		errors.push(`Roster must have exactly ${ROSTER_SIZE} players (got ${picks.length}).`);
	}
	if (new Set(picks).size !== picks.length) {
		errors.push('Roster contains a duplicate player.');
	}

	const teamCounts = {};
	const posCounts = Object.fromEntries(POSITIONS.map((p) => [p, 0]));

	for (const id of picks) {
		const player = byId.get(id);
		if (!player) {
			errors.push(`Unknown player: ${id}`);
			continue;
		}
		teamCounts[player.team] = (teamCounts[player.team] || 0) + 1;
		if (posCounts[player.position] !== undefined) posCounts[player.position] += 1;
	}

	for (const [team, n] of Object.entries(teamCounts)) {
		if (n > 1) errors.push(`More than one player from ${team} (${n}) — exactly one per team.`);
	}
	// 14 picks with ≤1 per team covers all 14 teams automatically when the pool has 14 teams.
	for (const pos of POSITIONS) {
		if (posCounts[pos] !== POSITION_COUNTS[pos]) {
			errors.push(`Need exactly ${POSITION_COUNTS[pos]} ${pos} (got ${posCounts[pos]}).`);
		}
	}

	return { ok: errors.length === 0, errors };
}

/**
 * Score one player's stat line for one round.
 * @param {Object} statLine fields: pass_yd, pass_td, pass_int, rush_yd, rush_td,
 *                          rec, rec_yd, rec_td, fum_lost, two_pt
 * @param {Object} [scoring] weights, defaults to full-PPR SCORING in config.js
 * @returns {number} fantasy points, rounded to 2 decimals
 */
export function computePoints(statLine = {}, scoring = SCORING) {
	let pts = 0;
	for (const [field, weightKey] of Object.entries(STAT_FIELDS)) {
		const v = Number(statLine?.[field]);
		if (Number.isFinite(v) && v !== 0) pts += v * (scoring[weightKey] ?? 0);
	}
	return Math.round(pts * 100) / 100;
}

/**
 * Build the leaderboard.
 * @param {Array<{id:string,name:string}>} entrants
 * @param {Object<string,string[]>} rosters entrantId -> player ids
 * @param {Array<{entrantId:string,round:string,playerId:string}>} doublerPicks
 * @param {Array<{playerId:string,round:string,points:number}>|Object<string,number>} playerScores
 *        array of score rows, or a map keyed `${playerId}|${round}` -> points
 * @param {string[]} [rounds] round ids to include (default all four)
 * @returns {Array<{entrantId,name,rounds:Object<string,number>,total:number,doublers:Object<string,string|null>}>}
 *          sorted by total desc (name asc breaks ties)
 */
export function computeLeaderboard(entrants, rosters, doublerPicks, playerScores, rounds = ROUND_IDS) {
	const scoreOf = (playerId, round) => {
		if (Array.isArray(playerScores)) {
			const row = playerScores.find((s) => s.playerId === playerId && s.round === round);
			return row ? Number(row.points) || 0 : 0;
		}
		const v = playerScores?.[`${playerId}|${round}`];
		return v == null ? 0 : Number(v) || 0;
	};

	const doublerOf = (entrantId, round) => {
		const pick = (doublerPicks || []).find((d) => d.entrantId === entrantId && d.round === round);
		return pick ? pick.playerId : null;
	};

	const rows = (entrants || []).map((e) => {
		const roster = rosters?.[e.id] || [];
		const roundPts = {};
		const doublers = {};
		let total = 0;
		for (const round of rounds) {
			let sum = 0;
			for (const pid of roster) sum += scoreOf(pid, round);
			const dbl = doublerOf(e.id, round);
			doublers[round] = dbl;
			// Doubled player contributes a second copy of his points for the round.
			if (dbl && roster.includes(dbl)) sum += scoreOf(dbl, round);
			roundPts[round] = Math.round(sum * 100) / 100;
			total += roundPts[round];
		}
		return { entrantId: e.id, name: e.name, rounds: roundPts, total: Math.round(total * 100) / 100, doublers };
	});

	rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
	return rows;
}

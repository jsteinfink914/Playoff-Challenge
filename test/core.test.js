import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoster, computePoints, computeLeaderboard } from '../src/lib/core.js';
import { PLAYERS } from '../src/lib/seed.js';
import { POSITION_COUNTS } from '../src/lib/config.js';

// Build a valid roster from the seed pool: walk teams in order, assign
// QB to the first 3 teams, RB to the next 4, WR to the next 4, TE to the last 3.
function buildValidRoster() {
	const teams = [...new Set(PLAYERS.map((p) => p.team))];
	const plan = [
		...Array(POSITION_COUNTS.QB).fill('QB'),
		...Array(POSITION_COUNTS.RB).fill('RB'),
		...Array(POSITION_COUNTS.WR).fill('WR'),
		...Array(POSITION_COUNTS.TE).fill('TE')
	];
	return teams.map((team, i) => PLAYERS.find((p) => p.team === team && p.position === plan[i]).id);
}

test('valid roster passes validation', () => {
	const picks = buildValidRoster();
	assert.equal(picks.length, 14);
	const { ok, errors } = validateRoster(picks, PLAYERS);
	assert.equal(ok, true, errors.join('; '));
});

test('two players from one team fails', () => {
	const picks = buildValidRoster();
	// Swap one pick for a second player from the first pick's team (same position slot type permitting).
	const first = PLAYERS.find((p) => p.id === picks[0]);
	const extra = PLAYERS.find((p) => p.team === first.team && p.id !== first.id && p.position === first.position)
		|| PLAYERS.find((p) => p.team === first.team && p.id !== first.id);
	// Replace the last pick with the extra same-team player.
	picks[picks.length - 1] = extra.id;
	const { ok, errors } = validateRoster(picks, PLAYERS);
	assert.equal(ok, false);
	assert.ok(errors.some((e) => e.includes(first.team)), `expected a one-per-team error, got: ${errors.join('; ')}`);
});

test('wrong position counts fail', () => {
	const picks = buildValidRoster();
	// Replace the TE pick (last team) with an RB from that same team.
	const last = PLAYERS.find((p) => p.id === picks[picks.length - 1]);
	const rb = PLAYERS.find((p) => p.team === last.team && p.position === 'RB');
	picks[picks.length - 1] = rb.id;
	const { ok, errors } = validateRoster(picks, PLAYERS);
	assert.equal(ok, false);
	assert.ok(errors.some((e) => e.includes('TE') || e.includes('RB')), `expected a position-count error, got: ${errors.join('; ')}`);
});

test('unknown player fails', () => {
	const picks = buildValidRoster();
	picks[0] = 'xxx-not-a-player';
	const { ok, errors } = validateRoster(picks, PLAYERS);
	assert.equal(ok, false);
	assert.ok(errors.some((e) => e.toLowerCase().includes('unknown')));
});

test('wrong roster size fails', () => {
	const picks = buildValidRoster().slice(0, 13);
	const { ok } = validateRoster(picks, PLAYERS);
	assert.equal(ok, false);
});

test('computePoints matches hand-computed full-PPR value', () => {
	// 300 pass yd*.04=12, 2 pass TD*4=8, 1 INT*-2=-2, 50 rush yd*.1=5, 1 rush TD=6,
	// 5 rec*1=5, 60 rec yd*.1=6, 1 rec TD=6, 1 fum lost*-2=-2, 1 two-pt*2=2  → 46
	const line = { pass_yd: 300, pass_td: 2, pass_int: 1, rush_yd: 50, rush_td: 1, rec: 5, rec_yd: 60, rec_td: 1, fum_lost: 1, two_pt: 1 };
	assert.equal(computePoints(line), 46);
	assert.equal(computePoints({}), 0);
	assert.equal(computePoints({ rec: 3, rec_yd: 30 }), 6);
});

test('leaderboard doubles the 2x player correctly', () => {
	const entrants = [
		{ id: 'a', name: 'Alice' },
		{ id: 'b', name: 'Bob' }
	];
	const rosters = { a: ['p1', 'p2'], b: ['p3', 'p4'] };
	const scores = [
		{ playerId: 'p1', round: 'WC', points: 10 },
		{ playerId: 'p2', round: 'WC', points: 5 },
		{ playerId: 'p3', round: 'WC', points: 20 },
		{ playerId: 'p4', round: 'WC', points: 7 },
		{ playerId: 'p1', round: 'DIV', points: 4 }
	];
	const doublers = [{ entrantId: 'a', round: 'WC', playerId: 'p1' }];
	const board = computeLeaderboard(entrants, rosters, doublers, scores);
	// Alice WC = 10 + 5 + extra 10 (doubled p1) = 25; DIV = 4 → total 29
	// Bob WC = 20 + 7 = 27; total 27. Alice leads despite Bob's bigger base WC.
	assert.equal(board[0].entrantId, 'a');
	assert.equal(board[0].rounds.WC, 25);
	assert.equal(board[0].rounds.DIV, 4);
	assert.equal(board[0].total, 29);
	assert.equal(board[1].entrantId, 'b');
	assert.equal(board[1].total, 27);
	assert.equal(board[0].doublers.WC, 'p1');
});

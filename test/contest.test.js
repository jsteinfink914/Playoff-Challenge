import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getContest, roundsWithLabels, SHADOW_ROUND_LABELS } from '../src/lib/server/contest.js';
import { validateRoster } from '../src/lib/core.js';
import { POSITION_COUNTS } from '../src/lib/config.js';

// The repo ships src/lib/shadow-data.json, so the active contest must resolve
// to the shadow contest: favorites field, Week 9/10/11 round labels + locks,
// all 14 teams eligible in WC/DIV/CONF, SB unused.
test('active contest is the shadow contest when shadow-data.json exists', async () => {
	const c = await getContest();
	assert.equal(c.mode, 'shadow');
	assert.equal(c.teams.length, 14);
	assert.deepEqual(
		c.teams.map((t) => t.abbr),
		['BUF', 'DEN', 'PIT', 'JAX', 'KC', 'CIN', 'NE', 'SF', 'MIN', 'NYG', 'CAR', 'CHI', 'DET', 'GB']
	);
	assert.ok(c.players.length >= 14 * 8, `pool too small: ${c.players.length}`);
	assert.ok(c.players.every((p) => p.id && p.name && p.team && p.position));
	// Every team/position slot needed for a legal roster exists in the pool.
	for (const t of c.teams) {
		for (const pos of Object.keys(POSITION_COUNTS)) {
			assert.ok(
				c.players.some((p) => p.team === t.abbr && p.position === pos),
				`no ${pos} for ${t.abbr}`
			);
		}
	}
	assert.deepEqual(c.teamsByRound.WC, c.teams.map((t) => t.abbr));
	assert.deepEqual(c.teamsByRound.DIV, c.teamsByRound.WC);
	assert.deepEqual(c.teamsByRound.CONF, c.teamsByRound.WC);
	assert.deepEqual(c.teamsByRound.SB, []);
	assert.equal(c.locks.roster_lock_at, '2026-11-06T01:00:00Z');
	assert.equal(c.locks.lock_WC, '2026-11-06T01:00:00Z');
	assert.equal(c.locks.lock_DIV, '2026-11-13T01:00:00Z');
	assert.equal(c.locks.lock_CONF, '2026-11-20T01:00:00Z');
	assert.equal(c.allowRepeatDoubler, true);
	assert.deepEqual(c.roundLabels, SHADOW_ROUND_LABELS);
});

test('a legal roster can be built from the shadow pool', async () => {
	const c = await getContest();
	const plan = [
		...Array(POSITION_COUNTS.QB).fill('QB'),
		...Array(POSITION_COUNTS.RB).fill('RB'),
		...Array(POSITION_COUNTS.WR).fill('WR'),
		...Array(POSITION_COUNTS.TE).fill('TE')
	];
	const picks = c.teams.map((t, i) => c.players.find((p) => p.team === t.abbr && p.position === plan[i]).id);
	const { ok, errors } = validateRoster(picks, c.players);
	assert.equal(ok, true, errors.join('; '));
});

test('roundsWithLabels applies shadow labels and keeps demo defaults otherwise', () => {
	const shadow = roundsWithLabels(SHADOW_ROUND_LABELS);
	assert.deepEqual(shadow.map((r) => r.label), ['Week 9 · Shadow', 'Week 10 · Shadow', 'Week 11 · Shadow', 'Super Bowl · unused']);
	assert.deepEqual(shadow.map((r) => r.id), ['WC', 'DIV', 'CONF', 'SB']);
	const demo = roundsWithLabels(null);
	assert.deepEqual(demo.map((r) => r.label), ['Wild Card', 'Divisional', 'Conference', 'Super Bowl']);
});

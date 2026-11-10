import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repeatDoubleConflict } from '../src/lib/core.js';
import { ALLOW_REPEAT_DOUBLER } from '../src/lib/config.js';

// Rule (Jake, Nov 10 2026): each player can be doubled only ONCE per entrant.
// The route handler can't be imported under plain node (it uses the $lib
// alias), so the conflict decision lives in core.js and is pinned here, the
// route is pinned by source, and the settings layer is pinned against the
// real DB: a stale allow_repeat_doubler='true' row must NOT re-allow repeats.

const picks = (...rows) => rows.map(([round, playerId]) => ({ round, playerId }));

test('repeat rule: no picks yet → no conflict', () => {
	assert.equal(repeatDoubleConflict([], 'WC', 'p1'), null);
});

test('repeat rule: player doubled in WC blocks doubling him in DIV (names the WC round)', () => {
	assert.equal(repeatDoubleConflict(picks(['WC', 'p1']), 'DIV', 'p1'), 'WC');
});

test('repeat rule: re-saving the SAME round never conflicts (change of mind before the lock)', () => {
	assert.equal(repeatDoubleConflict(picks(['WC', 'p1']), 'WC', 'p1'), null);
});

test('repeat rule: switching away and back within a round stays legal', () => {
	// After switching DIV from p2 to p3, the entrant's picks are WC=p1, DIV=p3.
	const now = picks(['WC', 'p1'], ['DIV', 'p3']);
	assert.equal(repeatDoubleConflict(now, 'DIV', 'p2'), null, 'p2 is free again');
	assert.equal(repeatDoubleConflict(now, 'DIV', 'p3'), null, 'same-round re-save');
	assert.equal(repeatDoubleConflict(now, 'CONF', 'p3'), 'DIV', 'but p3 is burned for other rounds');
	assert.equal(repeatDoubleConflict(now, 'CONF', 'p1'), 'WC');
});

test('repeat rule: a different player in another round is fine', () => {
	assert.equal(repeatDoubleConflict(picks(['WC', 'p1']), 'DIV', 'p2'), null);
});

test('repeat rule: the fixed constant is off', () => {
	assert.equal(ALLOW_REPEAT_DOUBLER, false);
});

test('repeat rule: route enforces the conflict unconditionally (no settings gate)', () => {
	const src = fs.readFileSync(new URL('../src/routes/api/doubler/+server.js', import.meta.url), 'utf8');
	assert.ok(src.includes('repeatDoubleConflict'), 'route must use the shared conflict check');
	assert.ok(!src.includes('allowRepeatDoubler'), 'route must not consult the legacy repeat setting at all');
	assert.ok(src.includes('each player can be doubled only once'), 'route must return the clear once-only message');
});

test('repeat rule: a stale allow_repeat_doubler=true row in settings does NOT re-allow repeats', async () => {
	const { getSettings, setSetting } = await import('../src/lib/server/store.js');
	await setSetting('allow_repeat_doubler', 'true');
	const settings = await getSettings();
	assert.equal(settings.allowRepeatDoubler, false);
});

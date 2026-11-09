import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshRound, refreshRound, ensureScoresFresh, stampKey, SCORES_FRESH_MS } from '../src/lib/server/scoreFreshness.js';
import { getSetting } from '../src/lib/server/store.js';
import { query } from '../src/lib/server/db.js';

const NOW = Date.parse('2026-11-09T13:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

// ---------- Pure freshness decisions ----------

test('freshness: never loaded → refresh (live week)', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: null, now: NOW, nflWeek: 9, stateWeek: 9 }), true);
});

test('freshness: never loaded but round already two weeks old → still refresh (first load always lands)', () => {
	// (a) is unconditional: a round that never loaded has no scores at all.
	assert.equal(shouldRefreshRound({ lastLoadedAt: null, now: NOW, nflWeek: 7, stateWeek: 9 }), true);
});

test('freshness: loaded 5 minutes ago → skip', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: iso(NOW - 5 * 60 * 1000), now: NOW, nflWeek: 9, stateWeek: 9 }), false);
});

test('freshness: loaded exactly at the 15-minute boundary → skip; just past it → refresh', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: iso(NOW - SCORES_FRESH_MS), now: NOW, nflWeek: 9, stateWeek: 9 }), false);
	assert.equal(shouldRefreshRound({ lastLoadedAt: iso(NOW - SCORES_FRESH_MS - 1), now: NOW, nflWeek: 9, stateWeek: 9 }), true);
});

test('freshness: stale + just-finished week (stateWeek - 1) → refresh (finals + corrections)', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: iso(NOW - 60 * 60 * 1000), now: NOW, nflWeek: 8, stateWeek: 9 }), true);
});

test('freshness: stale + two-weeks-old round → frozen, skip', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: iso(NOW - 60 * 60 * 1000), now: NOW, nflWeek: 7, stateWeek: 9 }), false);
});

test('freshness: future week is never attempted, even if never loaded', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: null, now: NOW, nflWeek: 10, stateWeek: 9 }), false);
});

test('freshness: corrupt stamp counts as never loaded', () => {
	assert.equal(shouldRefreshRound({ lastLoadedAt: 'not-a-date', now: NOW, nflWeek: 9, stateWeek: 9 }), true);
});

// ---------- Stamping behavior (Sleeper stubbed; settings in the local DB) ----------

const realFetch = globalThis.fetch;
function stubSleeper(statsPayload) {
	globalThis.fetch = async (url) => {
		const u = String(url);
		if (u.includes('/state/nfl')) return { ok: true, json: async () => ({ season: '2026', week: 9 }) };
		if (u.includes('/stats/nfl/')) return { ok: true, json: async () => statsPayload };
		throw new Error(`unexpected fetch: ${u}`);
	};
}
const clearStamp = () => query('DELETE FROM settings WHERE key = $1', [stampKey('WC')]);

test('freshness: empty stats (week not posted yet) → no stamp, so the next read retries', async () => {
	await clearStamp();
	stubSleeper({});
	try {
		assert.equal(await refreshRound('WC', { season: '2026', week: 9 }), false);
		assert.equal(await getSetting(stampKey('WC')), null);
	} finally {
		globalThis.fetch = realFetch;
		await clearStamp();
	}
});

test('freshness: successful load stamps scoresLoadedAt:<round>', async () => {
	await clearStamp();
	// Josh Allen (BUF QB, sleeperId 4984) with a non-zero Week 9 line.
	stubSleeper({ 4984: { pass_yd: 200, pass_td: 2, pass_int: 1, rush_yd: 20, rush_td: 1 } });
	try {
		assert.equal(await refreshRound('WC', { season: '2026', week: 9 }), true);
		const stamp = await getSetting(stampKey('WC'));
		assert.ok(stamp, 'stamp must be set after a successful load');
		assert.ok(!Number.isNaN(Date.parse(stamp)), `stamp must be an ISO timestamp, got ${stamp}`);
	} finally {
		globalThis.fetch = realFetch;
		await clearStamp();
	}
});

test('freshness: ensureScoresFresh never throws when Sleeper is down', async () => {
	globalThis.fetch = async () => {
		throw new Error('sleeper down');
	};
	try {
		await ensureScoresFresh(); // must resolve — the leaderboard serves stored scores
	} finally {
		globalThis.fetch = realFetch;
	}
});

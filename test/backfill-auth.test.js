import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The backfill endpoint's ONLY gate is the admin key (store.isAdmin). These
// tests pin that gate directly, plus source-level pins that the route does
// not (re)introduce any other credential path.
process.env.ADMIN_KEY = 'test-admin-key';

const { isAdmin } = await import('../src/lib/server/store.js');
const req = (headers = {}) => ({ headers: new Headers(headers) });

test('backfill auth: no key → rejected', () => {
	assert.equal(isAdmin(req(), null), false);
});

test('backfill auth: scheduler-style headers do not authorize (endpoint is admin-only)', () => {
	assert.equal(isAdmin(req({ 'x-vercel-cron': '1' }), null), false);
	assert.equal(isAdmin(req({ authorization: 'Bearer test-admin-key' }), null), false);
	assert.equal(isAdmin(req({ 'x-vercel-cron': '1', authorization: 'Bearer whatever' }), null), false);
});

test('backfill auth: wrong admin key → rejected', () => {
	assert.equal(isAdmin(req({ 'x-admin-key': 'nope' }), null), false);
});

test('backfill auth: correct admin key → authorized (plain run and override alike)', () => {
	assert.equal(isAdmin(req({ 'x-admin-key': 'test-admin-key' }), null), true);
});

test('backfill auth: route source has no non-admin credential path; vercel.json crons are gone', () => {
	const src = fs.readFileSync(new URL('../src/routes/api/cron/scores/+server.js', import.meta.url), 'utf8');
	assert.ok(src.includes('isAdmin'), 'route must gate on isAdmin');
	assert.ok(!src.includes('x-vercel-cron'), 'route must not trust a scheduler header');
	assert.ok(!src.includes('CRON_SECRET'), 'route must not reference a cron secret');
	assert.ok(!src.includes('Bearer'), 'route must not accept bearer tokens');
	assert.equal(fs.existsSync(new URL('../vercel.json', import.meta.url)), false, 'vercel.json (crons) must be deleted');
});

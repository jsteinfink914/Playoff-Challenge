// npm run demo:scores
// Loads the SAMPLE Wild Card stat lines (src/lib/seed.js) into a RUNNING server via
// the admin endpoint, so the leaderboard can be demoed. Sample data only — wipe it
// with POST /api/admin/seed (or the button on /admin).
//
//   BASE_URL=http://localhost:5173 ADMIN_KEY=commish npm run demo:scores

const base = process.env.BASE_URL || 'http://localhost:5173';
const key = process.env.ADMIN_KEY || 'commish';

const res = await fetch(`${base}/api/admin/seed-scores`, {
	method: 'POST',
	headers: { 'content-type': 'application/json', 'x-admin-key': key },
	body: '{}'
});
const data = await res.json();
if (!res.ok) {
	console.error(`Failed (${res.status}):`, data.error || data);
	process.exit(1);
}
console.log(`Loaded ${data.loaded.length} sample WC stat lines:`);
for (const row of data.loaded) console.log(`  ${row.playerId} (${row.round}) = ${row.points} pts`);

import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db.js';
import { ensureSeeded, getPool, getRosters, getDoublerPicks, getScores, getSettings } from '$lib/server/store.js';
import { ensureScoresFresh } from '$lib/server/scoreFreshness.js';
import { computeLeaderboard } from '$lib/core.js';
import { ROUND_IDS, ROSTER_SIZE } from '$lib/config.js';

// GET /api/leaderboard
// Before the roster lock: entrant names + who has submitted + per-round 2x
// pick STATUS (booleans only — never which player was picked).
// After the lock: full rosters, per-round breakdown, totals, and the same 2x
// status booleans. A round's 2x IDENTITY (the doubledRounds badges) is only
// revealed once that round's own lock has passed. The `reveals` blocks make
// that reveal explicit per locked round: who doubled whom, his points, and
// the bonus earned. Unlocked rounds contribute no block and no identity
// anywhere in the payload.
export async function GET() {
	try {
		await ensureSeeded();
		const settings = await getSettings();
		const locked = settings.rosterLockAt ? new Date().toISOString() >= settings.rosterLockAt : false;
		const entrants = await query('SELECT id, name FROM entrants ORDER BY name');
		const [rosters, doublerPicks] = await Promise.all([getRosters(), getDoublerPicks()]);

		// Per-entrant, per-round: has a 2x pick been made? Boolean only — the
		// picked player's identity is never included in this shape.
		const doublerStatusFor = (entrantId) =>
			Object.fromEntries(
				ROUND_IDS.map((r) => [r, doublerPicks.some((d) => d.entrantId === entrantId && d.round === r)])
			);

		if (!locked) {
			return json({
				locked: false,
				rosterLockAt: settings.rosterLockAt,
				entrants: entrants.map((e) => ({
					entrantId: e.id,
					name: e.name,
					hasSubmitted: (rosters[e.id] || []).length === ROSTER_SIZE,
					doublerStatus: doublerStatusFor(e.id)
				}))
			});
		}

		// Scores refresh on read: bring due rounds up to date from Sleeper
		// before computing standings (see scoreFreshness.js for the rule).
		// Never throws — on any failure the stored scores are served.
		await ensureScoresFresh();
		const [pool, scores] = await Promise.all([getPool(), getScores()]);
		const byId = new Map(pool.map((p) => [p.id, p]));
		const board = computeLeaderboard(entrants, rosters, doublerPicks, scores);
		const doublerFor = (entrantId, round) =>
			doublerPicks.find((d) => d.entrantId === entrantId && d.round === round)?.playerId || null;
		const pointsFor = (playerId, round) =>
			scores.find((s) => s.playerId === playerId && s.round === round)?.points ?? 0;
		// 2x identity for a round stays secret until that round's lock passes.
		const now = new Date().toISOString();
		const roundRevealed = (r) => {
			const lock = settings.roundLocks[r];
			return !!lock && now >= lock;
		};

		// Post-round 2x REVEAL: one block per round whose lock has passed,
		// listing every entrant with a submitted (complete) roster — who they
		// doubled, that player's points in the round, and the bonus earned
		// (the extra copy of those points, counted only when the pick is on
		// the entrant's roster, matching computeLeaderboard). An entrant with
		// a roster but no pick for the round gets an explicit null pick
		// ("no pick"). Ordered by the doubled player's round points, desc.
		const hasSubmitted = (entrantId) => (rosters[entrantId] || []).length === ROSTER_SIZE;
		const reveals = ROUND_IDS.filter(roundRevealed).map((round) => ({
			round,
			picks: entrants
				.filter((e) => hasSubmitted(e.id))
				.map((e) => {
					const pid = doublerFor(e.id, round);
					if (!pid) {
						return { entrantId: e.id, name: e.name, playerId: null, playerName: null, team: null, position: null, points: 0, bonus: 0 };
					}
					const p = byId.get(pid);
					const pts = pointsFor(pid, round);
					return {
						entrantId: e.id,
						name: e.name,
						playerId: pid,
						playerName: p?.name || pid,
						team: p?.team || '',
						position: p?.position || '',
						points: pts,
						bonus: (rosters[e.id] || []).includes(pid) ? pts : 0
					};
				})
				.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
		}));

		return json({
			locked: true,
			rosterLockAt: settings.rosterLockAt,
			reveals,
			standings: board.map((row) => ({
				...row,
				// computeLeaderboard's `doublers` maps round -> playerId. Keep the
				// identity only for rounds whose lock has passed; for unlocked
				// rounds expose null (the boolean lives in doublerStatus).
				doublers: Object.fromEntries(
					ROUND_IDS.map((r) => [r, roundRevealed(r) ? (row.doublers?.[r] ?? null) : null])
				),
				doublerStatus: doublerStatusFor(row.entrantId),
				roster: (rosters[row.entrantId] || []).map((pid) => {
					const p = byId.get(pid);
					const perRound = {};
					for (const r of ROUND_IDS) perRound[r] = pointsFor(pid, r);
					return {
						playerId: pid,
						name: p?.name || pid,
						team: p?.team || '',
						position: p?.position || '',
						pointsByRound: perRound,
						doubledRounds: ROUND_IDS.filter((r) => roundRevealed(r) && doublerFor(row.entrantId, r) === pid)
					};
				})
			}))
		});
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}

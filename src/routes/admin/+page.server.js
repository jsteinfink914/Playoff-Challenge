// Public, read-only contest info for the Admin page. No admin key is involved:
// this load returns ONLY public fields (lock times, the repeat-doubler rule,
// round labels) straight from the server-side store. All writes stay behind
// the key-gated /api/admin/* endpoints, which this page no longer calls.
import { getSettings } from '$lib/server/store.js';
import { getContest, roundsWithLabels } from '$lib/server/contest.js';
import { SCORING } from '$lib/config.js';

export async function load() {
	const [settings, contest] = await Promise.all([getSettings(), getContest()]);
	return {
		mode: contest.mode,
		rosterLockAt: settings.rosterLockAt,
		roundLocks: settings.roundLocks,
		rounds: roundsWithLabels(settings.roundLabels),
		allowRepeatDoubler: settings.allowRepeatDoubler,
		scoring: SCORING
	};
}

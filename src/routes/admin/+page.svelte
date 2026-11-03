<script>
	import { ROUNDS } from '$lib/config.js';

	let adminKey = '';
	let authed = false;
	let settings = null;
	let error = '';
	let msg = '';

	// stat entry form
	let pool = null;
	let playerId = '';
	let round = 'WC';
	let statLine = { pass_yd: 0, pass_td: 0, pass_int: 0, rush_yd: 0, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, two_pt: 0 };
	const STAT_LABELS = { pass_yd: 'Pass yds', pass_td: 'Pass TD', pass_int: 'INT thrown', rush_yd: 'Rush yds', rush_td: 'Rush TD', rec: 'Receptions', rec_yd: 'Rec yds', rec_td: 'Rec TD', fum_lost: 'Fumbles lost', two_pt: '2-pt conv' };

	const headers = () => ({ 'content-type': 'application/json', 'x-admin-key': adminKey });
	$: rounds = pool?.rounds || ROUNDS;

	async function login() {
		error = '';
		const res = await fetch('/api/admin/settings', { headers: { 'x-admin-key': adminKey } });
		if (!res.ok) { error = 'Wrong admin key.'; return; }
		settings = await res.json();
		authed = true;
		const pr = await fetch('/api/pool');
		pool = await pr.json();
		if (pool.players.length) playerId = pool.players[0].id;
	}

	async function saveScore() {
		error = ''; msg = '';
		const clean = Object.fromEntries(Object.entries(statLine).map(([k, v]) => [k, Number(v) || 0]));
		const res = await fetch('/api/admin/scores', { method: 'POST', headers: headers(), body: JSON.stringify({ playerId, round, statLine: clean }) });
		const d = await res.json();
		if (!res.ok) { error = d.error; return; }
		msg = `Saved: ${playerId} in ${round} = ${d.points} pts ✔`;
	}

	async function saveSettings() {
		error = ''; msg = '';
		const body = {
			rosterLockAt: settings.rosterLockAt,
			roundLocks: settings.roundLocks,
			allowRepeatDoubler: settings.allowRepeatDoubler
		};
		const res = await fetch('/api/admin/settings', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
		const d = await res.json();
		if (!res.ok) { error = d.error; return; }
		settings = d.settings;
		msg = 'Settings saved ✔';
	}

	async function adminPost(path, label) {
		error = ''; msg = '';
		const res = await fetch(path, { method: 'POST', headers: headers(), body: '{}' });
		const d = await res.json();
		if (!res.ok) { error = d.error; return; }
		msg = `${label} ✔ ${d.note || (d.loaded ? d.loaded.length + ' sample stat lines loaded' : '')}`;
	}
</script>

<h1>Admin</h1>

{#if !authed}
	<div class="card">
		<label for="k">Admin key</label>
		<input id="k" bind:value={adminKey} type="password" placeholder="ADMIN_KEY (default: commish)" />
		{#if error}<p class="error">{error}</p>{/if}
		<p style="margin-top:12px"><button on:click={login}>Open admin</button></p>
	</div>
{:else}
	{#if error}<p class="error">{error}</p>{/if}
	{#if msg}<p class="success">{msg}</p>{/if}

	<div class="card">
		<h2 style="margin-top:0">Enter a stat line</h2>
		<p class="muted small">Points are computed from the stat line with the contest scoring (full PPR default) when you save. In January this manual entry gets replaced by the stats feed.</p>
		<label for="pl">Player</label>
		<select id="pl" bind:value={playerId}>
			{#if pool}{#each pool.players as p}<option value={p.id}>{p.team} · {p.position} · {p.name}</option>{/each}{/if}
		</select>
		<label for="rd">Round</label>
		<select id="rd" bind:value={round}>
			{#each rounds as r}<option value={r.id}>{r.label}</option>{/each}
		</select>
		<div class="row">
			{#each Object.keys(STAT_LABELS) as f}
				<div>
					<label for={`st-${f}`}>{STAT_LABELS[f]}</label>
					<input id={`st-${f}`} type="number" bind:value={statLine[f]} />
				</div>
			{/each}
		</div>
		<p style="margin-top:14px"><button on:click={saveScore}>Save score</button></p>
	</div>

	<div class="card">
		<h2 style="margin-top:0">Settings</h2>
		<label for="rl">Roster lock (ISO datetime)</label>
		<input id="rl" bind:value={settings.rosterLockAt} />
		{#each rounds as r}
			<label for={`lk-${r.id}`}>{r.label} 2x lock (ISO datetime)</label>
			<input id={`lk-${r.id}`} bind:value={settings.roundLocks[r.id]} />
		{/each}
		<label>
			<input type="checkbox" bind:checked={settings.allowRepeatDoubler} style="width:auto" />
			Allow doubling the same player in multiple rounds
		</label>
		<p style="margin-top:12px"><button on:click={saveSettings}>Save settings</button></p>
	</div>

	<div class="card">
		<h2 style="margin-top:0">Contest tools</h2>
		<p class="muted small">Load sample Wild Card stat lines to demo the leaderboard, or reseed everything (wipes entrants, rosters, picks and scores). Reseed loads the active contest — the shadow contest while <code>src/lib/shadow-data.json</code> exists, otherwise the demo data.</p>
		<div class="row">
			<button class="secondary" on:click={() => adminPost('/api/admin/seed-scores', 'Sample scores loaded')}>Load sample scores</button>
			<button class="danger" on:click={() => adminPost('/api/admin/seed', 'Reseeded')}>Reseed (wipe + reload contest)</button>
		</div>
	</div>
{/if}

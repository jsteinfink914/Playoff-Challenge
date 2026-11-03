<script>
	import { onMount } from 'svelte';
	import { POSITION_COUNTS, POSITIONS } from '$lib/config.js';
	import { validateRoster } from '$lib/core.js';

	let pool = null;
	let me = null;
	let name = '';
	let pin = '';
	let authError = '';
	let picks = [];
	let saveError = '';
	let saveMsg = '';
	let saving = false;

	onMount(async () => {
		const res = await fetch('/api/pool');
		pool = await res.json();
		try { me = JSON.parse(localStorage.getItem('pc_entrant') || 'null'); } catch { me = null; }
		if (me) await loadMine();
	});

	async function loadMine() {
		const res = await fetch(`/api/roster?entrantId=${encodeURIComponent(me.id)}&pin=${encodeURIComponent(me.pin)}`);
		if (res.ok) {
			const d = await res.json();
			picks = d.picks || [];
		}
	}

	async function claim() {
		authError = '';
		const res = await fetch('/api/entrants', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, pin })
		});
		const d = await res.json();
		if (!res.ok) { authError = d.error || 'Could not claim name.'; return; }
		me = { id: d.id, name: d.name, pin };
		localStorage.setItem('pc_entrant', JSON.stringify(me));
		await loadMine();
	}

	function signOut() {
		me = null; picks = [];
		localStorage.removeItem('pc_entrant');
	}

	function toggle(player) {
		if (picks.includes(player.id)) picks = picks.filter((p) => p !== player.id);
		else picks = [...picks, player.id];
	}

	$: byId = pool ? new Map(pool.players.map((p) => [p.id, p])) : new Map();
	$: counts = (() => {
		const c = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
		for (const id of picks) { const pl = byId.get(id); if (pl) c[pl.position]++; }
		return c;
	})();
	$: teamOf = (team) => picks.map((id) => byId.get(id)).find((p) => p && p.team === team);
	$: validation = pool ? validateRoster(picks, pool.players) : { ok: false, errors: [] };
	$: locked = pool?.locks?.rosterLocked;
</script>

<h1>Enter / Build Your Roster</h1>
<p class="muted">One player from <strong>each</strong> of the 14 playoff teams: 3 QB · 4 RB · 4 WR · 3 TE. No kickers, no defenses. Most total points across all four rounds wins.</p>

{#if !pool}
	<p class="muted">Loading player pool…</p>
{:else if !me}
	<div class="card">
		<h2 style="margin-top:0">Claim your name</h2>
		<p class="muted small">Pick a name and a 4–8 digit PIN. You'll use the same name + PIN to come back and set your weekly 2x pick — no password, no account.</p>
		<label for="nm">Name</label>
		<input id="nm" bind:value={name} placeholder="e.g. Jake" autocomplete="off" />
		<label for="pn">PIN (4–8 digits)</label>
		<input id="pn" bind:value={pin} inputmode="numeric" placeholder="e.g. 1234" autocomplete="off" />
		{#if authError}<p class="error">{authError}</p>{/if}
		<p style="margin-top:14px"><button on:click={claim} disabled={!name.trim() || !pin}>Claim / Sign in</button></p>
	</div>
{:else}
	<div class="card">
		<p>Signed in as <strong>{me.name}</strong>. <a href={'#'} on:click|preventDefault={signOut}>Sign out</a></p>
		{#if locked}<p class="error">Rosters locked {new Date(pool.locks.rosterLockAt).toLocaleString()} — picks are final.</p>{/if}
	</div>

	<div class="sticky-bar">
		<div class="counters">
			{#each POSITIONS as pos}
				<span class="counter" class:done={counts[pos] === POSITION_COUNTS[pos]} class:over={counts[pos] > POSITION_COUNTS[pos]}>
					{pos} {counts[pos]}/{POSITION_COUNTS[pos]}
				</span>
			{/each}
			<span class="counter" class:done={picks.length === 14}>Total {picks.length}/14</span>
		</div>
		<button on:click={async () => {
			saving = true; saveError = ''; saveMsg = '';
			const res = await fetch('/api/roster', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entrantId: me.id, pin: me.pin, picks }) });
			const d = await res.json();
			saving = false;
			if (!res.ok) saveError = (d.errors || [d.error]).join(' ');
			else saveMsg = 'Roster saved ✔';
		}} disabled={!validation.ok || saving || locked}>
			{saving ? 'Saving…' : 'Save roster'}
		</button>
		{#if saveError}<p class="error">{saveError}</p>{/if}
		{#if saveMsg}<p class="success">{saveMsg}</p>{/if}
		{#if !validation.ok && picks.length > 0}
			<p class="muted small">{validation.errors[0]}</p>
		{/if}
	</div>

	{#each pool.teams as team}
		<div class="team-block card">
			<div class="team-head">
				<span><span class="abbr">{team.abbr}</span> <span class="muted">{team.name} · {team.conf} #{team.seed}</span></span>
				{#if teamOf(team.abbr)}<span class="badge green">✓ {teamOf(team.abbr).name}</span>{/if}
			</div>
			<div class="player-grid">
				{#each pool.players.filter((p) => p.team === team.abbr) as player}
					<button class="player" class:selected={picks.includes(player.id)}
						disabled={locked || (!picks.includes(player.id) && teamOf(team.abbr) && teamOf(team.abbr).id !== player.id)}
						on:click={() => toggle(player)}>
						<span class="pos">{player.position}</span> {player.name}
					</button>
				{/each}
			</div>
		</div>
	{/each}
{/if}

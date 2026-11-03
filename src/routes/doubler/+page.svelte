<script>
	import { onMount } from 'svelte';
	import { ROUNDS } from '$lib/config.js';

	let pool = null;
	let me = null;
	let myPicks = [];
	let doublers = {};
	let round = 'WC';
	let msg = '';
	let error = '';
	let saving = false;

	onMount(async () => {
		try { me = JSON.parse(localStorage.getItem('pc_entrant') || 'null'); } catch { me = null; }
		const res = await fetch('/api/pool');
		pool = await res.json();
		if (me) {
			const r = await fetch(`/api/roster?entrantId=${encodeURIComponent(me.id)}&pin=${encodeURIComponent(me.pin)}`);
			if (r.ok) {
				const d = await r.json();
				myPicks = d.picks || [];
				doublers = d.doublers || {};
			}
		}
	});

	$: byId = pool ? new Map(pool.players.map((p) => [p.id, p])) : new Map();
	$: aliveTeams = pool?.teamsByRound?.[round] || [];
	$: eligible = myPicks.map((id) => byId.get(id)).filter((p) => p && aliveTeams.includes(p.team));
	$: lockAt = pool?.locks?.roundLocks?.[round];
	$: roundLocked = lockAt ? new Date().toISOString() >= lockAt : false;
	$: current = doublers[round];

	async function choose(playerId) {
		saving = true; msg = ''; error = '';
		const res = await fetch('/api/doubler', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ entrantId: me.id, pin: me.pin, round, playerId })
		});
		const d = await res.json();
		saving = false;
		if (!res.ok) { error = d.error || 'Could not save 2x pick.'; return; }
		doublers = { ...doublers, [round]: playerId };
		msg = `2x pick saved for the ${round} round ✔`;
	}
</script>

<h1>Weekly 2x Pick</h1>
<p class="muted">Each round, pick ONE player from your roster to score <strong>double</strong> that round. His team has to be playing that round. You can change it until the round locks.{pool && !pool.allowRepeatDoubler ? ' Repeat doublers are OFF for this contest — you can only double a player once all playoffs.' : ''}</p>

{#if !pool}
	<p class="muted">Loading…</p>
{:else if !me}
	<div class="card"><p>You need to claim your name first — <a href="/enter">go to Enter</a>.</p></div>
{:else if myPicks.length === 0}
	<div class="card"><p>No roster saved yet — <a href="/enter">build your roster</a> first.</p></div>
{:else}
	<label for="round">Round</label>
	<select id="round" bind:value={round}>
		{#each ROUNDS as r}<option value={r.id}>{r.label}</option>{/each}
	</select>
	<p class="muted small">
		{#if lockAt}Locks {new Date(lockAt).toLocaleString()}{#if roundLocked} — <span class="error">LOCKED</span>{/if}{/if}
		{#if current} · Current pick: <strong>{byId.get(current)?.name}</strong>{/if}
	</p>
	{#if error}<p class="error">{error}</p>{/if}
	{#if msg}<p class="success">{msg}</p>{/if}
	<div class="player-grid">
		{#each eligible as p}
			<button class="player" class:selected={current === p.id} disabled={roundLocked || saving} on:click={() => choose(p.id)}>
				<span class="pos">{p.position} · {p.team}</span> {p.name}
				{#if current === p.id}<span class="badge">2x</span>{/if}
			</button>
		{/each}
	</div>
	{#if eligible.length === 0}<p class="muted">None of your players' teams are playing this round.</p>{/if}
	<p class="muted small">Greyed-out rounds, eliminated teams and bye teams simply aren't listed — only players actually playing this round can be doubled.</p>
{/if}

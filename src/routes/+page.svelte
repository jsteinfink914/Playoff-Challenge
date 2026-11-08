<script>
	import { onMount } from 'svelte';
	import { ROUNDS } from '$lib/config.js';

	let data = null;
	let pool = null;
	let error = '';
	let me = null;
	let expanded = null;

	onMount(async () => {
		try { me = JSON.parse(localStorage.getItem('pc_entrant') || 'null'); } catch { me = null; }
		try {
			const [res, pr] = await Promise.all([fetch('/api/leaderboard'), fetch('/api/pool')]);
			data = await res.json();
			if (!res.ok) error = data.error || 'Failed to load leaderboard.';
			if (pr.ok) pool = await pr.json();
		} catch (e) {
			error = e.message;
		}
	});

	$: rounds = pool?.rounds || ROUNDS;
	$: roundNames = rounds.map((r) => r.label).join(', ');
	// ONE 2x grid covers every round. Open rounds show pick STATUS only (the
	// doublerStatus booleans — identity stays secret). A round whose own lock
	// has passed appears in the leaderboard payload's `reveals`, and its cells
	// switch to the doubled player's name + points, read ONLY from that
	// reveal data; an entrant absent from the reveal block (or with a null
	// pick in it) shows "no pick". The payload carries no identity for
	// unrevealed rounds, so the grid cannot leak one.
	$: revealPicks = new Map(
		(data?.reveals || []).map((rev) => [rev.round, new Map(rev.picks.map((pk) => [pk.entrantId, pk]))])
	);

	const roundRevealed = (round) => revealPicks.has(round);
	const pickFor = (entrantId, round) => revealPicks.get(round)?.get(entrantId) || null;
	const fmt = (n) => (typeof n === 'number' ? n.toFixed(1).replace(/\.0$/, '') : n);
</script>

{#snippet doublerGrid(rows)}
	<h2>2x picks</h2>
	<p class="muted small">A ✓ means the double-points pick is in for a round still to come — who it is stays secret. Once a round locks, the cell shows who they doubled and what that player scored.</p>
	<table>
		<thead><tr><th>Name</th>{#each rounds as r}<th>{r.label}</th>{/each}</tr></thead>
		<tbody>
			{#each rows as e}
				<tr class:me={me && me.id === e.entrantId}>
					<td>{e.name}</td>
					{#each rounds as r}
						<td>
							{#if roundRevealed(r.id)}
								{#if pickFor(e.entrantId, r.id)?.playerId}
									{pickFor(e.entrantId, r.id).position} {pickFor(e.entrantId, r.id).playerName} <span class="muted">({pickFor(e.entrantId, r.id).team})</span> <span class="muted small">· {fmt(pickFor(e.entrantId, r.id).points)}</span>
								{:else}
									<span class="muted">no pick</span>
								{/if}
							{:else if e.doublerStatus?.[r.id]}✓{:else}–{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<h1>Leaderboard</h1>

{#if error}
	<p class="error">{error}</p>
{:else if !data}
	<p class="muted">Loading…</p>
{:else if !data.locked}
	<div class="card">
		<p><strong>Rosters are hidden until the lock</strong> ({data.rosterLockAt ? new Date(data.rosterLockAt).toLocaleString() : 'TBD'}).
		Points accumulate across all four rounds — {roundNames} — and each round you pick one of your players to score double.</p>
		<p class="muted">Roster: exactly one player from each of the 14 playoff teams — 3 QB / 4 RB / 4 WR / 3 TE.</p>
	</div>
	<h2>Entrants ({data.entrants.length})</h2>
	{#if data.entrants.length === 0}
		<p class="muted">Nobody's in yet. Be the first — <a href="/enter">enter here</a>.</p>
	{:else}
		<table>
			<thead><tr><th>Name</th><th>Roster in?</th></tr></thead>
			<tbody>
				{#each data.entrants as e}
					<tr class:me={me && me.id === e.entrantId}>
						<td>{e.name}</td>
						<td>{#if e.hasSubmitted}<span class="badge green">IN</span>{:else}<span class="badge grey">not yet</span>{/if}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{@render doublerGrid(data.entrants)}
	{/if}
{:else}
	<p class="muted small">Rosters locked {data.rosterLockAt ? new Date(data.rosterLockAt).toLocaleString() : ''}. <span class="badge">2x</span> marks that round's doubled player.</p>
	{#if data.standings.length === 0}
		<p class="muted">No entrants.</p>
	{:else}
		<table>
			<thead><tr><th>#</th><th>Name</th>{#each rounds as r}<th>{r.label}</th>{/each}<th>Total</th></tr></thead>
			<tbody>
				{#each data.standings as row, i}
					<tr class:me={me && me.id === row.entrantId}>
						<td>{i + 1}</td>
						<td>
							<a href={'#'} on:click|preventDefault={() => (expanded = expanded === row.entrantId ? null : row.entrantId)}>{row.name}</a>
						</td>
						{#each rounds as r}<td>{fmt(row.rounds[r.id])}</td>{/each}
						<td class="total">{fmt(row.total)}</td>
					</tr>
					{#if expanded === row.entrantId}
						<tr><td colspan="7">
							<ul class="roster-list">
								{#each row.roster as p}
									<li>
										<span>{p.position} {p.name} <span class="muted">({p.team})</span>
											{#each p.doubledRounds as r}<span class="badge">2x {r}</span>{/each}
										</span>
										<span class="pts">{#each rounds as r, ri}{#if ri > 0} · {/if}{r.short} {fmt(p.pointsByRound[r.id])}{/each}</span>
									</li>
								{/each}
							</ul>
						</td></tr>
					{/if}
				{/each}
			</tbody>
		</table>
		{@render doublerGrid(data.standings)}
	{/if}
{/if}

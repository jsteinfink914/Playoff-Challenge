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

	const roundLabel = (id) => rounds.find((x) => x.id === id)?.label || id;
	const fmt = (n) => (typeof n === 'number' ? n.toFixed(1).replace(/\.0$/, '') : n);
</script>

{#snippet doublerGrid(rows)}
	<h2>2x picks</h2>
	<p class="muted small">Who has their double-points pick in for each round. The picks themselves stay secret until that round locks.</p>
	<table>
		<thead><tr><th>Name</th>{#each rounds as r}<th>{r.label}</th>{/each}</tr></thead>
		<tbody>
			{#each rows as e}
				<tr class:me={me && me.id === e.entrantId}>
					<td>{e.name}</td>
					{#each rounds as r}<td>{#if e.doublerStatus?.[r.id]}✓{:else}–{/if}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#snippet revealBlocks(reveals)}
	{#each reveals || [] as rev}
		<h2>{roundLabel(rev.round)} — 2x picks</h2>
		<p class="muted small">The reveal: who doubled whom in {roundLabel(rev.round)}, now that the round has locked. Bonus is the extra copy of the pick's points.</p>
		<table>
			<thead><tr><th>Name</th><th>2x pick</th><th>Points</th><th>Bonus</th></tr></thead>
			<tbody>
				{#each rev.picks as pk}
					<tr class:me={me && me.id === pk.entrantId}>
						<td>{pk.name}</td>
						{#if pk.playerId}
							<td>{pk.position} {pk.playerName} <span class="muted">({pk.team})</span></td>
							<td>{fmt(pk.points)}</td>
							<td>{pk.bonus > 0 ? '+' : ''}{fmt(pk.bonus)}</td>
						{:else}
							<td><span class="muted">no pick</span></td>
							<td>–</td>
							<td>–</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	{/each}
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
		{@render revealBlocks(data.reveals)}
	{/if}
{/if}

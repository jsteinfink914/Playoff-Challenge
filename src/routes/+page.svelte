<script>
	import { onMount } from 'svelte';

	let data = null;
	let error = '';
	let me = null;
	let expanded = null;

	onMount(async () => {
		try { me = JSON.parse(localStorage.getItem('pc_entrant') || 'null'); } catch { me = null; }
		try {
			const res = await fetch('/api/leaderboard');
			data = await res.json();
			if (!res.ok) error = data.error || 'Failed to load leaderboard.';
		} catch (e) {
			error = e.message;
		}
	});

	const fmt = (n) => (typeof n === 'number' ? n.toFixed(1).replace(/\.0$/, '') : n);
</script>

<h1>Leaderboard</h1>

{#if error}
	<p class="error">{error}</p>
{:else if !data}
	<p class="muted">Loading…</p>
{:else if !data.locked}
	<div class="card">
		<p><strong>Rosters are hidden until the lock</strong> ({data.rosterLockAt ? new Date(data.rosterLockAt).toLocaleString() : 'TBD'}).
		Points accumulate across all four rounds — Wild Card, Divisional, Conference, Super Bowl — and each round you pick one of your players to score double.</p>
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
	{/if}
{:else}
	<p class="muted small">Rosters locked {data.rosterLockAt ? new Date(data.rosterLockAt).toLocaleString() : ''}. <span class="badge">2x</span> marks that round's doubled player.</p>
	{#if data.standings.length === 0}
		<p class="muted">No entrants.</p>
	{:else}
		<table>
			<thead><tr><th>#</th><th>Name</th><th>WC</th><th>DIV</th><th>CONF</th><th>SB</th><th>Total</th></tr></thead>
			<tbody>
				{#each data.standings as row, i}
					<tr class:me={me && me.id === row.entrantId}>
						<td>{i + 1}</td>
						<td>
							<a href={'#'} on:click|preventDefault={() => (expanded = expanded === row.entrantId ? null : row.entrantId)}>{row.name}</a>
						</td>
						<td>{fmt(row.rounds.WC)}</td>
						<td>{fmt(row.rounds.DIV)}</td>
						<td>{fmt(row.rounds.CONF)}</td>
						<td>{fmt(row.rounds.SB)}</td>
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
										<span class="pts">WC {fmt(p.pointsByRound.WC)} · DIV {fmt(p.pointsByRound.DIV)} · CONF {fmt(p.pointsByRound.CONF)} · SB {fmt(p.pointsByRound.SB)}</span>
									</li>
								{/each}
							</ul>
						</td></tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
{/if}

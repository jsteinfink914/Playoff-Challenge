<script>
	import data from '$lib/shadow-data.json';

	const fmt = (n) => (typeof n === 'number' ? n.toFixed(1).replace(/\.0$/, '') : n);
	const generated = new Date(data.generatedAt).toLocaleString();

	const weekNums = Object.keys(data.weeks).map(Number).sort((a, b) => a - b);
	const rounds = weekNums.map((w) => `W${w}`);
	const latest = weekNums[weekNums.length - 1];

	const byId = new Map(data.players.map((p) => [p.id, p]));
	const lastName = (p) => (p ? p.name.split(' ').slice(-1)[0] : '');

	// Top scorers in the latest week, pool-wide.
	const topScorers = Object.entries(data.weeks[latest])
		.map(([playerId, e]) => ({ player: byId.get(playerId), points: e.points }))
		.filter((x) => x.player)
		.sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name))
		.slice(0, 15);

	const rosterById = new Map(data.rosters.map((r) => [r.id, r]));
	const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
	const poolByTeam = data.teams.map((t) => ({
		team: t,
		players: data.players
			.filter((p) => p.team === t.abbr)
			.sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) || b.seasonPts - a.seasonPts)
	}));
</script>

<h1>Shadow Mode</h1>

<div class="card">
	<p><strong>Shadow mode</strong> runs the contest's real data + scoring pipeline on live
	regular-season data, so we can watch it work for a few weeks before the real thing in January.</p>
	<p class="muted small">
		Player pool: Sleeper, for the current projected playoff field — the 14 "favorites" if the
		{data.season} season ended today ({data.teams.map((t) => t.abbr).join(' · ')}).
		Points: real Sleeper weekly stats, re-scored with the contest scoring by the app's own
		<code>computePoints</code>. Weeks covered: {weekNums.map((w) => `Week ${w}`).join(', ')}.
		Data generated {generated} — refresh with <code>node scripts/refresh-shadow.mjs</code>.
	</p>
	<p class="muted small">
		The three entries below are auto-built sample rosters (each one validated legal: one player
		per team, 3 QB / 4 RB / 4 WR / 3 TE). Every week, each roster's top scorer is auto-doubled —
		the <span class="badge">2x</span> badge names him. Totals come from the app's own leaderboard math.
	</p>
</div>

<h2>Shadow Leaderboard</h2>
<table>
	<thead>
		<tr><th>#</th><th>Roster</th>{#each rounds as r}<th>{r}</th>{/each}<th>Total</th></tr>
	</thead>
	<tbody>
		{#each data.leaderboard as row, i}
			<tr>
				<td>{i + 1}</td>
				<td>{row.name}</td>
				{#each rounds as r}
					<td>{fmt(row.rounds[r])}{#if row.doublers[r]}<span class="badge" title={`2x: ${byId.get(row.doublers[r])?.name}`}>2x {lastName(byId.get(row.doublers[r]))}</span>{/if}</td>
				{/each}
				<td class="total">{fmt(row.total)}</td>
			</tr>
		{/each}
	</tbody>
</table>

{#each data.leaderboard as row}
	<div class="card">
		<div class="team-head"><span class="abbr">{row.name}</span><span class="total">{fmt(row.total)} pts</span></div>
		<ul class="roster-list">
			{#each rosterById.get(row.entrantId).players as p}
				<li>
					<span>{p.position} {p.name} <span class="muted">({p.team})</span>
						{#each rounds as r}{#if row.doublers[r] === p.id}<span class="badge">2x {r}</span>{/if}{/each}
					</span>
					<span class="pts">season {fmt(p.seasonPts)} pts</span>
				</li>
			{/each}
		</ul>
	</div>
{/each}

<h2>Top Scorers — Week {latest}</h2>
<div class="card">
	<ul class="roster-list">
		{#each topScorers as s, i}
			<li>
				<span>{i + 1}. {s.player.name} <span class="muted">({s.player.team} · {s.player.position})</span></span>
				<span class="pts">{fmt(s.points)} pts</span>
			</li>
		{/each}
	</ul>
</div>

<h2>Shadow Pool ({data.players.length} players)</h2>
<p class="muted small">Top players per team/position by cumulative season points (Sleeper pts_ppr), generated from the Sleeper players map by current team + position.</p>
{#each poolByTeam as { team, players }}
	<div class="team-block">
		<div class="team-head">
			<span class="abbr">{team.abbr} <span class="muted">— {team.name}</span></span>
			<span class="badge grey">{team.conf} #{team.seed}</span>
		</div>
		<div class="player-grid">
			{#each players as p}
				<div class="player"><span class="pos">{p.position}</span> {p.name}<br /><span class="muted small">{fmt(p.seasonPts)} season pts</span></div>
			{/each}
		</div>
	</div>
{/each}

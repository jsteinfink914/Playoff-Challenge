<script>
	export let data;

	// All lock times are shown in Eastern Time, like the rest of the app.
	const fmtET = (iso) =>
		iso
			? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'
			: 'TBD';

	const s = data.scoring;
	const scoringRows = [
		['Passing yards', `${s.passYd} / yard`],
		['Passing touchdown', s.passTD],
		['Interception thrown', s.passInt],
		['Rushing yards', `${s.rushYd} / yard`],
		['Rushing touchdown', s.rushTD],
		['Reception', s.rec],
		['Receiving yards', `${s.recYd} / yard`],
		['Receiving touchdown', s.recTD],
		['Fumble lost', s.fumbleLost],
		['2-point conversion', s.twoPt]
	];
</script>

<h1>Admin</h1>
<p class="muted">This page is <strong>read-only</strong> — it shows the contest's current settings and scoring for everyone to see. There is nothing to change here.</p>

<div class="card">
	<h2 style="margin-top:0">Contest settings</h2>
	<table>
		<tbody>
			<tr>
				<td>Roster lock</td>
				<td>{fmtET(data.rosterLockAt)}</td>
			</tr>
			{#each data.rounds as r}
				<tr>
					<td>{r.label} — 2x lock</td>
					<td>{fmtET(data.roundLocks[r.id])}</td>
				</tr>
			{/each}
			<tr>
				<td>Doubling the same player in multiple rounds</td>
				<td>{data.allowRepeatDoubler ? 'Allowed' : 'Not allowed — each player can be doubled only once'}</td>
			</tr>
		</tbody>
	</table>
</div>

<div class="card">
	<h2 style="margin-top:0">Contest scoring</h2>
	<p class="muted small">Full PPR. Every player's points for a round are computed from his stat line with these weights; your 2x pick's points count twice.</p>
	<table>
		<thead>
			<tr><th>Stat</th><th>Points</th></tr>
		</thead>
		<tbody>
			{#each scoringRows as [label, pts]}
				<tr>
					<td>{label}</td>
					<td>{pts}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

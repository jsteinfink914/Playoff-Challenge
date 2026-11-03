<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import '../app.css';
	$: path = $page.url.pathname;

	let mode = 'demo';
	onMount(async () => {
		try {
			const res = await fetch('/api/pool');
			const d = await res.json();
			if (d.mode) mode = d.mode;
		} catch { /* keep demo banner */ }
	});
</script>

{#if mode === 'shadow'}
	<div class="demo-banner">SHADOW MODE — Jake is test-driving the contest on the 2026 regular-season favorites field (Weeks 9–11). The real playoff field + locks get set in January.</div>
{:else}
	<div class="demo-banner">DEMO — built on the Jan 2026 playoff field (2025 season). Real field, scoring and locks get set in January.</div>
{/if}
<header class="topbar">
	<a class="brand" href="/">🏈 Playoff Challenge</a>
	<nav>
		<a href="/" class:active={path === '/'}>Leaderboard</a>
		<a href="/enter" class:active={path === '/enter'}>Enter / Roster</a>
		<a href="/doubler" class:active={path === '/doubler'}>2x Pick</a>
		<a href="/shadow" class:active={path === '/shadow'}>Shadow</a>
		<a href="/admin" class:active={path === '/admin'}>Admin</a>
	</nav>
</header>
<main>
	<slot />
</main>

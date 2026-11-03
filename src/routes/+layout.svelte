<script>
	import { page } from '$app/stores';
	import '../app.css';
	$: path = $page.url.pathname;
</script>

<div class="demo-banner">DEMO — built on the Jan 2026 playoff field (2025 season). Real field, scoring and locks get set in January.</div>
<header class="topbar">
	<a class="brand" href="/">🏈 Playoff Challenge</a>
	<nav>
		<a href="/" class:active={path === '/'}>Leaderboard</a>
		<a href="/enter" class:active={path === '/enter'}>Enter / Roster</a>
		<a href="/doubler" class:active={path === '/doubler'}>2x Pick</a>
		<a href="/admin" class:active={path === '/admin'}>Admin</a>
	</nav>
</header>
<main>
	<slot />
</main>

<svelte:head>
	<title>nowhere</title>
</svelte:head>

<div class="home">
	<h1>nowhere</h1>
	<nav>
		<a href="/create/store">Store</a>
		<a href="/create/message">Message</a>
		<a href="/create/fundraiser">Fundraiser</a>
		<a href="/create/petition">Petition</a>
		<a href="/create/event">Event</a>
		<a href="/create/forum">Forum</a>
		<a href="/create/drop">Drop</a>
		<a href="/create/art">Art</a>
		<a href="/manage">Manage</a>
	</nav>
</div>

<style>
	.home {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-6);
	}

	h1 {
		font-size: 3rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	nav {
		display: flex;
		gap: var(--space-4);
		flex-wrap: wrap;
		justify-content: center;
	}

	nav a {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	nav a:hover {
		color: var(--color-text);
	}
</style>

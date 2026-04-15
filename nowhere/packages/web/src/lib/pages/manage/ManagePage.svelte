<script lang="ts">
	import { onMount } from 'svelte';
	import ManageNav from './ManageNav.svelte';
	import ManageFooter from './ManageFooter.svelte';

	/* Manage pages are light-mode only. Host apps may have put `html[data-theme="dark"]`
	   on the root (e.g. nowhr's /app toggle); force light while mounted and restore on unmount. */
	onMount(() => {
		const html = document.documentElement;
		const prev = html.dataset.theme;
		html.dataset.theme = 'light';
		return () => {
			if (prev === undefined) delete html.dataset.theme;
			else html.dataset.theme = prev;
		};
	});
</script>

<svelte:head>
	<title>Manage · nowhere</title>
</svelte:head>

<div class="manage-root">
	<ManageNav highlightManage={true} />

	<!-- CONTENT -->
	<main class="content">
		<div class="section-label">manage</div>
		<h1 class="heading">What would you<br><em>like to manage?</em></h1>

		<div class="options">
			<a href="/manage/store" class="option">
				<div class="option-name">Store <span class="arr">→</span></div>
				<div class="option-desc">Orders, inventory, and settings</div>
			</a>
			<a href="/manage/petition" class="option">
				<div class="option-name">Petition <span class="arr">→</span></div>
				<div class="option-desc">Signatures and campaign details</div>
			</a>
		</div>
	</main>

	<ManageFooter />
</div>

<style>
	.manage-root {
		--bg:     #fafaf8;
		--ink:    #1a1a1a;
		--ink-60: rgba(26,26,26,0.60);
		--ink-35: rgba(26,26,26,0.35);
		--ink-15: rgba(26,26,26,0.09);
		--nav-bg: rgba(250,250,248,0.90);
		--font:   -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--mono:   ui-monospace, 'SF Mono', 'Cascadia Code', 'Courier New', monospace;
		--col:    clamp(1.5rem, 6vw, 5rem);

		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		transition: background 0.2s, color 0.2s;
	}

	:global([data-theme="dark"]) .manage-root {
		--bg:     #0d0d0d;
		--ink:    #e8e8e8;
		--ink-60: rgba(232,232,232,0.60);
		--ink-35: rgba(232,232,232,0.35);
		--ink-15: rgba(232,232,232,0.10);
		--nav-bg: rgba(13,13,13,0.88);
	}

	@keyframes page-enter {
		from { opacity: 0; transform: translateY(6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.content {
		flex: 1;
		padding: clamp(6rem, 14vh, 10rem) var(--col) clamp(4rem, 10vh, 7rem);
		animation: page-enter 0.3s ease forwards;
	}

	.section-label {
		font-size: 0.5625rem;
		font-weight: 500;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-35);
		margin-bottom: 2rem;
	}

	.heading {
		font-size: clamp(2rem, 5vw, 4rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.05;
		margin-bottom: clamp(2.5rem, 6vh, 4rem);
	}

	.heading em {
		font-style: normal;
		color: var(--ink-35);
	}

	.options {
		display: flex;
		flex-direction: column;
		max-width: 480px;
	}

	.option {
		display: block;
		padding: 1.5rem 0;
		border-top: 1px solid var(--ink-15);
		text-decoration: none;
		color: var(--ink);
	}

	.option:last-child {
		border-bottom: 1px solid var(--ink-15);
	}

	.option-name {
		font-size: clamp(1.125rem, 2.5vw, 1.5rem);
		font-weight: 400;
		letter-spacing: -0.01em;
		color: var(--ink-60);
		transition: color 0.15s;
		margin-bottom: 0.3rem;
	}

	.option:hover .option-name { color: var(--ink); }

	.option-desc {
		font-size: 0.75rem;
		color: var(--ink-35);
		letter-spacing: 0.01em;
	}

	.arr { vertical-align: 0.1em; }
</style>

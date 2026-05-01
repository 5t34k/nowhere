<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let themeLabel = $state('dark');
	let instanceHost = $state<string | null>(null);

	onMount(() => {
		const html = document.documentElement;

		const host = window.location.hostname;
		const parts = host.split('.');
		const base = parts.length >= 2 && !/^\d+$/.test(parts[0]) ? parts.slice(-2).join('.') : host;
		if (base !== 'nowhr.xyz') instanceHost = base;

		function isDark() {
			return html.dataset.theme === 'dark' ||
				(!html.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
		}

		themeLabel = isDark() ? 'light' : 'dark';

		function toggle() {
			const next = isDark() ? 'light' : 'dark';
			html.dataset.theme = next;
			localStorage.setItem('nowhere-theme', next);
			themeLabel = isDark() ? 'light' : 'dark';
		}

		const btn = document.getElementById('theme-toggle');
		btn?.addEventListener('click', toggle);

		return () => btn?.removeEventListener('click', toggle);
	});
</script>

<svelte:head>
	<title>{$page.status} · nowhere</title>
	<meta name="robots" content="noindex">
</svelte:head>

<nav class="nav">
	<a href="https://hostednowhere.com" class="nav-mark">nowhere</a>
</nav>

<button class="theme-corner" id="theme-toggle" title="Toggle theme">{themeLabel}</button>

<main>
	<div class="content">
		<div class="line">this page was found nowhere</div>
		<div class="code">{$page.status}</div>
		<a href="https://hostednowhere.com" class="back">go home</a>
	</div>
</main>

<footer class="footer">
	<span>Hosted <a href="https://hostednowhere.com" class="footer-link">nowhere</a>. Present everywhere.</span>
	{#if instanceHost}
		<span>nowhere via <a href="https://{instanceHost}" class="footer-host">{instanceHost}</a></span>
	{/if}
</footer>

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

	:global(:root) {
		--bg:     #fafaf8;
		--ink:    #1a1a1a;
		--ink-60: rgba(26,26,26,0.60);
		--ink-35: rgba(26,26,26,0.35);
		--ink-15: rgba(26,26,26,0.09);
		--font:  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--serif: Georgia, 'Times New Roman', Times, serif;
	}

	:global([data-theme="dark"]) {
		--bg:     #0d0d0d;
		--ink:    #e8e8e8;
		--ink-60: rgba(232,232,232,0.60);
		--ink-35: rgba(232,232,232,0.35);
		--ink-15: rgba(232,232,232,0.10);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme="light"])) {
			--bg:     #0d0d0d;
			--ink:    #e8e8e8;
			--ink-60: rgba(232,232,232,0.60);
			--ink-35: rgba(232,232,232,0.35);
			--ink-15: rgba(232,232,232,0.10);
		}
	}

	:global(body) {
		font-family: var(--font);
		background: var(--bg);
		color: var(--ink);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		transition: background 0.2s, color 0.2s;
	}

	.nav {
		position: fixed;
		top: 0; left: 0; right: 0;
		z-index: 10;
		height: 44px;
		display: flex;
		align-items: center;
		padding: 0 clamp(1.5rem, 6vw, 5rem);
		border-bottom: 1px solid var(--ink-15);
	}

	.nav-mark {
		font-size: 0.875rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--ink-35);
		text-decoration: none;
		transition: color 0.15s;
	}

	.nav-mark:hover { color: var(--ink); }

	.theme-corner {
		position: fixed;
		top: 56px;
		right: clamp(1.5rem, 6vw, 5rem);
		z-index: 9;
		font-family: var(--font);
		font-size: 0.6875rem;
		font-weight: 400;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.theme-corner:hover { color: var(--ink); }

	main {
		position: fixed;
		top: 0; left: 0; right: 0; bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1.75rem;
	}

	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.code {
		font-size: clamp(5rem, 14vw, 12rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--ink-15);
	}

	.line {
		margin-bottom: clamp(1rem, 2vh, 1.75rem);
		font-size: clamp(0.8125rem, 1.4vw, 0.9375rem);
		font-weight: 300;
		letter-spacing: 0.01em;
		color: var(--ink);
	}

	.back {
		margin-top: clamp(2.5rem, 5vh, 4rem);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.back:hover { color: var(--ink); }

	.footer {
		position: fixed;
		bottom: 0; left: 0; right: 0;
		padding: 1.5rem 1.75rem;
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.footer-link {
		color: var(--ink);
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.footer-link:hover { opacity: 0.6; }

	.footer-host {
		color: var(--ink-35);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s;
	}

	.footer-host:hover { color: var(--ink-60); }
</style>

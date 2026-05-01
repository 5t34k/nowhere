<script lang="ts">
	import { onMount } from 'svelte';
	import { navigating } from '$app/state';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let themeLabel = $state('dark');
	let instanceHost = $state<string | null>(null);
	let showInstall = $state(false);
	let installType = $state<'prompt' | 'ios' | null>(null);
	let showIOSInstructions = $state(false);
	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);

	async function handleInstall() {
		if (installType === 'prompt' && deferredPrompt) {
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') {
				showInstall = false;
				deferredPrompt = null;
			}
		} else if (installType === 'ios') {
			showIOSInstructions = !showIOSInstructions;
		}
	}

	onMount(() => {
		const html = document.documentElement;
		const body = document.body;

		// Lock scroll for this fixed-layout page; cleaned up on SPA navigation away
		html.style.height = '100%';
		html.style.overflow = 'hidden';
		body.style.height = '100%';
		body.style.overflow = 'hidden';

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

		const host = window.location.hostname;
		const parts = host.split('.');
		const base = parts.length >= 2 && !/^\d+$/.test(parts[0]) ? parts.slice(-2).join('.') : host;
		if (base !== 'nowhr.xyz') instanceHost = base;

		const btn = document.getElementById('theme-toggle');
		btn?.addEventListener('click', toggle);

		// PWA install detection
		const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
		let onBeforeInstallPrompt: ((e: Event) => void) | null = null;
		let onAppInstalled: (() => void) | null = null;

		if (!isStandalone) {
			const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
			if (isIOS) {
				installType = 'ios';
				showInstall = true;
			}

			onBeforeInstallPrompt = (e: Event) => {
				e.preventDefault();
				deferredPrompt = e as BeforeInstallPromptEvent;
				installType = 'prompt';
				showInstall = true;
			};

			onAppInstalled = () => {
				showInstall = false;
				deferredPrompt = null;
			};

			window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.addEventListener('appinstalled', onAppInstalled);
		}

		// Tagline decode animation
		const el = document.querySelector('.tagline');
		if (el) {
			const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			const text = el.textContent ?? '';
			const duration = 1400;
			const windowSize = 4;

			function rand() { return chars[Math.floor(Math.random() * chars.length)]; }

			const initChars: string[] = [];
			for (let j = 0; j < text.length; j++) initChars.push(rand());

			function render(elapsed: number) {
				let out = '';
				const waveFront = (elapsed / duration) * text.length;
				for (let i = 0; i < text.length; i++) {
					if (text[i] === ' ') { out += '\u00a0'; continue; }
					if (i < waveFront) out += text[i];
					else if (i < waveFront + windowSize) out += rand();
					else out += initChars[i];
				}
				return out;
			}

			el.textContent = render(0);

			const start = performance.now();
			const timer = setInterval(() => {
				const elapsed = performance.now() - start;
				el.textContent = render(elapsed);
				if (elapsed >= duration) {
					clearInterval(timer);
					el.textContent = text;
				}
			}, 67);
		}

		return () => {
			btn?.removeEventListener('click', toggle);
			if (onBeforeInstallPrompt) window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			if (onAppInstalled) window.removeEventListener('appinstalled', onAppInstalled);
			html.style.height = '';
			html.style.overflow = '';
			body.style.height = '';
			body.style.overflow = '';
		};
	});
</script>

<svelte:head>
	<title>nowhere</title>
	<meta name="description" content="Nowhere encodes an entire website into a URL. The site lives in the link itself and is never stored on a server. Hosted nowhere, present everywhere.">
	<meta property="og:title" content="nowhere">
	<meta property="og:description" content="Nowhere encodes an entire website into a URL. The site lives in the link itself and is never stored on a server. Hosted nowhere, present everywhere.">
	<meta property="og:image" content="https://nowhr.xyz/og.png">
	<meta property="og:type" content="website">
	<meta name="twitter:card" content="summary">
</svelte:head>

<button class="theme-corner" id="theme-toggle" title="Toggle theme" class:gone={navigating.to}>{themeLabel}</button>

<main class:gone={navigating.to}>
	<div class="cluster">
		<a href="https://hostednowhere.com" class="wordmark">nowhere</a>
		<div class="tagline">an entire website encoded in a URL</div>
		<a href="https://hostednowhere.com" class="learn-link"><span class="learn-muted">hosted</span>nowhere<span class="learn-muted">.com</span></a>
		<a href="/app" class="app-link">try app</a>
		{#if showInstall}
			<button class="install-btn" onclick={handleInstall}>install app</button>
			{#if showIOSInstructions}
				<p class="ios-hint">tap <span class="ios-step">Share</span> → <span class="ios-step">Add to Home Screen</span></p>
			{/if}
		{/if}
	</div>
</main>

<footer class="footer" class:gone={navigating.to}>
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
		--nav-bg: rgba(250,250,248,0.92);

		--font:  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--serif: Georgia, 'Times New Roman', Times, serif;
	}

	:global([data-theme="dark"]) {
		--bg:     #0d0d0d;
		--ink:    #e8e8e8;
		--ink-60: rgba(232,232,232,0.60);
		--ink-35: rgba(232,232,232,0.35);
		--ink-15: rgba(232,232,232,0.10);
		--nav-bg: rgba(13,13,13,0.92);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme="light"])) {
			--bg:     #0d0d0d;
			--ink:    #e8e8e8;
			--ink-60: rgba(232,232,232,0.60);
			--ink-35: rgba(232,232,232,0.35);
			--ink-15: rgba(232,232,232,0.10);
			--nav-bg: rgba(13,13,13,0.92);
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

.gone { display: none; }

/* THEME TOGGLE */
	.theme-corner {
		position: fixed;
		top: clamp(1rem, 3vh, 1.75rem); right: 1.75rem;
		z-index: 9;
		font-family: var(--font);
		font-size: 0.6875rem;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.theme-corner:hover { color: var(--ink); }

	/* MAIN */
	main {
		position: fixed;
		top: 0; left: 0; right: 0; bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1.75rem;
	}

	.cluster {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		width: 100%;
		max-width: 560px;
	}

	.wordmark {
		font-size: clamp(3rem, 10vw, 5rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
		text-decoration: none;
	}

	.tagline {
		margin-top: clamp(0.75rem, 2vh, 1.25rem);
		font-size: clamp(0.75rem, 1.4vw, 0.875rem);
		font-weight: 300;
		color: var(--ink-35);
		letter-spacing: 0.01em;
	}

	.learn-link {
		margin-top: clamp(2rem, 5vh, 3.5rem);
		font-family: var(--serif);
		font-size: clamp(1.25rem, 3.5vw, 1.875rem);
		font-weight: 400;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 4px;
		text-decoration-color: var(--ink-35);
		letter-spacing: -0.01em;
		transition: color 0.15s, text-decoration-color 0.15s;
	}

	.learn-link:hover {
		color: var(--ink-60);
		text-decoration-color: var(--ink-60);
	}

	.learn-muted {
		color: var(--ink-35);
		transition: color 0.15s;
	}

	.learn-link:hover .learn-muted { color: var(--ink-60); }

	.app-link {
		margin-top: clamp(2rem, 5vh, 3.5rem);
		font-family: var(--serif);
		font-size: clamp(1.125rem, 3vw, 1.375rem);
		font-weight: 400;
		font-style: italic;
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.app-link:hover { color: var(--ink); }

	.install-btn {
		margin-top: clamp(1.25rem, 3vh, 1.75rem);
		font-family: var(--font);
		font-size: 0.9375rem;
		font-weight: 400;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.02em;
		transition: color 0.15s;
	}

	.install-btn:hover { color: var(--ink-60); }

	.ios-hint {
		margin-top: 0.625rem;
		font-family: var(--font);
		font-size: 0.75rem;
		color: var(--ink-35);
		letter-spacing: 0.01em;
	}

	.ios-step {
		color: var(--ink-60);
	}

	/* FOOTER */
	.footer {
		position: fixed;
		bottom: 0; left: 0; right: 0;
		padding: 1.5rem 1.75rem;
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-align: center;
		transition: opacity 0.3s ease;
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

<script lang="ts">
	import { onMount } from 'svelte';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let themeLabel = $state('dark');
	let platform = $state<'prompt' | 'ios' | 'installed' | 'generic'>('generic');
	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let installed = $state(false);

	async function handleInstall() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') {
				installed = true;
				deferredPrompt = null;
			}
		}
	}

	onMount(() => {
		const html = document.documentElement;

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

		// Detect platform
		const isStandalone = window.matchMedia('(display-mode: standalone)').matches
			|| !!(navigator as any).standalone;

		if (isStandalone) {
			platform = 'installed';
		} else {
			const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
			if (isIOS) {
				platform = 'ios';
			}
		}

		const onBeforeInstallPrompt = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			platform = 'prompt';
		};

		const onAppInstalled = () => {
			installed = true;
			deferredPrompt = null;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onAppInstalled);

		// Reveal on scroll
		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('visible');
					observer.unobserve(entry.target);
				}
			});
		}, { threshold: 0.15 });

		document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

		return () => {
			observer.disconnect();
			btn?.removeEventListener('click', toggle);
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onAppInstalled);
		};
	});
</script>

<svelte:head>
	<title>install nowhere</title>
	<meta name="description" content="Nowhere encodes an entire website into a URL. The site lives in the link itself and is never stored on a server. Install the app to create and view them offline.">
	<meta property="og:title" content="install nowhere">
	<meta property="og:description" content="Nowhere encodes an entire website into a URL. The site lives in the link itself and is never stored on a server. Install the app to create and view them offline.">
	<meta property="og:image" content="https://nowhr.xyz/og.png">
	<meta property="og:type" content="website">
	<meta name="twitter:card" content="summary">
</svelte:head>

<button class="theme-corner" id="theme-toggle" title="Toggle theme">{themeLabel}</button>

<main>
	<!-- HEADER -->
	<section class="hero">
		<div class="composition">
			<div class="wordmark-row">
				<a href="https://hostednowhere.com" class="wordmark">nowhere</a>
				<span class="wordmark-suffix">App</span>
			</div>
			<p class="body">The Nowhere app lets you open and create Nowhere sites with no network connection. Scan a QR code, tap a link, or paste one in. The site loads entirely on your device, from the URL itself.</p>
		</div>
	</section>

	<!-- INSTALL -->
	<section class="section">
		<div class="composition">
			{#if installed || platform === 'installed'}
				<div class="install-status">Installed</div>
				<a href="/app" class="open-link">Open app</a>
			{:else if platform === 'prompt'}
				<button class="install-btn" onclick={handleInstall}>Install</button>
				<div class="install-hint">Adds to your home screen. No app store required.</div>
			{:else if platform === 'ios'}
				<div class="section-label">install on ios</div>
				<div class="install-steps">
					<div class="step">
						<span class="step-num">1</span>
						<span class="step-text">Tap <strong>Share</strong> in Safari</span>
					</div>
					<div class="step">
						<span class="step-num">2</span>
						<span class="step-text">Tap <strong>Add to Home Screen</strong></span>
					</div>
				</div>
				<div class="install-hint">Opens as a standalone app. No app store required.</div>
			{:else}
				<div class="section-label">install</div>
				<div class="install-steps">
					<div class="step">
						<span class="step-num">1</span>
						<span class="step-text">Open this page in <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Safari</strong></span>
					</div>
					<div class="step">
						<span class="step-num">2</span>
						<span class="step-text">Open the browser menu</span>
					</div>
					<div class="step">
						<span class="step-num">3</span>
						<span class="step-text">Select <strong>Install app</strong> or <strong>Add to Home Screen</strong></span>
					</div>
				</div>
				<div class="install-hint">No app store needed.</div>
			{/if}
		</div>
	</section>

	<!-- WHAT IT DOES -->
	<section class="section">
		<div class="composition">
			<div class="section-label reveal">What it does</div>
			<div class="feature-list">
				<div class="feature reveal">
					<div class="feature-name">Scan</div>
					<div class="feature-desc">Point the camera at any QR code containing a Nowhere site. The site opens instantly, decoded on your device.</div>
				</div>
				<div class="feature reveal">
					<div class="feature-name">Open</div>
					<div class="feature-desc">Paste or tap any Nowhere link. Stores, forums, events, petitions, drops, messages, art. Everything loads from the URL fragment alone.</div>
				</div>
				<div class="feature reveal">
					<div class="feature-name">Create</div>
					<div class="feature-desc">Build a Nowhere site on your device. The result is a link you copy, share, or print as a QR code. Nothing is uploaded.</div>
				</div>
				<div class="feature reveal">
					<div class="feature-name">Offline</div>
					<div class="feature-desc">No server to fetch from means no connection required. Once installed, the app works without the internet.</div>
				</div>
			</div>
		</div>
	</section>
</main>

<!-- FOOTER -->
<footer class="footer">
	<a href="/app" class="footer-try">Try in browser →</a>
	<span class="footer-line">Hosted <a href="https://hostednowhere.com" class="footer-link">nowhere</a>. Present everywhere.</span>
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

	/* LAYOUT */
	main {
		padding: 0 1.75rem;
	}

	.composition {
		width: 100%;
		max-width: 560px;
		margin: 0 auto;
	}

	/* HERO */
	.hero {
		padding-top: clamp(5rem, 14vh, 9rem);
		padding-bottom: clamp(3rem, 7vh, 5rem);
	}

	.wordmark-row {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: clamp(0.75rem, 2vw, 1.25rem);
	}

	.wordmark {
		font-size: clamp(3rem, 10vw, 5rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
		text-decoration: none;
	}

	.wordmark-suffix {
		font-size: clamp(2rem, 3.5vw, 3rem);
		font-weight: 500;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink-60);
	}

	.body {
		margin-top: clamp(2rem, 5vh, 3rem);
		font-family: var(--serif);
		font-size: clamp(0.9375rem, 1.5vw, 1.0625rem);
		color: var(--ink-60);
		line-height: 1.78;
	}

	/* SECTIONS */
	.section {
		padding: clamp(2.5rem, 6vh, 4rem) 0;
		border-top: 1px solid var(--ink-15);
	}

	.section-label {
		font-size: 0.5625rem;
		font-weight: 500;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-35);
		margin-bottom: 2rem;
	}

	/* INSTALL */
	.install-status {
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--ink-35);
		letter-spacing: 0.01em;
		margin-bottom: 1.25rem;
	}

	.open-link {
		font-family: var(--serif);
		font-size: clamp(1.125rem, 2.5vw, 1.375rem);
		font-weight: 400;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 4px;
		text-decoration-color: var(--ink-35);
		transition: text-decoration-color 0.15s;
	}

	.open-link:hover { text-decoration-color: var(--ink); }

	.install-btn {
		font-family: var(--serif);
		font-size: clamp(1.25rem, 3vw, 1.625rem);
		font-weight: 400;
		color: var(--ink);
		background: none;
		border: 1px solid var(--ink-15);
		padding: 0.875rem 2.75rem;
		cursor: pointer;
		letter-spacing: -0.01em;
		transition: border-color 0.15s, color 0.15s;
	}

	.install-btn:hover {
		border-color: var(--ink-35);
	}

	.install-hint {
		margin-top: 1.5rem;
		font-size: 0.75rem;
		color: var(--ink-35);
		letter-spacing: 0.01em;
	}

	.install-steps {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.step {
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}

	.step-num {
		font-size: 0.6875rem;
		color: var(--ink-35);
		letter-spacing: 0.01em;
		flex-shrink: 0;
		width: 1rem;
	}

	.step-text {
		font-family: var(--serif);
		font-size: clamp(0.9375rem, 1.5vw, 1.0625rem);
		color: var(--ink-60);
		line-height: 1.6;
	}

	.step-text :global(strong) {
		font-weight: 700;
		color: var(--ink);
	}

	/* FEATURES */
	.feature-list {
		display: flex;
		flex-direction: column;
		gap: clamp(2rem, 4vh, 3rem);
	}

	.feature-name {
		font-size: clamp(1.125rem, 3vw, 1.375rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		margin-bottom: 0.5rem;
	}

	.feature-desc {
		font-family: var(--serif);
		font-size: clamp(0.875rem, 1.4vw, 1rem);
		color: var(--ink-60);
		line-height: 1.75;
		max-width: 440px;
	}

	/* REVEAL ANIMATION */
	.reveal {
		opacity: 0;
		transform: translateY(6px);
		transition: opacity 0.3s ease, transform 0.3s ease;
	}

	:global(.reveal.visible) {
		opacity: 1;
		transform: translateY(0);
	}

	/* FOOTER */
	.footer {
		padding: 1.5rem 1.75rem;
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.footer-try {
		font-family: var(--font);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.footer-try:hover { color: var(--ink); }

	.footer-link {
		color: var(--ink);
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.footer-link:hover { opacity: 0.6; }
</style>

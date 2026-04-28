<script lang="ts">
	import type { StoreData } from '@nowhere/codec';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import QRCode from 'qrcode';

	interface Props {
		store: StoreData;
		cartCount: number;
		onCartClick: () => void;
		showHero?: boolean;
	}

	let { store, cartCount, onCartClick, showHero = true }: Props = $props();

	const heroSvg = $derived(store.image?.startsWith('<') ? store.image : null);
	const heroImage = $derived(!heroSvg && store.image ? sanitizeImageUrl(store.image) || null : null);
	const heroEmoji = $derived(store.image && !heroSvg && !heroImage ? store.image : null);

	const sanitizedHeroSvg = $derived.by(() => {
		if (!heroSvg) return '';
		return sanitizeSvg(heroSvg);
	});

	// ─── Share QR ───
	let shareOpen = $state(false);
	let qrDataUrl = $state('');
	let qrTooLong = $state(false);
	let linkCopied = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			QRCode.toDataURL(window.location.href, {
				width: 512,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url: string) => { qrDataUrl = url; })
			  .catch(() => { qrTooLong = true; });
		}
	});

	async function copyUrl() {
		if (typeof window === 'undefined') return;
		try {
			await navigator.clipboard.writeText(window.location.href);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = window.location.href;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		linkCopied = true;
		setTimeout(() => (linkCopied = false), 2000);
	}
</script>

<nav class="top-nav">
	<div class="nav-inner">
		<div class="nav-brand">
			<a class="nav-brand-name" href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer">nowhere</a>
			<span class="nav-brand-type">Store</span>
		</div>
		<div class="nav-actions">
			<button class="store-share-btn" onclick={() => (shareOpen = true)} aria-label="Share store">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="20" y1="14" x2="20" y2="14.01"/><line x1="17" y1="20" x2="17" y2="20.01"/><line x1="20" y1="20" x2="20" y2="20.01"/><line x1="20" y1="17" x2="20" y2="17.01"/>
				</svg>
			</button>
			<button class="cart-btn" onclick={onCartClick} aria-label="Shopping cart, {cartCount} items">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
				<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
			</svg>
			{#if cartCount > 0}
				<span class="cart-badge">{cartCount}</span>
			{/if}
		</button>
		</div>
	</div>
</nav>

{#if showHero}
	<div class="hero" class:has-image={!!heroImage || !!heroSvg} class:plain={!heroImage && !heroSvg}>
		{#if heroImage}
			<img class="hero-bg" src={heroImage} alt="" />
			<div class="hero-overlay"></div>
		{:else if heroSvg}
			<div class="hero-bg hero-svg" role="img" aria-label="">{@html sanitizedHeroSvg}</div>
			<div class="hero-overlay"></div>
		{/if}
		<div class="hero-content">
			{#if heroEmoji && !heroImage && !heroSvg}
				<span class="hero-emoji">{heroEmoji}</span>
			{/if}
			<h1 class="hero-name">{store.name}</h1>
			{#if store.description}
				<p class="hero-subtitle">{store.description}</p>
			{/if}
		</div>
	</div>
{/if}

{#if shareOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="share-backdrop" onclick={() => (shareOpen = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="share-modal" onclick={(e) => e.stopPropagation()}>
			<div class="share-modal-header">
				<span class="share-modal-title">Share</span>
				<button class="share-modal-close" onclick={() => (shareOpen = false)} aria-label="Close">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<div class="share-modal-body">
				{#if qrTooLong}
					<div class="share-qr share-qr-fallback">
						<svg class="share-qr-fallback-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="3" y="3" width="7" height="7"/>
							<rect x="14" y="14" width="3" height="3"/>
							<rect x="3" y="14" width="7" height="7"/>
						</svg>
						<p class="share-qr-fallback-title">This store is too large for a QR code</p>
						<p class="share-qr-fallback-body">The link itself contains the entire store. Copy it and share directly.</p>
					</div>
				{:else if qrDataUrl}
					<img src={qrDataUrl} alt="QR code" class="share-qr" />
				{:else}
					<div class="share-qr share-qr-loading"></div>
				{/if}
				<button class="share-copy" onclick={copyUrl}>
					{linkCopied ? 'Copied!' : 'Copy Link'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.top-nav {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
	}

	.nav-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-2) var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.nav-brand-name {
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--color-text);
		text-transform: lowercase;
		text-decoration: none;
	}

	.nav-brand-name:hover {
		text-decoration: none;
	}

	.nav-brand-type {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-secondary);
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.store-share-btn {
		position: relative;
		background: none;
		border: none;
		padding: var(--space-2);
		color: var(--color-text-secondary);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 150ms ease, background 150ms ease;
	}

	.store-share-btn:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.cart-btn {
		position: relative;
		background: none;
		border: none;
		padding: var(--space-2);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.cart-btn:hover {
		background: var(--color-bg-secondary);
	}

	.cart-badge {
		position: absolute;
		top: 0;
		right: 0;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: 11px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.hero {
		position: relative;
		height: 200px;
		display: flex;
		align-items: flex-end;
		overflow: hidden;
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
	}

	.hero.plain {
		background: var(--color-bg);
		height: auto;
		align-items: stretch;
	}

	@media (min-width: 768px) {
		.hero {
			height: 300px;
		}

		.hero.plain {
			height: auto;
		}
	}

	.hero-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.hero-svg {
		overflow: hidden;
	}

	.hero-svg :global(svg) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.hero-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, transparent 30%, rgba(0, 0, 0, 0.7) 100%);
	}

	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
	}

	.hero-emoji {
		font-size: 4rem;
		line-height: 1;
		display: block;
		text-align: center;
		margin-bottom: var(--space-3);
	}

	@media (min-width: 768px) {
		.hero-emoji {
			font-size: 5rem;
		}
	}

	.hero-name {
		font-size: var(--text-3xl);
		font-weight: 800;
		color: #fff;
		line-height: 1.1;
		margin-bottom: var(--space-1);
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.plain .hero-name {
		color: var(--color-text);
		text-shadow: none;
	}

	@media (min-width: 768px) {
		.hero-name {
			font-size: 2.5rem;
		}
	}

	.hero-subtitle {
		font-size: var(--text-base);
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.4;
		max-width: 600px;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
	}

	.plain .hero-subtitle {
		color: var(--color-text-secondary);
		text-shadow: none;
	}

	/* ─── Share modal ─── */
	.share-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: share-fade-in 150ms ease;
	}

	.share-modal {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		width: 320px;
		max-width: calc(100vw - 2rem);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.3);
		animation: share-scale-in 150ms ease;
	}

	.share-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-border);
	}

	.share-modal-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-text);
	}

	.share-modal-close {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		transition: color 150ms ease;
	}
	.share-modal-close:hover {
		color: var(--color-text);
	}

	.share-modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	.share-qr {
		width: 220px;
		height: 220px;
		border-radius: 4px;
		display: block;
		image-rendering: pixelated;
	}

	.share-qr-fallback {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 18px;
		box-sizing: border-box;
		border: 1px dashed var(--color-border);
		background: var(--color-bg-secondary);
		image-rendering: auto;
	}

	.share-qr-fallback-icon {
		color: var(--color-text-muted);
		margin-bottom: 14px;
		opacity: 0.65;
	}

	.share-qr-fallback-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 6px 0;
		line-height: 1.3;
	}

	.share-qr-fallback-body {
		font-size: 11.5px;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.4;
		max-width: 180px;
	}

	.share-qr-loading {
		background: var(--color-bg-secondary);
	}

	.share-copy {
		background: none;
		border: none;
		padding: 0;
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color 150ms ease;
	}
	.share-copy:hover {
		color: var(--color-text);
	}

	@keyframes share-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes share-scale-in {
		from { opacity: 0; transform: scale(0.96); }
		to { opacity: 1; transform: scale(1); }
	}
</style>

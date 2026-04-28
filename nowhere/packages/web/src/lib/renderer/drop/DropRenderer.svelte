<script lang="ts">
	import type { DropData, Tag } from '@nowhere/codec';
	import { siteData, siteSigned } from '$lib/renderer/stores/site-data.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import QRCode from 'qrcode';
	import DropFooter from './DropFooter.svelte';
	import './drop.css';

	const data = $derived($siteData as DropData);

	// ─── Dark mode ───
	let isDark = $state(false);

	function initTheme() {
		if (typeof window === 'undefined') return;
		const stored = sessionStorage.getItem('nowhere-drop-theme');
		if (stored) {
			isDark = stored === 'dark';
		} else {
			isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	}

	function toggleTheme() {
		isDark = !isDark;
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('nowhere-drop-theme', isDark ? 'dark' : 'light');
		}
	}

	$effect(() => { initTheme(); });

	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.style.backgroundColor = isDark ? '#1A1A1A' : '#FAFAF7';
		}
	});

	// ─── Preview mode ───
	const isPreview = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return new URLSearchParams(window.location.search).has('preview');
	});

	// ─── Lines for rendering ───
	const lines = $derived(data?.description ? data.description.split('\n') : []);

	// ─── Title display ───
	const displayTitle = $derived(data?.name || 'Untitled');
	const titleIsPlaceholder = $derived(!data?.name);

	// ─── Verification phrases ───
	let authorPhrase = $state('');
	let dropPhrase = $state('');

	$effect(() => {
		if (data) {
			computeVerification(data).then((result) => {
				authorPhrase = result.sellerPhrase;
				dropPhrase = result.storePhrase;
			});
		}
	});

	const authorPhraseFormatted = $derived(
		authorPhrase ? authorPhrase.split(' ').join(' \u00B7 ') : ''
	);
	const dropPhraseFormatted = $derived(
		dropPhrase ? dropPhrase.split(' ').join(' \u00B7 ') : ''
	);

	// ─── Npub conversion ───
	const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

	function base64urlToNpub(b64: string): string {
		const std = b64.replace(/-/g, '+').replace(/_/g, '/');
		const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

		const hrp = 'npub';
		const words: number[] = [];
		let acc = 0, bits = 0;
		for (const b of bytes) {
			acc = (acc << 8) | b;
			bits += 8;
			while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 0x1f); }
		}
		if (bits > 0) words.push((acc << (5 - bits)) & 0x1f);

		const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
		function polymod(values: number[]): number {
			let chk = 1;
			for (const v of values) {
				const b = chk >> 25;
				chk = ((chk & 0x1ffffff) << 5) ^ v;
				for (let i = 0; i < 5; i++) { if ((b >> i) & 1) chk ^= GEN[i]; }
			}
			return chk;
		}
		const hrpExpand: number[] = [];
		for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) >> 5);
		hrpExpand.push(0);
		for (let i = 0; i < hrp.length; i++) hrpExpand.push(hrp.charCodeAt(i) & 31);

		const pm = polymod([...hrpExpand, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
		const checksum: number[] = [];
		for (let i = 0; i < 6; i++) checksum.push((pm >> (5 * (5 - i))) & 31);

		let result = hrp + '1';
		for (const w of [...words, ...checksum]) result += BECH32_ALPHABET[w];
		return result;
	}

	const npub = $derived(data?.pubkey ? base64urlToNpub(data.pubkey) : '');

	let npubCopied = $state(false);

	async function copyNpub() {
		if (!npub) return;
		try { await navigator.clipboard.writeText(npub); } catch {}
		npubCopied = true;
		setTimeout(() => (npubCopied = false), 2000);
	}

	// ─── Copy body ───
	let bodyCopied = $state(false);

	async function copyBody() {
		if (!data?.description) return;
		try { await navigator.clipboard.writeText(data.description); } catch {}
		bodyCopied = true;
		setTimeout(() => (bodyCopied = false), 2000);
	}

	// ─── Download as .txt ───
	function downloadTxt() {
		if (!data?.description) return;
		const filename = data.name ? `${data.name}.txt` : 'drop.txt';
		const blob = new Blob([data.description], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ─── QR code ───
	let qrDataUrl = $state('');
	let qrTooLong = $state(false);
	let showQr = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			QRCode.toDataURL(window.location.href, {
				width: 512,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url) => { qrDataUrl = url; })
			  .catch(() => { qrTooLong = true; });
		}
	});

	// ─── Share ───
	let linkCopied = $state(false);

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

{#if data}
<div class="drop-page" class:dark={isDark}>

	<header class="drop-header-bar">
		<a class="drop-header-brand" href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer">nowhere</a>
		<span class="drop-header-divider">|</span>
		<span class="drop-header-type">Drop</span>
		{#if !isPreview}
			<button class="drop-theme-btn" onclick={toggleTheme} aria-label="Toggle theme">
				{isDark ? 'light' : 'dark'}
			</button>
		{/if}
	</header>

	<div class="drop-stage">
	<div class="drop-doc-wrapper">
		<div class="drop-document">

			<div class="drop-doc-header">
				<div class="drop-doc-header-main">
					<h1 class="drop-title" class:untitled={titleIsPlaceholder}>{displayTitle}</h1>
					<div class="drop-doc-actions">
						<button class="drop-doc-btn" onclick={copyBody} aria-label={bodyCopied ? 'Copied' : 'Copy'}>
							{#if bodyCopied}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							{:else}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							{/if}
							<span class="btn-label">{bodyCopied ? 'Copied!' : 'Copy'}</span>
						</button>
						<button class="drop-doc-btn" onclick={downloadTxt} aria-label="Download">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
							<span class="btn-label">Download</span>
						</button>
						{#if !isPreview}
							<button class="drop-doc-btn" onclick={() => (showQr = true)} aria-label="Share">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 2h2v4h-4v-2h2v-2zm-3-2h2v2h-2v-2zm-2-2h2v2h-2v-2zm2 4h2v2h-2v-2zm2-4h4v2h-2v2h-2v-2zm0 6h2v2h-2v-2zm-4 0h2v2h-2v-2z"/></svg>
								<span class="btn-label">Share</span>
							</button>
						{/if}
					</div>
				</div>
				{#if $siteSigned && authorPhraseFormatted}
					<div class="drop-doc-author">
						<span class="drop-author-phrase signed">
							<svg class="signed-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							{authorPhraseFormatted}
						</span>
						<button class="drop-author-npub" onclick={copyNpub} title={npub}>
							{npubCopied ? 'Copied!' : npub.slice(0, 12) + '...' + npub.slice(-6)}
						</button>
					</div>
				{/if}
			</div>

			<div class="drop-doc-body">
				{#each lines as line, i}
					<div class="drop-line">
						<div class="drop-line-num" aria-hidden="true">{i + 1}</div>
						<div class="drop-line-text">{line}</div>
					</div>
				{/each}
			</div>

		</div>

		{#if dropPhraseFormatted}
			<div class="drop-seal">
				{dropPhraseFormatted}
			</div>
		{/if}
	</div>
	</div>

	{#if !isPreview}
		<DropFooter {authorPhrase} {dropPhrase} signed={$siteSigned} {npub} />
	{/if}


	{#if showQr}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="qr-backdrop" onclick={() => (showQr = false)}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="qr-document" onclick={(e) => e.stopPropagation()}>
				<div class="qr-doc-header">
					<span class="qr-doc-title">Share{data.name ? `: ${data.name}` : ''}</span>
					<button class="qr-doc-close" onclick={() => (showQr = false)} aria-label="Close">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<div class="qr-doc-body">
					{#if qrTooLong}
						<div class="qr-image-row">
							<div class="qr-line-gutter"></div>
							<div class="qr-image-cell qr-image-cell-fallback">
								<svg class="qr-fallback-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect x="3" y="3" width="7" height="7"/>
									<rect x="14" y="14" width="3" height="3"/>
									<rect x="3" y="14" width="7" height="7"/>
								</svg>
								<div class="qr-fallback-stamp">QR UNAVAILABLE</div>
							</div>
						</div>
						<div class="qr-doc-line">
							<div class="qr-line-num">1</div>
							<div class="qr-line-text">This drop is too large to fit in a QR code.</div>
						</div>
						<div class="qr-doc-line">
							<div class="qr-line-num">2</div>
							<div class="qr-line-text">The link itself contains the entire drop.</div>
						</div>
						<div class="qr-doc-line">
							<div class="qr-line-num">3</div>
							<div class="qr-line-text">
								<button class="qr-copy-link" onclick={copyUrl}>
									{linkCopied ? '[Copied!]' : '[Copy Link]'}
								</button>
							</div>
						</div>
					{:else if qrDataUrl}
						<div class="qr-image-row">
							<div class="qr-line-gutter"></div>
							<div class="qr-image-cell">
								<img src={qrDataUrl} alt="QR code" />
							</div>
						</div>
						<div class="qr-doc-line">
							<div class="qr-line-num">1</div>
							<div class="qr-line-text">Scan to read this drop</div>
						</div>
						<div class="qr-doc-line">
							<div class="qr-line-num">2</div>
							<div class="qr-line-text">
								<button class="qr-copy-link" onclick={copyUrl}>
									{linkCopied ? '[Copied!]' : '[Copy Link]'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

</div>
{/if}

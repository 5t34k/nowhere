<script lang="ts">
	import type { ArtData, Tag } from '@nowhere/codec';
	import { siteData, siteSigned } from '$lib/renderer/stores/site-data.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import QRCode from 'qrcode';
	import ArtFooter from './ArtFooter.svelte';
	import './art.css';

	const data = $derived($siteData as ArtData);

	// ─── Theme ───
	const theme = $derived(
		(data?.tags?.find((t: Tag) => t.key === 'T')?.value ?? 'g') as string
	);

	// ─── Attribution ───
	const attribution = $derived(
		data?.tags?.find((t: Tag) => t.key === 'A')?.value ?? ''
	);

	// ─── Sanitised SVG ───
	const sanitizedSvg = $derived.by(() => {
		if (!data?.svg) return '';
		return sanitizeSvg(data.svg);
	});

	// ─── Preview mode ───
	const isPreview = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return new URLSearchParams(window.location.search).has('preview');
	});

	// ─── Verification phrases ───
	let authorPhrase = $state('');
	let artPhrase = $state('');

	$effect(() => {
		if (data) {
			computeVerification(data).then((result) => {
				authorPhrase = result.sellerPhrase;
				artPhrase = result.storePhrase;
			});
		}
	});

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

	// ─── Copy link ───
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

	// ─── Print ───
	function printPoster() {
		if (typeof window !== 'undefined') window.print();
	}

	// ─── Render SVG to PNG blob ───
	async function renderPng(): Promise<{ blob: Blob; svgUrl: string } | null> {
		if (typeof window === 'undefined') return null;
		const svgEl = document.querySelector<SVGSVGElement>('.art-svg svg');
		if (!svgEl) return null;

		const vb = svgEl.viewBox?.baseVal;
		const w = vb && vb.width > 0 ? vb.width : svgEl.clientWidth;
		const h = vb && vb.height > 0 ? vb.height : svgEl.clientHeight;
		const scale = 3;

		const svgStr = new XMLSerializer().serializeToString(svgEl);
		const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
		const svgUrl = URL.createObjectURL(svgBlob);

		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = reject;
			i.src = svgUrl;
		});

		const canvas = document.createElement('canvas');
		canvas.width = Math.round(w * scale);
		canvas.height = Math.round(h * scale);
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
		});

		return { blob, svgUrl };
	}

	// ─── Open as PNG (tap artwork) ───
	async function openPng() {
		const win = window.open('about:blank', '_blank');
		try {
			const result = await renderPng();
			if (!result) { win?.close(); return; }
			const pngUrl = URL.createObjectURL(result.blob);
			if (win) win.location.href = pngUrl;
			URL.revokeObjectURL(result.svgUrl);
		} catch {
			win?.close();
		}
	}

	// ─── Save as PNG (download) ───
	async function savePng() {
		try {
			const result = await renderPng();
			if (!result) return;
			const pngUrl = URL.createObjectURL(result.blob);
			const a = document.createElement('a');
			a.href = pngUrl;
			a.download = (data?.name || 'nowhere-art') + '.png';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(pngUrl);
			URL.revokeObjectURL(result.svgUrl);
		} catch {
			// silently fail
		}
	}

	// ─── Theme class ───
	const themeClass = $derived(`theme-${theme}`);

	// ─── Show meta ───
	const hasTitle = $derived(!!data?.name);
	const hasAttribution = $derived(!!attribution);
	const showMeta = $derived(hasTitle || hasAttribution);
	// Bleed theme suppresses meta
	const showMetaInLayout = $derived(showMeta && theme !== 'b');
</script>

{#if data}
<div class="art-page {themeClass}">

	<header class="art-header">
		<a class="art-header-brand" href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer">nowhere</a>
		<span class="art-header-divider">|</span>
		<span class="art-header-type">Art</span>
	</header>

	<div class="art-stage">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="art-svg-wrap" onclick={openPng} title="Tap to open as PNG">
			<div class="art-svg">
				{@html sanitizedSvg}
			</div>
		</div>

		{#if showMetaInLayout}
			<div class="art-meta">
				{#if hasTitle}
					<div class="art-meta-title">{data.name}</div>
				{/if}
				{#if hasAttribution}
					<div class="art-meta-attribution">{attribution}</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if !isPreview}
		<div class="art-controls">
			<button class="art-ctrl-btn" onclick={() => (showQr = true)}>
				<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 2h2v4h-4v-2h2v-2zm-3-2h2v2h-2v-2zm-2-2h2v2h-2v-2zm2 4h2v2h-2v-2zm2-4h4v2h-2v2h-2v-2zm0 6h2v2h-2v-2zm-4 0h2v2h-2v-2z"/></svg>
				Share
			</button>
			<button class="art-ctrl-btn" onclick={savePng}>
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				Save
			</button>
			<button class="art-ctrl-btn" onclick={printPoster}>
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
				Print
			</button>
		</div>
	{/if}

	<ArtFooter {authorPhrase} artPhrase={artPhrase} signed={$siteSigned} preview={isPreview} {npub} />

	<!-- Print-only QR code -->
	{#if qrDataUrl}
		<div class="art-print-qr">
			<img src={qrDataUrl} alt="QR code" />
		</div>
	{/if}

	{#if showQr}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="art-qr-backdrop" onclick={() => (showQr = false)}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="art-qr-modal" onclick={(e) => e.stopPropagation()}>
				<div class="art-qr-header">
					<span class="art-qr-title">Share{data.name ? `: ${data.name}` : ''}</span>
					<button class="art-qr-close" onclick={() => (showQr = false)} aria-label="Close">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
				<div class="art-qr-body">
					{#if qrTooLong}
						<div class="art-qr-fallback">
							<svg class="art-qr-fallback-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<rect x="3" y="3" width="7" height="7"/>
								<rect x="14" y="14" width="3" height="3"/>
								<rect x="3" y="14" width="7" height="7"/>
							</svg>
							<div class="art-qr-fallback-title">This work is too large for a QR code.</div>
							<div class="art-qr-fallback-body">The link itself contains the entire piece. Copy it and share directly.</div>
						</div>
					{:else if qrDataUrl}
						<img src={qrDataUrl} alt="QR code" />
					{/if}
					<button class="art-qr-copy" onclick={copyUrl}>
						{linkCopied ? '[Copied!]' : '[Copy Link]'}
					</button>
				</div>
			</div>
		</div>
	{/if}

</div>
{/if}

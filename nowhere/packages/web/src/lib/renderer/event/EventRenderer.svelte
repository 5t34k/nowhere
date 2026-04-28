<script lang="ts">
	import type { EventData } from '@nowhere/codec';
	import { siteData, siteSigned } from '$lib/renderer/stores/site-data.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import QRCode from 'qrcode';
	import { parseContacts, platformByCode, CUSTOM_CODE } from '$lib/contacts.js';
	import { npubEncode } from 'nostr-tools/nip19';
	import GenericPreset from './presets/GenericPreset.svelte';
	import UndergroundPreset from './presets/UndergroundPreset.svelte';
	import DeclarationPreset from './presets/DeclarationPreset.svelte';
	import WarmPreset from './presets/WarmPreset.svelte';
	import RefinedPreset from './presets/RefinedPreset.svelte';
	import MonumentalPreset from './presets/MonumentalPreset.svelte';
	import BroadcastPreset from './presets/BroadcastPreset.svelte';

	const data = $derived($siteData as EventData);

	// ─── Verification phrases ───
	let eventPhrase = $state('');
	let organiserPhrase = $state('');

	$effect(() => {
		if (!data) return;
		computeVerification(data).then((result) => {
			eventPhrase = result.storePhrase;
			organiserPhrase = result.sellerPhrase;
		});
	});

	const eventPhraseFormatted = $derived(
		eventPhrase ? eventPhrase.split(' ').join(' \u00B7 ') : ''
	);
	const organiserPhraseFormatted = $derived(
		organiserPhrase ? organiserPhrase.split(' ').join(' \u00B7 ') : ''
	);

	function getTag(key: string): string {
		return data?.tags?.find((t) => t.key === key)?.value ?? '';
	}

	const preset         = $derived(getTag('T') || 'g');
	const accentColor    = $derived(getTag('C') ? '#' + getTag('C') : '');
	const organiser      = $derived(getTag('o'));
	const startCodec     = $derived(getTag('D'));
	const endCodec       = $derived(getTag('d'));
	const venueName      = $derived(getTag('L'));
	const venueAddress   = $derived(getTag('l'));
	const onlineUrl      = $derived(getTag('O'));
	const body           = $derived(getTag('b'));
	const admissionRaw   = $derived(getTag('$'));
	const admissionCurrency = $derived(getTag('K'));
	const rsvpUrl        = $derived(getTag('r'));
	const lineupRaw      = $derived(getTag('P'));
	const agenda         = $derived(getTag('A'));
	const capacity       = $derived(getTag('q'));
	const ageRestriction = $derived(getTag('R'));
	const dressCode      = $derived(getTag('v'));
	const secondaryRaw   = $derived(getTag('2'));
	const contactsRaw    = $derived(getTag('j'));
	const contactEmail   = $derived(getTag('I'));

	// Nostr contact: only show if G tag present AND event is signed (has a valid pubkey).
	// Display handle is the event's npub so followers can find the organiser on Nostr.
	function base64urlToHex(b64url: string): string {
		const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '=';
		const binary = atob(base64);
		return Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
	}

	const nostrNpub = $derived.by((): string => {
		if (!$siteSigned) return '';
		if (!data?.tags?.find((t) => t.key === 'G')) return '';
		if (!data?.pubkey || data.pubkey.length !== 43) return '';
		try { return npubEncode(base64urlToHex(data.pubkey)); } catch { return ''; }
	});

	const contacts = $derived.by(() => {
		const list = parseContacts(contactsRaw).map(c => ({
			name:   c.code === CUSTOM_CODE ? (c.customName || 'Contact') : (platformByCode.get(c.code)?.name ?? c.code),
			handle: c.handle
		}));
		if (contactEmail) list.push({ name: 'Email', handle: contactEmail });
		if (nostrNpub)    list.push({ name: 'Nostr', handle: nostrNpub });
		return list;
	});

	function parseCodecDate(codec: string): Date | null {
		if (!codec || codec.length < 8) return null;
		const y = parseInt(codec.slice(0, 4));
		const mo = parseInt(codec.slice(4, 6)) - 1;
		const d = parseInt(codec.slice(6, 8));
		const h = codec.length >= 12 ? parseInt(codec.slice(8, 10)) : 0;
		const mi = codec.length >= 12 ? parseInt(codec.slice(10, 12)) : 0;
		return new Date(y, mo, d, h, mi);
	}

	const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

	function fmtTime12(codec: string): string {
		if (!codec || codec.length < 12) return '';
		const h = parseInt(codec.slice(8, 10));
		const mi = codec.slice(10, 12);
		return `${h % 12 || 12}:${mi} ${h >= 12 ? 'PM' : 'AM'}`;
	}

	function fmtTime24(codec: string): string {
		if (!codec || codec.length < 12) return '';
		return `${codec.slice(8, 10)}:${codec.slice(10, 12)}`;
	}

	// Returns "date" portion only — never includes time.
	// Multi-day: "11–12 October 2026", "11 Oct – 2 Nov 2026", etc.
	function fmtDateRangeLong(s: string, e: string): string {
		const sd = parseCodecDate(s);
		if (!sd) return '';
		const sameDay = !e || s.slice(0, 8) === e.slice(0, 8);
		if (sameDay) {
			return sd.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
		}
		const ed = parseCodecDate(e)!;
		const sameYear  = sd.getFullYear() === ed.getFullYear();
		const sameMonth = sameYear && sd.getMonth() === ed.getMonth();
		if (sameMonth) {
			const mo = sd.toLocaleDateString('en-US', { month: 'long' });
			return `${sd.getDate()}–${ed.getDate()} ${mo} ${sd.getFullYear()}`;
		}
		if (sameYear) {
			const sm = sd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
			const em = ed.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
			return `${sm} – ${em} ${sd.getFullYear()}`;
		}
		const sf = sd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		const ef = ed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		return `${sf} – ${ef}`;
	}

	function fmtDateRangeMedium(s: string, e: string): string {
		const sd = parseCodecDate(s);
		if (!sd) return '';
		const sameDay = !e || s.slice(0, 8) === e.slice(0, 8);
		if (sameDay) {
			return sd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		}
		const ed = parseCodecDate(e)!;
		const sameYear  = sd.getFullYear() === ed.getFullYear();
		const sameMonth = sameYear && sd.getMonth() === ed.getMonth();
		if (sameMonth) {
			const mo = sd.toLocaleDateString('en-US', { month: 'long' });
			return `${sd.getDate()}–${ed.getDate()} ${mo} ${sd.getFullYear()}`;
		}
		if (sameYear) {
			const sm = sd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
			const em = ed.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
			return `${sm} – ${em} ${sd.getFullYear()}`;
		}
		const sf = sd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		const ef = ed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		return `${sf} – ${ef}`;
	}

	function fmtDateRangeShort(s: string, e: string): string {
		const sd = parseCodecDate(s);
		if (!sd) return '';
		const d1 = sd.getDate();
		const m1 = MONTHS_SHORT[sd.getMonth()];
		const y1 = sd.getFullYear();
		const sameDay = !e || s.slice(0, 8) === e.slice(0, 8);
		if (sameDay) return `${String(d1).padStart(2, '0')} ${m1} ${y1}`;
		const ed = parseCodecDate(e)!;
		const d2 = ed.getDate();
		const m2 = MONTHS_SHORT[ed.getMonth()];
		const y2 = ed.getFullYear();
		const sameYear  = y1 === y2;
		const sameMonth = sameYear && m1 === m2;
		if (sameMonth)  return `${d1}–${d2} ${m1} ${y1}`;
		if (sameYear)   return `${d1} ${m1} – ${d2} ${m2} ${y1}`;
		return `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`;
	}

	function fmtTimeRange12(s: string, e: string): string {
		const t1 = fmtTime12(s);
		if (!t1) return '';
		const t2 = e ? fmtTime12(e) : '';
		return t2 ? `${t1} – ${t2}` : t1;
	}

	function fmtTimeRange24(s: string, e: string): string {
		const t1 = fmtTime24(s);
		if (!t1) return '';
		const t2 = e ? fmtTime24(e) : '';
		return t2 ? `${t1} – ${t2}` : t1;
	}

	function toAbsoluteUrl(url: string): string {
		if (!url) return url;
		if (/^https?:\/\//i.test(url)) return url;
		if (url.includes('.') && !url.includes(' ')) return 'https://' + url;
		return url;
	}

	const unescape = (s: string) =>
		s.replace(/\\(.)/g, (_, c) => ({ d: '.', c: ',', s: ';', q: '"', o: ':', l: '<', '\\': '\\' }[c as string] ?? c));

	// Parse a single lineup entry into { name, role }.
	// Format stored: "escapedName:escapedRole" where ':' is literal separator;
	// any ':' within name/role is stored as '\o'. We must split before unescaping.
	function parseLineupEntry(raw: string): { name: string; role: string } {
		let i = 0;
		while (i < raw.length) {
			if (raw[i] === '\\') { i += 2; continue; } // skip escape pair
			if (raw[i] === ':') {
				return { name: unescape(raw.slice(0, i)), role: unescape(raw.slice(i + 1)) };
			}
			i++;
		}
		return { name: unescape(raw), role: '' };
	}

	const lineup = $derived(lineupRaw ? lineupRaw.split('\\p').map(parseLineupEntry) : []);
	const secondaryImages = $derived(secondaryRaw ? secondaryRaw.split('\\p').filter(Boolean) : []);

	const admissionDisplay = $derived(
		admissionRaw === '0' ? 'Free' :
		admissionRaw
			? `${(parseInt(admissionRaw, 10) / 100).toFixed(2)}${admissionCurrency ? ' ' + admissionCurrency : ''}`
			: ''
	);

	let qrDataUrl = $state('');
	let qrTooLong = $state(false);
	let menuOpen  = $state(false);
	let qrOpen    = $state(false);
	let linkCopied = $state(false);

	async function handleCopyFromOverlay() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 1500);
		} catch {}
	}

	function toggleMenu() { menuOpen = !menuOpen; }

	function handlePrint() {
		menuOpen = false;
		window.print();
	}

	function handleRevealQR(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = false;
		qrOpen = true;
	}

	async function handleCopyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			linkCopied = true;
			setTimeout(() => {
				linkCopied = false;
				menuOpen = false;
			}, 1200);
		} catch {
			menuOpen = false;
		}
	}

	$effect(() => {
		if (typeof window !== 'undefined') {
			QRCode.toDataURL(window.location.href, {
				width: 2048,
				margin: 2,
				errorCorrectionLevel: 'L',
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url: string) => {
				qrDataUrl = url;
			}).catch(() => {
				qrTooLong = true;
			});
		}
	});

	const ev = $derived({
		name:             data?.name ?? '',
		description:      data?.description ?? '',
		image:            data?.image ?? '',
		organiser,
		accentColor,
		// Pre-formatted date range (handles single-day and multi-day correctly)
		dateDisplay:      fmtDateRangeLong(startCodec, endCodec),
		dateDisplayMedium: fmtDateRangeMedium(startCodec, endCodec),
		dateDisplayShort: fmtDateRangeShort(startCodec, endCodec),
		// Pre-formatted time range
		timeDisplay:      fmtTimeRange12(startCodec, endCodec),
		timeDisplay24:    fmtTimeRange24(startCodec, endCodec),
		venueName,
		venueAddress,
		onlineUrl:        toAbsoluteUrl(onlineUrl),
		body,
		admissionDisplay,
		rsvpUrl:          toAbsoluteUrl(rsvpUrl),
		lineup,
		agenda,
		capacity,
		ageRestriction,
		dressCode,
		secondaryImages,
		contacts,
		qrDataUrl,
		eventPhrase: eventPhraseFormatted,
		organiserPhrase: $siteSigned ? organiserPhraseFormatted : '',
		signed: $siteSigned,
	});
</script>

{#if data}
	{#if preset === 'u'}
		<UndergroundPreset {...ev} />
	{:else if preset === 'd'}
		<DeclarationPreset {...ev} />
	{:else if preset === 'w'}
		<WarmPreset {...ev} />
	{:else if preset === 'r'}
		<RefinedPreset {...ev} />
	{:else if preset === 'm'}
		<MonumentalPreset {...ev} />
	{:else if preset === 'b'}
		<BroadcastPreset {...ev} />
	{:else}
		<GenericPreset {...ev} />
	{/if}

	<!-- ─── Share widget ──────────────────────────────────────── -->
	<div class="share-widget no-print" data-preset={preset} style="--accent: {accentColor || '#ffffff'}">
		{#if menuOpen}
			<div class="share-backdrop" onclick={() => menuOpen = false}></div>
			<div class="share-menu" data-preset={preset}>
				<button class="menu-item" onclick={handlePrint}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="6 9 6 2 18 2 18 9"/>
						<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
						<rect x="6" y="14" width="12" height="8"/>
					</svg>
					Print Poster
				</button>
				<button class="menu-item" onclick={(e) => handleRevealQR(e)}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
						<rect x="3" y="14" width="7" height="7"/>
						<rect x="14" y="14" width="3" height="3"/>
					</svg>
					Reveal QR
				</button>
				<button class="menu-item" onclick={handleCopyLink}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
					</svg>
					{linkCopied ? 'Copied!' : 'Copy Link'}
				</button>
			</div>
		{/if}
		<button class="share-btn" onclick={toggleMenu} aria-label="Share options" aria-expanded={menuOpen} class:is-open={menuOpen}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
				<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
				<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
			</svg>
		</button>
	</div>

{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="qr-overlay no-print" class:qr-visible={qrOpen} data-preset={preset}
     style="--accent: {accentColor || '#ffffff'}"
     onclick={() => qrOpen = false}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="qr-card" class:qr-card-fallback={qrTooLong} onclick={(e) => e.stopPropagation()}>
		{#if qrTooLong}
			<div class="qr-fallback">
				<svg class="qr-fallback-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="3" y="3" width="7" height="7"/>
					<rect x="14" y="14" width="3" height="3"/>
					<rect x="3" y="14" width="7" height="7"/>
					<line x1="14" y1="3" x2="21" y2="10"/>
					<line x1="21" y1="3" x2="14" y2="10"/>
				</svg>
				<p class="qr-fallback-title">This event is too large for a QR code</p>
				<p class="qr-fallback-body">The link itself contains the entire event poster. Copy it and share it directly.</p>
				<button class="qr-fallback-copy" onclick={handleCopyFromOverlay}>
					{linkCopied ? 'Copied' : 'Copy link'}
				</button>
			</div>
		{:else if qrDataUrl}
			<img src={qrDataUrl} alt="QR code" class="qr-large" />
		{:else}
			<div class="qr-large qr-loading">Generating QR…</div>
		{/if}
		{#if !qrTooLong && data?.name}
			<p class="qr-title">{data.name}</p>
		{/if}
		{#if !qrTooLong}
			<p class="qr-label">Scan to share</p>
		{/if}
		<button class="qr-close" onclick={() => qrOpen = false} aria-label="Close">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}

	/* ── Share widget ── */
	.share-widget {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 9000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.share-btn {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(10, 10, 10, 0.72);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: rgba(255, 255, 255, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
		flex-shrink: 0;
	}

	.share-btn:hover,
	.share-btn.is-open {
		border-color: var(--accent);
		color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent), 0 0 16px color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.share-backdrop {
		position: fixed;
		inset: 0;
		z-index: -1;
	}

	/* ── Share menu ── */
	.share-menu {
		background: rgba(8, 8, 8, 0.92);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		overflow: hidden;
		min-width: 160px;
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.04);
		animation: menu-in 0.12s ease-out;
	}

	/* Underground: neon border glow */
	.share-menu[data-preset="u"] {
		border-color: color-mix(in srgb, var(--accent) 40%, transparent);
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.8), 0 0 20px color-mix(in srgb, var(--accent) 15%, transparent);
	}

	/* Refined / Warm / Generic: lighter glass */
	.share-menu[data-preset="r"],
	.share-menu[data-preset="w"],
	.share-menu[data-preset="g"] {
		background: rgba(255, 255, 255, 0.92);
		border-color: rgba(0, 0, 0, 0.1);
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18);
	}

	@keyframes menu-in {
		from { opacity: 0; transform: translateY(6px) scale(0.97); }
		to   { opacity: 1; transform: translateY(0) scale(1); }
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem 1rem;
		background: none;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.78);
		font-size: 0.8125rem;
		font-family: system-ui, -apple-system, Arial, sans-serif;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		letter-spacing: 0.01em;
		transition: background 0.1s, color 0.1s;
	}

	.menu-item:last-child { border-bottom: none; }

	.menu-item:hover {
		background: rgba(255, 255, 255, 0.07);
		color: var(--accent);
	}

	.menu-item:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* Underground menu items: uppercase mono */
	.share-menu[data-preset="u"] .menu-item {
		font-family: 'Arial Black', Arial, sans-serif;
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-bottom-color: rgba(255, 255, 255, 0.05);
	}

	/* Light preset menu items */
	.share-menu[data-preset="r"] .menu-item,
	.share-menu[data-preset="w"] .menu-item,
	.share-menu[data-preset="g"] .menu-item {
		color: rgba(0, 0, 0, 0.7);
		border-bottom-color: rgba(0, 0, 0, 0.07);
	}

	.share-menu[data-preset="r"] .menu-item:hover,
	.share-menu[data-preset="w"] .menu-item:hover,
	.share-menu[data-preset="g"] .menu-item:hover {
		background: rgba(0, 0, 0, 0.05);
		color: var(--accent);
	}

	/* ── QR overlay ── */
	.qr-overlay {
		position: fixed;
		inset: 0;
		z-index: 9500;
		background: rgba(0, 0, 0, 0.88);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		visibility: hidden;
		transition: opacity 200ms ease, visibility 200ms ease;
	}

	.qr-overlay.qr-visible {
		opacity: 1;
		visibility: visible;
	}

	.qr-overlay[data-preset="u"] {
		background: rgba(0, 0, 0, 0.94);
	}

	.qr-card {
		position: relative;
		background: #fff;
		border-radius: 12px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: min(90vmin, 720px);
		max-width: calc(100vw - 2rem);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
		cursor: default;
	}

	/* Underground: dark card with neon border */
	.qr-overlay[data-preset="u"] .qr-card {
		background: #0a0a0a;
		border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.9), 0 0 40px color-mix(in srgb, var(--accent) 20%, transparent);
	}

	.qr-large {
		width: 100%;
		height: auto;
		display: block;
		image-rendering: pixelated;
	}

	.qr-loading {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8125rem;
		color: #999;
		font-family: system-ui, Arial, sans-serif;
		image-rendering: auto;
	}

	/* ── QR fallback (URL too long) ── */
	.qr-fallback {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1.5rem;
		box-sizing: border-box;
		text-align: center;
		border: 1px dashed rgba(0, 0, 0, 0.18);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.02);
	}

	.qr-fallback-icon {
		color: rgba(0, 0, 0, 0.45);
	}

	.qr-fallback-title {
		font-size: 1rem;
		font-weight: 600;
		color: #111;
		margin: 0;
		font-family: system-ui, -apple-system, Arial, sans-serif;
		letter-spacing: -0.01em;
		max-width: 32ch;
		line-height: 1.3;
	}

	.qr-fallback-body {
		font-size: 0.8125rem;
		color: #666;
		margin: 0;
		font-family: system-ui, -apple-system, Arial, sans-serif;
		max-width: 38ch;
		line-height: 1.5;
	}

	.qr-fallback-copy {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-family: system-ui, -apple-system, Arial, sans-serif;
		font-weight: 500;
		letter-spacing: 0.02em;
		border: 1px solid rgba(0, 0, 0, 0.18);
		border-radius: 6px;
		background: transparent;
		color: #111;
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s, color 0.12s;
	}
	.qr-fallback-copy:hover {
		background: rgba(0, 0, 0, 0.06);
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Underground: dark fallback */
	.qr-overlay[data-preset="u"] .qr-fallback {
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
		background: rgba(255, 255, 255, 0.02);
	}
	.qr-overlay[data-preset="u"] .qr-fallback-icon {
		color: var(--accent);
		opacity: 0.7;
	}
	.qr-overlay[data-preset="u"] .qr-fallback-title {
		color: rgba(255, 255, 255, 0.92);
		font-family: 'Arial Black', Arial, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.875rem;
	}
	.qr-overlay[data-preset="u"] .qr-fallback-body {
		color: rgba(255, 255, 255, 0.55);
	}
	.qr-overlay[data-preset="u"] .qr-fallback-copy {
		border-color: rgba(255, 255, 255, 0.18);
		color: rgba(255, 255, 255, 0.85);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-family: 'Arial Black', Arial, sans-serif;
		font-size: 0.625rem;
	}
	.qr-overlay[data-preset="u"] .qr-fallback-copy:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Underground: invert QR for dark card */
	.qr-overlay[data-preset="u"] .qr-large {
		filter: invert(1);
	}

	.qr-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: #111;
		margin: 0;
		text-align: center;
		font-family: system-ui, -apple-system, Arial, sans-serif;
		letter-spacing: -0.01em;
	}

	.qr-label {
		font-size: 0.6875rem;
		color: #999;
		margin: 0;
		text-align: center;
		font-family: system-ui, -apple-system, Arial, sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.qr-overlay[data-preset="u"] .qr-title { color: rgba(255, 255, 255, 0.9); }
	.qr-overlay[data-preset="u"] .qr-label  { color: var(--accent); }

	.qr-close {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: rgba(0, 0, 0, 0.06);
		color: #666;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}

	.qr-close:hover { background: rgba(0,0,0,0.12); color: #222; }

	.qr-overlay[data-preset="u"] .qr-close {
		border-color: rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.5);
	}

	.qr-overlay[data-preset="u"] .qr-close:hover {
		background: rgba(255,255,255,0.1);
		color: var(--accent);
	}

	/* ── Print ── */
	@media print {
		.no-print {
			display: none !important;
		}
	}
</style>

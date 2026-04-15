<script lang="ts">
	interface Props {
		name: string; description: string; image: string; organiser: string;
		accentColor: string; dateDisplay: string; dateDisplayMedium: string; dateDisplayShort: string;
		timeDisplay: string; timeDisplay24: string; venueName: string;
		venueAddress: string; onlineUrl: string; body: string; admissionDisplay: string;
		rsvpUrl: string; lineup: { name: string; role: string }[]; agenda: string; capacity: string;
		ageRestriction: string; dressCode: string; secondaryImages: string[];
		contacts: { name: string; handle: string }[]; qrDataUrl: string;
		[key: string]: unknown;
	}

	let {
		name, description, image, organiser, accentColor,
		dateDisplay, timeDisplay,
		venueName, venueAddress, onlineUrl, body, admissionDisplay,
		rsvpUrl, lineup, agenda, capacity, ageRestriction, dressCode,
		secondaryImages, contacts, qrDataUrl,
		eventPhrase = '', organiserPhrase = '', signed = false
	}: Props = $props();

	import ImageLightbox from './ImageLightbox.svelte';
	import CopyHandle from './CopyHandle.svelte';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import { sanitizeUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { fitText } from './fitText.js';

	const accent = $derived(accentColor || '#D97706');
	const allImages = [image, ...secondaryImages].filter(Boolean);

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	// ── Poster overflow trimming ──────────────────────────
	// Poster is always rendered off-screen for measurement.
	// Drop the tallest optional section when content overflows.
	let posterEl: HTMLElement | undefined = $state();
	let showBody   = $state(true);
	let showLineup = $state(true);
	let showAgenda = $state(true);

	$effect(() => {
		void body; void lineup; void agenda;
		showBody   = !!body;
		showLineup = lineup.length > 0;
		showAgenda = !!agenda;
		const id = requestAnimationFrame(() => measureAndTrim());
		return () => cancelAnimationFrame(id);
	});

	function measureAndTrim() {
		if (!posterEl) return;
		if (posterEl.scrollHeight <= posterEl.clientHeight) return;

		const candidates = [
			showBody   && body              ? { key: 'body'   as const, h: posterEl.querySelector<HTMLElement>('.p-body-section')?.offsetHeight   ?? 0 } : null,
			showLineup && lineup.length > 0 ? { key: 'lineup' as const, h: posterEl.querySelector<HTMLElement>('.p-lineup-section')?.offsetHeight ?? 0 } : null,
			showAgenda && agenda            ? { key: 'agenda' as const, h: posterEl.querySelector<HTMLElement>('.p-agenda-section')?.offsetHeight  ?? 0 } : null,
		].filter((c): c is { key: 'body' | 'lineup' | 'agenda'; h: number } => c !== null && c.h > 0);

		if (candidates.length === 0) return;

		const tallest = candidates.reduce((a, b) => a.h > b.h ? a : b);
		if      (tallest.key === 'body')   showBody   = false;
		else if (tallest.key === 'lineup') showLineup = false;
		else                               showAgenda = false;

		requestAnimationFrame(() => measureAndTrim());
	}
</script>

<!-- ─── SCREEN ──────────────────────────────────────────────────── -->
<div class="warm" style="--accent: {accent}">
	<div class="page-frame">
		<span class="corner corner-tl">✦</span>
		<span class="corner corner-tr">✦</span>
		<span class="corner corner-bl">✦</span>
		<span class="corner corner-br">✦</span>

		<div class="orn-rule">
			<span class="orn-line"></span>
			<span class="orn-glyph">❧ ✦ ☙</span>
			<span class="orn-line"></span>
		</div>

		<header class="header">
			{#if organiser}
				<p class="presented-by">Presented by <em>{organiser}</em></p>
			{/if}
			{#if organiserPhrase}
				<p class="organiser-phrase">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					{organiserPhrase}
				</p>
			{/if}
			<h1 class="event-name" use:fitText>{name}</h1>
			{#if description}
				<p class="tagline">"{description}"</p>
			{/if}
		</header>

		<div class="orn-rule">
			<span class="orn-line"></span>
			<span class="orn-glyph">✦</span>
			<span class="orn-line"></span>
		</div>

		{#if dateDisplay || venueName || venueAddress || onlineUrl}
			<div class="when-where">
				{#if dateDisplay}
					<div class="ww-col">
						<span class="ww-label">When</span>
						<span class="ww-date">{dateDisplay}</span>
						{#if timeDisplay}<span class="ww-time">{timeDisplay}</span>{/if}
					</div>
				{/if}
				{#if (venueName || venueAddress || onlineUrl) && dateDisplay}
					<span class="ww-sep">◆</span>
				{/if}
				{#if venueName || venueAddress || onlineUrl}
					<div class="ww-col">
						<span class="ww-label">Where</span>
						{#if venueName}<span class="ww-venue">{venueName}</span>{/if}
						{#if venueAddress}<span class="ww-addr">{venueAddress}</span>{/if}
						{#if onlineUrl}<a href={sanitizeUrl(onlineUrl)} class="ww-online" target="_blank" rel="noopener noreferrer">{onlineUrl}</a>{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if allImages.length > 0}
			<div class="gallery" class:gallery-single={allImages.length === 1}>
				{#each allImages as src, i}
					<div
						class="mount"
						role="button"
						tabindex="0"
						onclick={() => openLightbox(i)}
						onkeydown={(e) => e.key === 'Enter' && openLightbox(i)}
						aria-label={i === 0 ? 'View main image' : `View image ${i + 1}`}
					>
						{#if src.startsWith('<')}
							<div class="svg-inline" role="img" aria-label={i === 0 ? name : `Event image ${i + 1}`}>{@html sanitizeSvg(src)}</div>
						{:else}
							<img {src} alt={i === 0 ? name : `Event image ${i + 1}`} />
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if body}
			<div class="orn-rule">
				<span class="orn-line"></span>
				<span class="orn-glyph">✦</span>
				<span class="orn-line"></span>
			</div>
			<p class="body-text">{body}</p>
		{/if}

		{#if lineup.length > 0}
			<div class="orn-rule">
				<span class="orn-line"></span>
				<span class="orn-glyph">❧ &nbsp; Lineup &nbsp; ☙</span>
				<span class="orn-line"></span>
			</div>
			<ul class="lineup-list">
				{#each lineup as act}
					<li class="lineup-item">
						<span class="act-name">{act.name}</span>
						{#if act.role}<span class="act-role"> — {act.role}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if agenda}
			<div class="orn-rule">
				<span class="orn-line"></span>
				<span class="orn-glyph">❧ &nbsp; Schedule &nbsp; ☙</span>
				<span class="orn-line"></span>
			</div>
			<pre class="agenda-text">{agenda}</pre>
		{/if}

		{#if admissionDisplay || ageRestriction || dressCode || capacity}
			<div class="orn-rule">
				<span class="orn-line"></span>
				<span class="orn-glyph">✦</span>
				<span class="orn-line"></span>
			</div>
			<div class="details-block">
				{#if admissionDisplay}
					<div class="detail-row">
						<span class="detail-k">Admission</span>
						<span class="detail-dots"></span>
						<span class="detail-v">{admissionDisplay}</span>
					</div>
				{/if}
				{#if ageRestriction}
					<div class="detail-row">
						<span class="detail-k">Age</span>
						<span class="detail-dots"></span>
						<span class="detail-v">{ageRestriction}</span>
					</div>
				{/if}
				{#if dressCode}
					<div class="detail-row">
						<span class="detail-k">Dress code</span>
						<span class="detail-dots"></span>
						<span class="detail-v">{dressCode}</span>
					</div>
				{/if}
				{#if capacity}
					<div class="detail-row">
						<span class="detail-k">Capacity</span>
						<span class="detail-dots"></span>
						<span class="detail-v">{capacity}</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if contacts.length > 0}
			<div class="contacts-row">
				{#each contacts as c}
					<span class="contact-chip">
						<span class="contact-platform">{c.name}</span>
						{#if c.handle}<span class="contact-handle"><CopyHandle text={c.handle} /></span>{/if}
					</span>
				{/each}
			</div>
		{/if}

		{#if rsvpUrl}
			<div class="rsvp-zone">
				{#if rsvpUrl.startsWith('http')}
					<a href={sanitizeUrl(rsvpUrl)} class="rsvp-btn" target="_blank" rel="noopener noreferrer">
						Reserve Your Place
					</a>
				{:else}
					<span class="rsvp-plain">{rsvpUrl}</span>
				{/if}
			</div>
		{/if}

		{#if eventPhrase}
			<div class="event-phrase">❧ {eventPhrase} ☙</div>
		{/if}

		<div class="orn-rule bottom-orn">
			<span class="orn-line"></span>
			<span class="orn-glyph">❧ ✦ ☙</span>
			<span class="orn-line"></span>
		</div>
	</div>
	<footer class="site-footer">
		Hosted <a href="https://hostednowhere.com" class="footer-link" target="_blank" rel="noopener noreferrer">nowhere</a>. Present everywhere.
	</footer>
</div>

{#if lightboxOpen}
	<ImageLightbox images={allImages} startIndex={lightboxIndex} onclose={() => lightboxOpen = false} />
{/if}

<!-- ─── PRINT POSTER ────────────────────────────────────────────── -->
<div class="poster" style="--accent: {accent}" bind:this={posterEl} aria-hidden="true">
	<div class="p-inner">
		<span class="p-corner p-corner-tl">✦</span>
		<span class="p-corner p-corner-tr">✦</span>
		<span class="p-corner p-corner-bl">✦</span>
		<span class="p-corner p-corner-br">✦</span>

		<div class="p-orn">
			<span class="p-orn-line"></span>
			<span class="p-orn-glyph">❧ ✦ ☙</span>
			<span class="p-orn-line"></span>
		</div>

		<div class="p-header">
			{#if organiser}
				<p class="p-organiser">Presented by <em>{organiser}</em></p>
			{/if}
			<h1 class="p-name" use:fitText>{name}</h1>
			{#if description}
				<p class="p-tagline">"{description}"</p>
			{/if}
		</div>

		<div class="p-orn">
			<span class="p-orn-line"></span>
			<span class="p-orn-glyph">✦</span>
			<span class="p-orn-line"></span>
		</div>

		<div class="p-when-where">
			{#if dateDisplay}
				<div class="p-ww-date">
					{dateDisplay}{#if timeDisplay} — {timeDisplay}{/if}
				</div>
			{/if}
			{#if venueName}
				<div class="p-ww-venue">{venueName}</div>
			{/if}
			{#if venueAddress}
				<div class="p-ww-addr">{venueAddress}</div>
			{/if}
			{#if onlineUrl && !venueName && !venueAddress}
				<div class="p-ww-addr">{onlineUrl}</div>
			{/if}
		</div>

		<div class="p-orn">
			<span class="p-orn-line"></span>
			<span class="p-orn-glyph">✦</span>
			<span class="p-orn-line"></span>
		</div>

		<div class="p-middle">
			{#if showBody}
				<p class="p-body p-body-section">{body}</p>
			{/if}
			{#if showLineup}
				<div class="p-lineup p-lineup-section">
					<div class="p-section-label">— Lineup —</div>
					{#each lineup as act}
						<div class="p-act">
							{act.name}{#if act.role}<span class="p-act-role"> — {act.role}</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if showAgenda}
				<div class="p-agenda-block p-agenda-section">
					<div class="p-section-label">— Schedule —</div>
					<pre class="p-agenda">{agenda}</pre>
				</div>
			{/if}
			{#if admissionDisplay || ageRestriction || capacity}
				<div class="p-details">
					{#if admissionDisplay}<span class="p-detail-item">Admission: {admissionDisplay}</span>{/if}
					{#if ageRestriction}<span class="p-detail-item">Age: {ageRestriction}</span>{/if}
					{#if capacity}<span class="p-detail-item">Capacity: {capacity}</span>{/if}
				</div>
			{/if}
		</div>

		<div class="p-orn" style="margin-top: auto">
			<span class="p-orn-line"></span>
			<span class="p-orn-glyph">❧ ✦ ☙</span>
			<span class="p-orn-line"></span>
		</div>

		<div class="p-footer">
			<div class="p-foot-left">
				{#if rsvpUrl}
					<div class="p-link-block">
						<span class="p-link-label">Tickets & RSVP</span>
						<span class="p-link-url">{rsvpUrl}</span>
					</div>
				{/if}
				{#if onlineUrl}
					<div class="p-link-block">
						<span class="p-link-label">Online</span>
						<span class="p-link-url">{onlineUrl}</span>
					</div>
				{/if}
			</div>
			{#if qrDataUrl}
				<div class="p-qr-block">
					<span class="p-qr-label">Scan to share</span>
					<img src={qrDataUrl} alt="QR code" class="p-qr" />
				</div>
			{/if}
		</div>

	</div>
</div>

<style>
/* ════════════════════════════════════════════════════════
   SCREEN LAYOUT
════════════════════════════════════════════════════════ */

.warm {
	background: #ede5d4;
	color: #1a0d04;
	min-height: 100vh;
	font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif;
	padding: 2rem 1rem;
}

/* Ornamental double-border frame with inner accent rule via box-shadow */
.page-frame {
	position: relative;
	max-width: 680px;
	margin: 0 auto;
	padding: 2.5rem 3rem;
	background: #faf5e9;
	border: 3px double #9a7830;
	box-shadow:
		inset 0 0 0 6px #faf5e9,
		inset 0 0 0 7px #b8924a,
		0 6px 32px rgba(90, 55, 10, 0.15);
}

/* Corner ornaments */
.corner {
	position: absolute;
	color: var(--accent);
	font-size: 0.6875rem;
	line-height: 1;
	pointer-events: none;
}
.corner-tl { top: 0.9rem; left: 0.9rem; }
.corner-tr { top: 0.9rem; right: 0.9rem; }
.corner-bl { bottom: 0.9rem; left: 0.9rem; }
.corner-br { bottom: 0.9rem; right: 0.9rem; }

/* Ornamental rules */
.orn-rule {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin: 1.75rem 0;
}
.orn-line {
	flex: 1;
	height: 1px;
	background: #b8924a;
}
.orn-glyph {
	font-size: 0.6875rem;
	color: var(--accent);
	letter-spacing: 0.25em;
	white-space: nowrap;
	flex-shrink: 0;
}
.bottom-orn {
	margin-bottom: 0;
}

/* Header */
.header {
	text-align: center;
}
.presented-by {
	font-size: 0.8125rem;
	color: #7a5530;
	margin: 0 0 0.375rem;
	letter-spacing: 0.04em;
}

.organiser-phrase {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.375rem;
	font-size: 0.6875rem;
	font-style: italic;
	color: var(--accent);
	margin: 0 0 1rem;
}

.event-phrase {
	text-align: center;
	font-size: 0.6875rem;
	font-style: italic;
	color: #b8924a;
	letter-spacing: 0.06em;
	margin: 1.75rem 0 0;
}
.event-name {
	font-size: clamp(2.5rem, 10vw, 5.5rem);
	font-weight: 700;
	font-style: italic;
	line-height: 1.0;
	letter-spacing: -0.02em;
	color: #1a0d04;
	margin: 0 0 0.875rem;
}
.tagline {
	font-size: 1.0625rem;
	font-style: italic;
	color: #5c3a1e;
	margin: 0;
	line-height: 1.55;
}

/* When / Where ticket block */
.when-where {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 2rem;
	flex-wrap: wrap;
	text-align: center;
	background: rgba(184, 146, 74, 0.08);
	border: 1px solid #c9a462;
	padding: 1.25rem 2rem;
}
.ww-col {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.2rem;
}
.ww-label {
	font-size: 0.5rem;
	letter-spacing: 0.25em;
	text-transform: uppercase;
	color: #9a7830;
	font-style: normal;
}
.ww-date {
	font-size: 1.0625rem;
	font-weight: 700;
	color: var(--accent);
}
.ww-time {
	font-size: 0.875rem;
	color: #5c3a1e;
}
.ww-sep {
	color: #c9a462;
	font-size: 1rem;
	flex-shrink: 0;
}
.ww-venue {
	font-size: 1.0625rem;
	font-weight: 700;
	color: #1a0d04;
}
.ww-addr {
	font-size: 0.8125rem;
	font-style: italic;
	color: #7a5530;
}
.ww-online {
	font-size: 0.8125rem;
	color: var(--accent);
	text-decoration: none;
}

/* Image gallery — mounted photographs */
.gallery {
	display: flex;
	flex-wrap: wrap;
	gap: 1.25rem;
	justify-content: center;
	margin: 1.75rem 0;
}
.gallery-single .mount {
	max-width: 100%;
	flex: none;
	width: 100%;
}
.mount {
	display: inline-block;
	padding: 8px;
	background: #fff;
	border: 1px solid #d4b882;
	box-shadow:
		2px 2px 0 0 #b8924a,
		4px 8px 20px rgba(90, 55, 10, 0.2);
	flex: 1 1 200px;
	max-width: 300px;
	cursor: pointer;
	transition: box-shadow 0.15s, transform 0.15s;
}
.mount:hover {
	box-shadow:
		2px 2px 0 0 #b8924a,
		6px 12px 28px rgba(90, 55, 10, 0.28);
	transform: translateY(-2px);
}
.mount img, .mount .svg-inline {
	width: 100%;
	aspect-ratio: 4 / 3;
	object-fit: cover;
	display: block;
	overflow: hidden;
}

.svg-inline :global(svg) {
	width: 100%;
	height: 100%;
	display: block;
}

/* Body text */
.body-text {
	font-size: 0.9375rem;
	line-height: 1.8;
	color: #2c1a0e;
	margin: 0;
	white-space: pre-wrap;
}

/* Lineup */
.lineup-list {
	list-style: none;
	padding: 0;
	margin: 0;
	text-align: center;
}
.lineup-item {
	font-size: 1.0625rem;
	font-style: italic;
	color: #2c1a0e;
	padding: 0.5rem 0;
	border-bottom: 1px dotted #c9a462;
}
.lineup-item:last-child { border-bottom: none; }
.act-name {
	font-weight: 700;
}
.act-role {
	font-size: 0.875rem;
	color: #7a5530;
	font-weight: 400;
}

/* Agenda */
.agenda-text {
	font-family: Georgia, serif;
	font-size: 0.875rem;
	line-height: 1.75;
	color: #2c1a0e;
	margin: 0;
	white-space: pre-wrap;
	text-align: center;
}

/* Details — dotted leader lines */
.details-block {
	background: rgba(184, 146, 74, 0.06);
	border: 1px solid #c9a462;
	padding: 0.875rem 1.25rem;
}
.detail-row {
	display: flex;
	align-items: baseline;
	gap: 0.25rem;
	padding: 0.25rem 0;
}
.detail-k {
	font-size: 0.875rem;
	font-style: italic;
	color: #7a5530;
	white-space: nowrap;
}
.detail-dots {
	flex: 1;
	border-bottom: 1px dotted #c9a462;
	margin-bottom: 3px;
}
.detail-v {
	font-size: 0.875rem;
	font-weight: 700;
	color: #1a0d04;
	white-space: nowrap;
}

/* Contacts */
.contacts-row {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.5rem 1.75rem;
	margin: 0.5rem 0;
}
.contact-chip {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
}
.contact-platform {
	font-size: 0.5rem;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	color: #9a7830;
}
.contact-handle {
	font-size: 0.8125rem;
	font-style: italic;
	color: #3d2510;
}

/* RSVP — letterpress-style double border button */
.rsvp-zone {
	text-align: center;
	margin: 1.75rem 0 0.5rem;
}
.rsvp-btn {
	display: inline-block;
	padding: 0.75rem 2.5rem;
	border: 1px solid var(--accent);
	box-shadow: inset 0 0 0 3px #faf5e9, inset 0 0 0 5px var(--accent);
	color: var(--accent);
	font-family: Georgia, serif;
	font-size: 0.9375rem;
	font-style: italic;
	font-weight: 700;
	text-decoration: none;
	letter-spacing: 0.06em;
	transition: background 0.18s, color 0.18s;
}
.rsvp-btn:hover {
	background: var(--accent);
	color: #faf5e9;
}

.rsvp-plain {
	font-size: 1rem;
	font-style: italic;
	color: #5c3a1e;
}

/* ════════════════════════════════════════════════════════
   POSTER — off-screen for measurement, shown on print
════════════════════════════════════════════════════════ */
.poster {
	position: fixed;
	top: -9999px;
	left: 0;
	visibility: hidden;
	pointer-events: none;
	display: flex;
	flex-direction: column;
	width: 210mm;
	height: 297mm;
	overflow: hidden;
	background: #faf5e9;
	color: #1a0d04;
	font-family: Georgia, 'Palatino Linotype', serif;
	padding: 7mm;
	box-sizing: border-box;
}

/* Double outer border + inner accent border via pseudo-element */
.p-inner {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	border: 1.5mm double #9a7830;
	padding: 7mm 9mm 5mm;
	position: relative;
}
.p-inner::after {
	content: '';
	position: absolute;
	inset: 2.5mm;
	border: 0.4mm solid #b8924a;
	pointer-events: none;
}

/* Corner ornaments */
.p-corner {
	position: absolute;
	color: var(--accent);
	font-size: 3mm;
	line-height: 1;
	pointer-events: none;
	z-index: 1;
}
.p-corner-tl { top: 4mm; left: 4mm; }
.p-corner-tr { top: 4mm; right: 4mm; }
.p-corner-bl { bottom: 4mm; left: 4mm; }
.p-corner-br { bottom: 4mm; right: 4mm; }

/* Ornamental rules */
.p-orn {
	display: flex;
	align-items: center;
	gap: 2mm;
	flex-shrink: 0;
	margin: 3.5mm 0;
}
.p-orn-line {
	flex: 1;
	height: 0.3mm;
	background: #b8924a;
}
.p-orn-glyph {
	font-size: 2.8mm;
	color: var(--accent);
	letter-spacing: 0.2em;
	white-space: nowrap;
	flex-shrink: 0;
}

/* Header */
.p-header {
	text-align: center;
	flex-shrink: 0;
}
.p-organiser {
	font-size: 3mm;
	color: #7a5530;
	margin: 0 0 2mm;
	letter-spacing: 0.04em;
}
.p-name {
	font-size: 22mm;
	font-weight: 700;
	font-style: italic;
	line-height: 0.95;
	letter-spacing: -0.02em;
	color: #1a0d04;
	margin: 0 0 2.5mm;
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
}
.p-tagline {
	font-size: 4.5mm;
	font-style: italic;
	color: #5c3a1e;
	margin: 0;
	line-height: 1.4;
}

/* When / where */
.p-when-where {
	text-align: center;
	flex-shrink: 0;
	background: rgba(184, 146, 74, 0.08);
	border: 0.3mm solid #c9a462;
	padding: 3mm 5mm;
}
.p-ww-date {
	font-size: 5mm;
	font-weight: 700;
	color: var(--accent);
	margin-bottom: 1mm;
}
.p-ww-venue {
	font-size: 4mm;
	font-weight: 700;
	color: #1a0d04;
}
.p-ww-addr {
	font-size: 3mm;
	font-style: italic;
	color: #7a5530;
}

/* Middle content */
.p-middle {
	flex: 1;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	gap: 3mm;
}
.p-body {
	font-size: 3.6mm;
	line-height: 1.55;
	color: #2c1a0e;
	white-space: pre-wrap;
	margin: 0;
}
.p-section-label {
	font-size: 2.5mm;
	font-style: italic;
	color: #9a7830;
	letter-spacing: 0.1em;
	text-align: center;
	margin-bottom: 1.5mm;
}
.p-lineup {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5mm;
}
.p-act {
	font-size: 4.5mm;
	font-style: italic;
	font-weight: 700;
	color: #1a0d04;
	text-align: center;
}
.p-act-role {
	font-size: 3mm;
	font-weight: 400;
	color: #7a5530;
}
.p-agenda-block {
	display: flex;
	flex-direction: column;
}
.p-agenda {
	font-family: Georgia, serif;
	font-size: 3mm;
	line-height: 1.55;
	color: #2c1a0e;
	margin: 0;
	white-space: pre-wrap;
	text-align: center;
}
.p-details {
	display: flex;
	justify-content: center;
	gap: 4mm;
	flex-wrap: wrap;
}
.p-detail-item {
	font-size: 2.8mm;
	font-style: italic;
	color: #7a5530;
}

/* Footer: info left, QR right */
.p-footer {
	display: flex;
	align-items: stretch;
	flex-shrink: 0;
	border-top: 0.3mm solid #b8924a;
	margin-top: 0;
}
.p-foot-left {
	flex: 1;
	padding: 3mm 0 2mm;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 2mm;
}
.p-link-block {
	display: flex;
	flex-direction: column;
	gap: 0.5mm;
}
.p-link-label {
	font-size: 2mm;
	letter-spacing: 0.2em;
	text-transform: uppercase;
	color: #9a7830;
	font-style: normal;
}
.p-link-url {
	font-family: 'Courier New', monospace;
	font-size: 2.5mm;
	color: #1a0d04;
	word-break: break-all;
}
.p-qr-block {
	flex-shrink: 0;
	padding: 3mm 0 3mm 4mm;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.5mm;
}
.p-qr-label {
	font-size: 1.8mm;
	letter-spacing: 0.15em;
	text-transform: uppercase;
	color: #9a7830;
	font-style: italic;
}
.p-qr {
	width: 52mm;
	height: 52mm;
	display: block;
	border: 0.3mm solid #c9a462;
	padding: 1mm;
	background: #fff;
}

/* Site footer */
.site-footer {
	padding: 1.25rem 2rem;
	border-top: 1px solid rgba(0, 0, 0, 0.1);
	font-family: Georgia, 'Palatino Linotype', serif;
	font-size: 0.8125rem;
	color: rgba(0, 0, 0, 0.35);
	text-align: center;
}

.footer-link {
	color: var(--accent);
	text-decoration: none;
	font-style: italic;
}

.footer-link:hover {
	text-decoration: underline;
}

@media print {
	.no-print { display: none !important; }
	@page { size: A4 portrait; margin: 0; }
	.warm { display: none !important; }
	.poster {
		position: relative;
		top: auto;
		left: auto;
		visibility: visible;
		pointer-events: auto;
	}
}
</style>

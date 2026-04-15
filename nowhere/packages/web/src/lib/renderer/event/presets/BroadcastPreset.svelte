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
		dateDisplayShort, timeDisplay24,
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

	const accent = $derived(accentColor || '#E5001C');
	const isSvgImage = $derived(image?.startsWith('<'));
	const sanitizedSvg = $derived.by(() => isSvgImage ? sanitizeSvg(image) : '');

	function getContrastColor(hex: string): '#ffffff' | '#000000' {
		const c = hex.replace('#', '');
		if (c.length !== 6) return '#ffffff';
		const r = parseInt(c.slice(0, 2), 16);
		const g = parseInt(c.slice(2, 4), 16);
		const b = parseInt(c.slice(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.55 ? '#000000' : '#ffffff';
	}

	const textColor = $derived(getContrastColor(accent));
	const isLight = $derived(textColor === '#000000');

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	const lightboxImages = $derived([image, ...secondaryImages].filter(Boolean));

	function openLightboxSecondary(i: number) {
		lightboxIndex = image ? i + 1 : i;
		lightboxOpen = true;
	}

	// ── Poster overflow trimming ──────────────────────────
	// Poster is always rendered off-screen for measurement.
	// Drop lineup if it causes the poster to overflow.
	let posterEl: HTMLElement | undefined = $state();
	let showLineup = $state(true);

	$effect(() => {
		void lineup;
		showLineup = lineup.length > 0;
		const id = requestAnimationFrame(() => measureAndTrim());
		return () => cancelAnimationFrame(id);
	});

	function measureAndTrim() {
		if (!posterEl) return;
		if (posterEl.scrollHeight <= posterEl.clientHeight) return;

		if (showLineup && lineup.length > 0) {
			showLineup = false;
			requestAnimationFrame(() => measureAndTrim());
		}
	}
</script>

<!-- ─── SCREEN ──────────────────────────────────────────────────── -->
<div class="broadcast no-print" style="--accent: {accent}; --text: {textColor}">

	<!-- Main field: name + racing stripes + image -->
	<div class="main-field">
		<div class="stripes" class:stripes-light={isLight}>
			<div class="stripe s1"></div>
			<div class="stripe s2"></div>
			<div class="stripe s3"></div>
		</div>

		{#if image}
			<div class="image-zone">
				{#if isSvgImage}
					<div class="svg-inline" role="img" aria-label={name}>{@html sanitizedSvg}</div>
				{:else}
					<img src={image} alt={name} />
				{/if}
			</div>
		{/if}

		<div class="name-zone">
			<h1 class="event-name" use:fitText>{name.toUpperCase()}</h1>
			{#if description}
				<p class="tagline">{description.toUpperCase()}</p>
			{/if}
		</div>
	</div>

	<!-- Date + time + location block -->
	{#if dateDisplayShort || timeDisplay24 || venueName || venueAddress}
		<div class="date-block">
			<div class="date-block-left">
				<span class="date-label">DATE</span>
				{#if dateDisplayShort}<span class="date-value">{dateDisplayShort}</span>{/if}
				{#if timeDisplay24}<span class="date-sep">·</span><span class="date-value">{timeDisplay24}</span>{/if}
			</div>
			{#if venueName || venueAddress}
				<div class="date-block-location">
					{#if venueName}<span class="date-loc-name">{venueName.toUpperCase()}</span>{/if}
					{#if venueAddress}<span class="date-loc-addr">{venueAddress.toUpperCase()}</span>{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Tickets: directly under the date/location box -->
	{#if rsvpUrl || onlineUrl}
		<div class="tickets-row">
			<span class="tickets-label">TICKETS</span>
			{#if rsvpUrl && !rsvpUrl.startsWith('http')}
				<span class="tickets-value">{rsvpUrl}</span>
			{:else}
				<a href={sanitizeUrl(rsvpUrl || onlineUrl)} class="tickets-value" target="_blank" rel="noopener noreferrer">{rsvpUrl || onlineUrl}</a>
			{/if}
		</div>
	{/if}

	<!-- Info cells -->
	{#if organiser || admissionDisplay || capacity || ageRestriction || dressCode || organiserPhrase}
		<div class="info-bar">
			{#if organiser}
				<div class="info-cell">
					<span class="ic-label">PRESENTED BY</span>
					<span class="ic-value">{organiser.toUpperCase()}</span>
					{#if organiserPhrase}
						<span class="ic-organiser-phrase">
							<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							{organiserPhrase}
						</span>
					{/if}
				</div>
			{/if}
			{#if admissionDisplay}
				<div class="info-cell">
					<span class="ic-label">ADMISSION</span>
					<span class="ic-value">{admissionDisplay.toUpperCase()}</span>
				</div>
			{/if}
			{#if capacity}
				<div class="info-cell">
					<span class="ic-label">CAPACITY</span>
					<span class="ic-value">{capacity}</span>
				</div>
			{/if}
			{#if ageRestriction}
				<div class="info-cell">
					<span class="ic-label">AGE</span>
					<span class="ic-value">{ageRestriction}</span>
				</div>
			{/if}
			{#if dressCode}
				<div class="info-cell">
					<span class="ic-label">DRESS</span>
					<span class="ic-value">{dressCode.toUpperCase()}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Lineup -->
	{#if lineup.length > 0}
		<div class="lineup-bar">
			<span class="lineup-label">FEATURING</span>
			<div class="lineup-acts">
				{#each lineup as act, i}
					<span class="act">{act.name.toUpperCase()}{#if act.role}<span class="act-role"> / {act.role.toUpperCase()}</span>{/if}</span>
					{#if i < lineup.length - 1}<span class="act-sep"> · </span>{/if}
				{/each}
			</div>
		</div>
	{/if}

	<!-- Body -->
	{#if body}
		<div class="body-section">
			<p class="body-text">{body}</p>
		</div>
	{/if}

	<!-- Schedule -->
	{#if agenda}
		<div class="body-section">
			<div class="body-label">SCHEDULE</div>
			<pre class="agenda-text">{agenda}</pre>
		</div>
	{/if}

	<!-- Contacts -->
	{#if contacts.length > 0}
		<div class="contacts-bar">
			<span class="contacts-heading">CONTACT</span>
			<div class="contacts-inline">
				{#each contacts as c}
					<div class="contact-chip">
						<span class="contact-platform">{c.name.toUpperCase()}</span>
						{#if c.handle}<span class="contact-handle"><CopyHandle text={c.handle} /></span>{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Gallery -->
	{#if secondaryImages.length > 0}
		<div class="gallery-bar">
			{#each secondaryImages as src, i}
				<button class="lb-trigger" onclick={() => openLightboxSecondary(i)} aria-label="View image {i + 1}">
					<img {src} alt="Event image {i + 1}" class="gallery-img" />
				</button>
			{/each}
		</div>
	{/if}

	{#if eventPhrase}
		<div class="event-phrase">{eventPhrase}</div>
	{/if}

	<footer class="site-footer">
		Hosted <a href="https://hostednowhere.com" class="footer-link" target="_blank" rel="noopener noreferrer">nowhere</a>. Present everywhere.
	</footer>
</div>

{#if lightboxOpen}
	<ImageLightbox images={lightboxImages} startIndex={lightboxIndex} onclose={() => lightboxOpen = false} />
{/if}

<!-- ─── PRINT POSTER ────────────────────────────────────────────── -->
<div class="poster" bind:this={posterEl} aria-hidden="true" style="--accent: {accent}; --text: {textColor}">
	<div class="p-inner">

		<!-- Racing stripes -->
		<div class="p-stripes" class:p-stripes-light={isLight}>
			<div class="p-stripe p-s1"></div>
			<div class="p-stripe p-s2"></div>
			<div class="p-stripe p-s3"></div>
		</div>

		<!-- Main: title -->
		<div class="p-main">
			<h1 class="p-name" use:fitText>{name.toUpperCase()}</h1>
			{#if description}
				<p class="p-tagline">{description.toUpperCase()}</p>
			{/if}
		</div>

		<!-- Date + time + location block -->
		{#if dateDisplayShort || timeDisplay24 || venueName || venueAddress}
			<div class="p-date-block">
				<div class="p-date-block-left">
					<span class="p-date-label">DATE</span>
					{#if dateDisplayShort}<span class="p-date-value">{dateDisplayShort}</span>{/if}
					{#if timeDisplay24}<span class="p-date-sep">·</span><span class="p-date-value">{timeDisplay24}</span>{/if}
				</div>
				{#if venueName || venueAddress}
					<div class="p-date-block-location">
						{#if venueName}<span class="p-date-loc-name">{venueName.toUpperCase()}</span>{/if}
						{#if venueAddress}<span class="p-date-loc-addr">{venueAddress.toUpperCase()}</span>{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Info cells -->
		{#if organiser || admissionDisplay || ageRestriction}
			<div class="p-info-bar">
				{#if organiser}
					<div class="p-info-cell">
						<span class="p-ic-label">PRESENTED BY</span>
						<span class="p-ic-value">{organiser.toUpperCase()}</span>
					</div>
				{/if}
				{#if admissionDisplay}
					<div class="p-info-cell">
						<span class="p-ic-label">ADMISSION</span>
						<span class="p-ic-value">{admissionDisplay.toUpperCase()}</span>
					</div>
				{/if}
				{#if ageRestriction}
					<div class="p-info-cell">
						<span class="p-ic-label">AGE</span>
						<span class="p-ic-value">{ageRestriction}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Lineup -->
		{#if showLineup}
			<div class="p-lineup-section p-lineup-bar">
				<span class="p-lineup-label">FEATURING</span>
				<div class="p-lineup-acts">
					{#each lineup as act, i}
						<span class="p-act">{act.name.toUpperCase()}{#if act.role}<span class="p-act-role"> / {act.role.toUpperCase()}</span>{/if}</span>
						{#if i < lineup.length - 1}<span class="p-act-sep"> · </span>{/if}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Footer: tickets + QR -->
		<div class="p-footer" class:p-footer-light={isLight}>
			<div class="p-foot-left">
				{#if rsvpUrl}
					<div class="p-rsvp">
						<span class="p-rsvp-label">TICKETS</span>
						<span class="p-rsvp-url">{rsvpUrl}</span>
					</div>
				{/if}
				{#if onlineUrl}
					<div class="p-rsvp">
						<span class="p-rsvp-label">ONLINE</span>
						<span class="p-rsvp-url">{onlineUrl}</span>
					</div>
				{/if}
			</div>
			{#if qrDataUrl}
				<div class="p-qr-wrap">
					<img src={qrDataUrl} alt="QR code" class="p-qr-img" class:p-qr-invert={!isLight} />
				</div>
			{/if}
		</div>

	</div>
</div>

<style>
/* ════════════════════════════════════════════════════════
   SCREEN LAYOUT
════════════════════════════════════════════════════════ */

.broadcast {
	background: var(--accent);
	color: var(--text);
	min-height: 100vh;
	font-family: Impact, 'Arial Black', 'Franklin Gothic Heavy', Arial, sans-serif;
	display: flex;
	flex-direction: column;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

/* Main field */
.main-field {
	position: relative;
	flex: 1;
	min-height: 45vh;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding: 2.5rem 1.5rem 2rem;
	overflow: hidden;
}

/* Racing stripes — three parallel diagonals */
.stripes {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
}

.stripe {
	position: absolute;
	top: -50%;
	height: 200%;
	transform: rotate(-14deg);
}

.s1 { right: 2%;  width: 28%; background: rgba(0, 0, 0, 0.1); }
.s2 { right: 33%; width: 7%;  background: rgba(0, 0, 0, 0.07); }
.s3 { right: 43%; width: 3%;  background: rgba(0, 0, 0, 0.05); }

.stripes-light .s1 { background: rgba(0, 0, 0, 0.07); }
.stripes-light .s2 { background: rgba(0, 0, 0, 0.05); }
.stripes-light .s3 { background: rgba(0, 0, 0, 0.03); }

/* Image: right-side bleed with blend mode */
.image-zone {
	position: absolute;
	top: 0; right: 0;
	width: 42%;
	height: 100%;
	z-index: 0;
}

.image-zone img, .image-zone .svg-inline {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	mix-blend-mode: multiply;
	opacity: 0.4;
	overflow: hidden;
}

.svg-inline :global(svg) {
	width: 100%;
	height: 100%;
	display: block;
}

.name-zone {
	position: relative;
	z-index: 1;
}

/* Title: maximum impact */
.event-name {
	font-size: clamp(4rem, 15vw, 9rem);
	font-weight: 400;
	line-height: 0.88;
	letter-spacing: -0.01em;
	color: var(--text);
	margin: 0 0 0.75rem;
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
}

.tagline {
	font-size: clamp(0.6875rem, 1.8vw, 0.9375rem);
	font-family: 'Arial Black', Arial, sans-serif;
	letter-spacing: 0.14em;
	color: color-mix(in srgb, var(--text) 55%, transparent);
	margin: 0;
}

/* Date + time + location block: inverted panel */
.date-block {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.4rem;
	background: var(--text);
	color: var(--accent);
	padding: 0.75rem 1.5rem;
	flex-shrink: 0;
}

.date-block-left {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.date-block-location {
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
}

.date-loc-name {
	font-size: 1rem;
	letter-spacing: 0.06em;
}

.date-loc-addr {
	font-size: 0.6875rem;
	letter-spacing: 0.04em;
	opacity: 0.65;
	font-family: 'Arial Black', Arial, sans-serif;
}

.date-sep {
	opacity: 0.4;
}

.date-label {
	font-size: 0.6875rem;
	letter-spacing: 0.2em;
	font-family: 'Arial Black', Arial, sans-serif;
}

.date-value {
	font-size: 1.125rem;
	letter-spacing: 0.08em;
}

/* Info bar */
.info-bar {
	display: flex;
	flex-wrap: wrap;
	border-top: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
	flex-shrink: 0;
}

.info-cell {
	display: flex;
	flex-direction: column;
	padding: 0.625rem 1.25rem;
	border-right: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
	flex: 1;
	min-width: 90px;
}

.info-cell:last-child { border-right: none; }

.ic-label {
	font-size: 0.6875rem;
	letter-spacing: 0.18em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 75%, transparent);
	margin-bottom: 0.2rem;
}

.ic-value {
	font-size: 0.9375rem;
	letter-spacing: 0.04em;
	color: var(--text);
}

.ic-organiser-phrase {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	font-family: 'Courier New', monospace;
	font-size: 0.5625rem;
	letter-spacing: 0.06em;
	color: color-mix(in srgb, var(--text) 55%, transparent);
	margin-top: 0.2rem;
}

.event-phrase {
	font-family: 'Courier New', monospace;
	font-size: 0.5625rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: color-mix(in srgb, var(--text) 55%, transparent);
	padding: 0.5rem 1.5rem;
	border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
	text-align: center;
}

/* Lineup bar */
.lineup-bar {
	background: color-mix(in srgb, var(--text) 10%, transparent);
	padding: 0.625rem 1.5rem;
	display: flex;
	align-items: baseline;
	gap: 1rem;
	flex-wrap: wrap;
	flex-shrink: 0;
}

.lineup-label {
	font-size: 0.6875rem;
	letter-spacing: 0.18em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 75%, transparent);
	white-space: nowrap;
}

.lineup-acts { font-size: 0.9375rem; letter-spacing: 0.04em; }
.act { color: var(--text); }
.act-sep { color: color-mix(in srgb, var(--text) 35%, transparent); }
.act-role { font-size: 0.75rem; opacity: 0.65; }

/* Body / schedule */
.body-section {
	padding: 1rem 1.5rem;
	border-top: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
}

.body-label {
	font-size: 0.6875rem;
	letter-spacing: 0.18em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 75%, transparent);
	margin-bottom: 0.5rem;
}

.body-text {
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.8125rem;
	font-weight: 400;
	line-height: 1.6;
	color: color-mix(in srgb, var(--text) 82%, transparent);
	margin: 0;
	white-space: pre-wrap;
}

.agenda-text {
	font-family: 'Courier New', monospace;
	font-size: 0.8125rem;
	line-height: 1.6;
	color: color-mix(in srgb, var(--text) 75%, transparent);
	margin: 0;
	white-space: pre-wrap;
}

/* Contacts — inline chips, Underground style */
.contacts-bar {
	padding: 0.75rem 1.5rem;
	border-top: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
	/* Copy indicator uses text-contrast green rather than accent (which is the background) */
	--copy-color: #22c55e;
}

.contacts-heading {
	display: block;
	font-size: 0.6875rem;
	letter-spacing: 0.18em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 75%, transparent);
	margin-bottom: 0.5rem;
}

.contacts-inline {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem 1.5rem;
}

.contact-chip {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
}

.contact-platform {
	font-size: 0.5625rem;
	letter-spacing: 0.22em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 60%, transparent);
	white-space: nowrap;
}

.contact-handle {
	font-size: 0.875rem;
	color: var(--text);
	font-family: 'Courier New', monospace;
}

/* Gallery */
.gallery-bar {
	display: flex;
	border-top: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
}

.lb-trigger {
	flex: 1;
	min-width: 0;
	display: block;
	padding: 0;
	background: none;
	border: none;
	cursor: pointer;
	overflow: hidden;
}
.lb-trigger:hover .gallery-img { opacity: 1; }

.gallery-img {
	width: 100%;
	height: 110px;
	object-fit: cover;
	display: block;
	opacity: 0.7;
	transition: opacity 0.15s;
}

/* Tickets row: on the accent field, directly under the date box */
.tickets-row {
	display: flex;
	align-items: baseline;
	gap: 1rem;
	padding: 0.625rem 1.5rem;
	border-top: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
	flex-shrink: 0;
}

.tickets-label {
	font-size: 0.6875rem;
	letter-spacing: 0.18em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 75%, transparent);
	white-space: nowrap;
}

.tickets-value {
	font-size: 1rem;
	font-family: 'Courier New', monospace;
	color: var(--text);
	text-decoration: none;
	word-break: break-all;
}

/* ════════════════════════════════════════════════════════
   PRINT POSTER — off-screen for measurement, A4 dimensions
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
	background: var(--accent);
	color: var(--text);
	font-family: Impact, 'Arial Black', Arial, sans-serif;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
	box-sizing: border-box;
}

.p-inner {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	position: relative;
	box-sizing: border-box;
}

/* Racing stripes */
.p-stripes {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
}

.p-stripe {
	position: absolute;
	top: -50%;
	height: 200%;
	transform: rotate(-14deg);
}

.p-s1 { right: 2%;  width: 28%; background: rgba(0, 0, 0, 0.1); }
.p-s2 { right: 33%; width: 7%;  background: rgba(0, 0, 0, 0.07); }
.p-s3 { right: 43%; width: 3%;  background: rgba(0, 0, 0, 0.05); }

.p-stripes-light .p-s1 { background: rgba(0, 0, 0, 0.07); }
.p-stripes-light .p-s2 { background: rgba(0, 0, 0, 0.05); }
.p-stripes-light .p-s3 { background: rgba(0, 0, 0, 0.03); }

/* Main: title fills the space */
.p-main {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding: 10mm 12mm 8mm;
	position: relative;
	z-index: 1;
	overflow: hidden;
}

.p-name {
	font-size: 38mm;
	font-weight: 400;
	line-height: 0.87;
	letter-spacing: -0.01em;
	color: var(--text);
	margin: 0 0 4mm;
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
}

.p-tagline {
	font-size: 4mm;
	font-family: 'Arial Black', Arial, sans-serif;
	letter-spacing: 0.14em;
	color: color-mix(in srgb, var(--text) 55%, transparent);
	margin: 0;
}

/* Date + time + location block */
.p-date-block {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 1.5mm;
	background: var(--text);
	color: var(--accent);
	padding: 4mm 12mm;
	flex-shrink: 0;
	position: relative;
	z-index: 1;
}

.p-date-block-left {
	display: flex;
	align-items: center;
	gap: 4mm;
}

.p-date-block-location {
	display: flex;
	flex-direction: column;
	gap: 0.5mm;
}

.p-date-loc-name {
	font-size: 4.5mm;
	letter-spacing: 0.06em;
}

.p-date-loc-addr {
	font-size: 2.5mm;
	letter-spacing: 0.04em;
	opacity: 0.65;
	font-family: 'Arial Black', Arial, sans-serif;
}

.p-date-sep { opacity: 0.4; }

.p-date-label {
	font-size: 2.2mm;
	letter-spacing: 0.25em;
	font-family: 'Arial Black', Arial, sans-serif;
}

.p-date-value {
	font-size: 6mm;
	letter-spacing: 0.06em;
}

/* Info bar */
.p-info-bar {
	display: flex;
	border-top: 0.3mm solid color-mix(in srgb, var(--text) 18%, transparent);
	flex-shrink: 0;
	position: relative;
	z-index: 1;
}

.p-info-cell {
	display: flex;
	flex-direction: column;
	padding: 3mm 12mm;
	border-right: 0.3mm solid color-mix(in srgb, var(--text) 18%, transparent);
	flex: 1;
}

.p-info-cell:last-child { border-right: none; }

.p-ic-label {
	font-size: 1.8mm;
	letter-spacing: 0.22em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 50%, transparent);
	margin-bottom: 1mm;
}

.p-ic-value {
	font-size: 4mm;
	letter-spacing: 0.04em;
	color: var(--text);
}

/* Lineup */
.p-lineup-bar {
	background: color-mix(in srgb, var(--text) 10%, transparent);
	padding: 3mm 12mm;
	display: flex;
	align-items: baseline;
	gap: 4mm;
	flex-wrap: wrap;
	flex-shrink: 0;
	position: relative;
	z-index: 1;
}

.p-lineup-label {
	font-size: 1.8mm;
	letter-spacing: 0.22em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 45%, transparent);
	white-space: nowrap;
}

.p-lineup-acts { font-size: 4mm; letter-spacing: 0.04em; }
.p-act { color: var(--text); }
.p-act-sep { color: color-mix(in srgb, var(--text) 35%, transparent); }
.p-act-role { font-size: 3mm; opacity: 0.65; }

/* Footer — QR pinned to bottom-right */
.p-footer {
	display: flex;
	align-items: stretch;
	justify-content: space-between;
	background: rgba(0, 0, 0, 0.22);
	margin-top: auto;
	flex-shrink: 0;
	position: relative;
	z-index: 1;
}

.p-footer-light { background: rgba(0, 0, 0, 0.1); }

.p-foot-left {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 2mm;
	padding: 4mm 12mm;
}

.p-rsvp { display: flex; flex-direction: column; gap: 0.5mm; }

.p-rsvp-label {
	font-size: 1.8mm;
	letter-spacing: 0.22em;
	font-family: 'Arial Black', Arial, sans-serif;
	color: color-mix(in srgb, var(--text) 50%, transparent);
}

.p-rsvp-url {
	font-family: 'Courier New', monospace;
	font-size: 2.5mm;
	color: var(--text);
	word-break: break-all;
}

.p-qr-wrap {
	background: #fff;
	padding: 4mm;
	display: flex;
	align-items: center;
	flex-shrink: 0;
}

.p-qr-img {
	width: 42mm;
	height: 42mm;
	display: block;
}

.p-qr-invert { filter: invert(1); }

/* Site footer */
.site-footer {
	margin-top: auto;
	padding: 1rem 1.5rem;
	border-top: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.6875rem;
	letter-spacing: 0.12em;
	color: color-mix(in srgb, var(--text) 45%, transparent);
	flex-shrink: 0;
	text-align: center;
}

.footer-link {
	color: var(--text);
	text-decoration: none;
	font-weight: 900;
}

.footer-link:hover {
	text-decoration: underline;
}

@media print {
	.no-print { display: none !important; }
	@page { size: A4 portrait; margin: 0; }
	.poster {
		position: relative;
		top: auto;
		left: auto;
		visibility: visible;
		pointer-events: auto;
	}
}
</style>

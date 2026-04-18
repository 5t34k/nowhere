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
		dateDisplay, dateDisplayShort, timeDisplay,
		venueName, venueAddress, onlineUrl, body, admissionDisplay,
		rsvpUrl, lineup, agenda, capacity, ageRestriction, dressCode,
		secondaryImages, contacts, qrDataUrl,
		eventPhrase = '', organiserPhrase = '', signed = false
	}: Props = $props();

	import ImageLightbox from './ImageLightbox.svelte';
	import CopyHandle from './CopyHandle.svelte';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import { sanitizeUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { renderLinksOnly, stripLinks } from '$lib/renderer/utils/link-markdown.js';
	import { fitText } from './fitText.js';

	const bodyHtml = $derived(renderLinksOnly(body));
	const agendaHtml = $derived(renderLinksOnly(agenda));
	const bodyPlain = $derived(stripLinks(body));
	const agendaPlain = $derived(stripLinks(agenda));

	const accent = $derived(accentColor || '#dc2626');
	const isSvgImage = $derived(image?.startsWith('<'));
	const sanitizedSvg = $derived.by(() => isSvgImage ? sanitizeSvg(image) : '');

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	const lightboxImages = $derived([image, ...secondaryImages].filter(Boolean));

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
<div class="declaration" style="--accent: {accent}">

	<div class="name-bleed">
		<h1 class="event-name" use:fitText>{name.toUpperCase()}</h1>
	</div>

	<div class="accent-bar"></div>

	<div class="meta-bar">
		<div class="meta-left">
			{#if dateDisplay}<span class="meta-date">{dateDisplay.toUpperCase()}</span>{/if}
			{#if timeDisplay}<span class="meta-time">{timeDisplay}</span>{/if}
		</div>
		<div class="meta-right">
			{#if venueName}<span class="meta-venue">{venueName.toUpperCase()}</span>{/if}
			{#if venueAddress}<span class="meta-addr">{venueAddress}</span>{/if}
		</div>
	</div>

	<div class="content-pad">

		{#if description}
			<p class="description">{description}</p>
		{/if}

		{#if image}
			<div
				class="image-block"
				role="button"
				tabindex="0"
				onclick={() => openLightbox(0)}
				onkeydown={(e) => e.key === 'Enter' && openLightbox(0)}
				aria-label="View image"
			>
				{#if isSvgImage}
					<div class="image-main svg-inline" role="img" aria-label={name}>{@html sanitizedSvg}</div>
				{:else}
					<img src={image} alt={name} class="image-main" />
				{/if}
			</div>
		{/if}

		{#if body}
			<div class="divider-thin"></div>
			<p class="body-text">{@html bodyHtml}</p>
		{/if}

		{#if lineup.length > 0}
			<div class="divider-thin"></div>
			<div class="lineup-block">
				<span class="section-label">FEATURING</span>
				{#each lineup as act}
					<div class="act-row">
						<span class="act-name">{act.name}</span>
						{#if act.role}<span class="act-role">{act.role}</span>{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if agenda}
			<div class="divider-thin"></div>
			<div class="agenda-block">
				<span class="section-label">SCHEDULE</span>
				<pre class="agenda-text">{@html agendaHtml}</pre>
			</div>
		{/if}

		{#if admissionDisplay || capacity || ageRestriction || dressCode}
			<div class="divider-thin"></div>
			<div class="details-row">
				{#if admissionDisplay}
					<div class="detail-pair">
						<span class="dp-label">ADMISSION</span>
						<span class="dp-value">{admissionDisplay}</span>
					</div>
				{/if}
				{#if capacity}
					<div class="detail-pair">
						<span class="dp-label">CAPACITY</span>
						<span class="dp-value">{capacity}</span>
					</div>
				{/if}
				{#if ageRestriction}
					<div class="detail-pair">
						<span class="dp-label">AGE</span>
						<span class="dp-value">{ageRestriction}</span>
					</div>
				{/if}
				{#if dressCode}
					<div class="detail-pair">
						<span class="dp-label">DRESS</span>
						<span class="dp-value">{dressCode}</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if contacts.length > 0}
			<div class="divider-thin"></div>
			<div class="contacts-block">
				<span class="section-label">CONTACT</span>
				<div class="contacts-inline">
					{#each contacts as c}
						<div class="contact-chip">
							<span class="contact-platform">{c.name}</span>
							{#if c.handle}<span class="contact-handle"><CopyHandle text={c.handle} /></span>{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if secondaryImages.length > 0}
			<div class="divider-thin"></div>
			<div class="secondary-grid">
				{#each secondaryImages as src, i}
					<button class="lb-trigger" onclick={() => openLightbox(image ? i + 1 : i)} aria-label="View image {i + 1}">
						<img {src} alt="Event image {i + 1}" class="secondary-img" />
					</button>
				{/each}
			</div>
		{/if}

	</div><!-- /content-pad -->

	<div class="footer-bar">
		<div class="footer-left">
			{#if organiser}
				<p class="footer-organiser">An event by <strong>{organiser}</strong></p>
			{/if}
			{#if organiserPhrase}
				<p class="footer-organiser-phrase">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					{organiserPhrase}
				</p>
			{/if}
		</div>
		<div class="footer-right">
			{#if rsvpUrl}
				<div class="footer-link-block">
					<span class="footer-link-label">REGISTER / RSVP</span>
					{#if rsvpUrl.startsWith('http')}
						<a href={sanitizeUrl(rsvpUrl)} class="footer-link-url" target="_blank" rel="noopener noreferrer">{rsvpUrl}</a>
					{:else}
						<span class="footer-link-url">{rsvpUrl}</span>
					{/if}
				</div>
			{/if}
			{#if onlineUrl}
				<div class="footer-link-block">
					<span class="footer-link-label">STREAM</span>
					<a href={sanitizeUrl(onlineUrl)} class="footer-link-url" target="_blank" rel="noopener noreferrer">{onlineUrl}</a>
				</div>
			{/if}
		</div>
	</div>

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
<div class="poster" style="--accent: {accent}" bind:this={posterEl} aria-hidden="true">
	<div class="p-inner">

		<div class="p-title-zone">
			<h1 class="p-name" use:fitText>{name.toUpperCase()}</h1>
		</div>

		<div class="p-accent-bar"></div>

		<div class="p-meta">
			<div class="p-meta-left">
				{#if dateDisplay && timeDisplay}
					{dateDisplay.toUpperCase()}, {timeDisplay}
				{:else if dateDisplay}
					{dateDisplay.toUpperCase()}
				{:else if timeDisplay}
					{timeDisplay}
				{/if}
			</div>
			<div class="p-meta-right">
				{#if venueName}<span class="p-venue-name">{venueName.toUpperCase()}</span>{/if}
				{#if venueAddress}<span class="p-venue-addr">{venueAddress}</span>{/if}
			</div>
		</div>

		<div class="p-middle">
			<!-- Manifesto text: description + body, anchored top -->
			{#if showBody}
			<div class="p-middle-top p-body-section">
				{#if description}
					<p class="p-description">{description}</p>
				{/if}
				{#if body}
					<p class="p-body">{@html bodyPlain}</p>
				{/if}
			</div>
			{/if}

			<!-- Specifics: lineup + schedule, anchored bottom -->
			<div class="p-middle-bottom">
				{#if showLineup}
					<div class="p-lineup p-lineup-section">
						<span class="p-section-label">FEATURING</span>
						{#each lineup as act}
							<div class="p-act-row">
								<span class="p-act-name">{act.name}</span>
								{#if act.role}<span class="p-act-role">{act.role}</span>{/if}
							</div>
						{/each}
					</div>
				{/if}
				{#if showAgenda}
					<div class="p-agenda-block p-agenda-section">
						<span class="p-section-label">SCHEDULE</span>
						<pre class="p-agenda-text">{@html agendaPlain}</pre>
					</div>
				{/if}
			</div>
		</div>

		<div class="p-footer">
			<div class="p-foot-info">
				{#if organiser}
					<p class="p-organiser">An event by <em>{organiser}</em></p>
				{/if}
				{#if rsvpUrl}
					<div class="p-ticket-block">
						<span class="p-ticket-label">REGISTER / RSVP</span>
						<span class="p-ticket-url">{rsvpUrl}</span>
					</div>
				{/if}
				{#if onlineUrl}
					<div class="p-ticket-block">
						<span class="p-ticket-label">STREAM</span>
						<span class="p-ticket-url">{onlineUrl}</span>
					</div>
				{/if}
			</div>
			{#if qrDataUrl}
				<div class="p-qr-block">
					<span class="p-qr-label">SCAN</span>
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

.declaration {
	background: #faf9f7;
	color: #0a0a0a;
	min-height: 100vh;
	font-family: Georgia, 'Times New Roman', serif;
}

/* ── Name bleed: no horizontal padding, overflow clipped ── */
.name-bleed {
	padding: 2rem 0 1rem;
}

.event-name {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: clamp(5.5rem, 28vw, 22rem);
	font-weight: 700;
	line-height: 0.83;
	letter-spacing: -0.025em;
	color: #0a0a0a;
	margin: 0;
	padding: 0 1.5rem;
	text-transform: uppercase;
	word-break: normal;
	overflow-wrap: normal;
	hyphens: none;
}

/* ── Accent bar: ONE decisive use of accent ── */
.accent-bar {
	height: 5px;
	background: var(--accent);
	width: 100%;
	margin-top: 1.25rem;
}

/* ── Meta bar: date/time left, venue right ── */
.meta-bar {
	display: flex;
	justify-content: space-between;
	padding: 1rem 1.5rem;
	border-bottom: 2px solid #0a0a0a;
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.6875rem;
	letter-spacing: 0.15em;
	text-transform: uppercase;
	gap: 1rem;
}

.meta-left {
	display: flex;
	align-items: baseline;
	gap: 0.75rem;
}

.meta-date {
	color: #0a0a0a;
}

.meta-time {
	color: #0a0a0a;
}

.meta-right {
	display: flex;
	align-items: baseline;
	gap: 0.625rem;
	text-align: right;
}

.meta-venue {
	color: #0a0a0a;
}

.meta-addr {
	font-family: Georgia, 'Times New Roman', serif;
	font-style: italic;
	text-transform: none;
	letter-spacing: 0;
	color: #444;
	font-size: 0.6875rem;
}

/* ── All content below meta-bar has horizontal padding ── */
.content-pad {
	padding: 0 1.5rem;
}

/* ── Description: manifesto tagline ── */
.description {
	font-size: 1.375rem;
	font-style: italic;
	line-height: 1.55;
	color: #1a1a1a;
	margin: 2.5rem 0 0;
	max-width: 60ch;
}

/* ── Image: stark, evidential ── */
.image-block {
	margin-top: 2rem;
	cursor: pointer;
	overflow: hidden;
}

.image-main {
	max-width: 100%;
	max-height: 500px;
	display: block;
	margin: 0 auto;
	transition: opacity 0.15s;
}

.svg-inline {
	overflow: hidden;
}

.svg-inline :global(svg) {
	width: 100%;
	height: 100%;
	display: block;
}
.image-block:hover .image-main { opacity: 0.9; }

/* ── Thin divider ── */
.divider-thin {
	width: 100%;
	height: 1px;
	background: rgba(0, 0, 0, 0.15);
	margin: 2rem 0;
}

/* ── Body text ── */
.body-text {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 1rem;
	line-height: 1.8;
	color: #222;
	margin: 0;
	white-space: pre-wrap;
}

.body-text :global(a),
.agenda-text :global(a) {
	color: var(--accent);
	font-weight: 700;
	text-decoration: underline;
	text-decoration-thickness: 2px;
	text-underline-offset: 2px;
}

.body-text :global(a:hover),
.agenda-text :global(a:hover) {
	background: color-mix(in srgb, var(--accent) 15%, transparent);
}

/* ── Section label: NOT accent ── */
.section-label {
	display: block;
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.5625rem;
	letter-spacing: 0.22em;
	color: #0a0a0a;
	margin-bottom: 0.875rem;
}

/* ── Lineup ── */
.lineup-block {
	display: flex;
	flex-direction: column;
}

.act-row {
	display: flex;
	align-items: baseline;
	gap: 0.875rem;
	margin-bottom: 0.625rem;
}

.act-name {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 1.375rem;
	font-weight: 700;
	color: #0a0a0a;
	line-height: 1.2;
}

.act-role {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 0.9rem;
	font-style: italic;
	color: #555;
}

/* ── Agenda ── */
.agenda-block {
	display: flex;
	flex-direction: column;
}

.agenda-text {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.875rem;
	line-height: 1.65;
	color: #333;
	margin: 0;
	white-space: pre-wrap;
}

/* ── Details row ── */
.details-row {
	display: flex;
	flex-wrap: wrap;
	gap: 2rem;
}

.detail-pair {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.dp-label {
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.5625rem;
	letter-spacing: 0.2em;
	color: #888;
}

.dp-value {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 0.9375rem;
	font-weight: 700;
	color: #0a0a0a;
}

/* ── Contacts ── */
.contacts-block {
	display: flex;
	flex-direction: column;
}

.contacts-inline {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem 1.75rem;
}

.contact-chip {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
}

.contact-platform {
	font-family: 'Arial Black', Arial, sans-serif;
	font-variant: small-caps;
	font-size: 0.5625rem;
	letter-spacing: 0.15em;
	color: #0a0a0a;
}

.contact-handle {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.8125rem;
	color: #333;
}

/* ── Secondary images ── */
.secondary-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.25rem;
}

.lb-trigger {
	display: block;
	padding: 0;
	background: none;
	border: none;
	cursor: pointer;
	overflow: hidden;
}
.lb-trigger:hover .secondary-img { opacity: 0.88; }

.secondary-img {
	width: 100%;
	aspect-ratio: 4 / 3;
	object-fit: cover;
	display: block;
	transition: opacity 0.15s;
}

/* ── Footer bar ── */
.footer-bar {
	border-top: 3px solid #0a0a0a;
	margin-top: 3rem;
	padding: 1.25rem 1.5rem;
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 2rem;
}

.footer-left {
	flex: 1;
}

.footer-organiser {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 0.875rem;
	font-style: italic;
	color: #444;
	margin: 0;
}

.footer-organiser strong {
	font-style: normal;
	font-weight: 700;
	color: #0a0a0a;
}

.footer-organiser-phrase {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 0.75rem;
	font-style: italic;
	color: var(--accent);
	margin: 0.375rem 0 0;
}

.event-phrase {
	text-align: center;
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 0.75rem;
	font-style: italic;
	color: rgba(0, 0, 0, 0.25);
	letter-spacing: 0.04em;
	padding: 1.25rem 1.5rem;
}

.footer-right {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	align-items: flex-end;
}

.footer-link-block {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	align-items: flex-end;
}

.footer-link-label {
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.5rem;
	letter-spacing: 0.22em;
	color: #0a0a0a;
	text-transform: uppercase;
}

.footer-link-url {
	font-family: 'Courier New', Courier, monospace;
	font-size: 0.6875rem;
	color: var(--accent);
	text-decoration: none;
	word-break: break-all;
}

.footer-link-url:hover {
	text-decoration: underline;
}

/* ════════════════════════════════════════════════════════
   POSTER — always rendered off-screen for measurement
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
	background: #faf9f7;
	color: #0a0a0a;
	font-family: Georgia, 'Times New Roman', serif;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
	box-sizing: border-box;
}

.p-inner {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
}

/* Title zone */
.p-title-zone {
	padding: 12mm 12mm 5mm;
	overflow: hidden;
	flex-shrink: 0;
}

.p-name {
	font-size: 30mm;
	font-weight: 700;
	line-height: 0.83;
	letter-spacing: -0.025em;
	color: #0a0a0a;
	margin: 0;
	text-transform: uppercase;
	word-break: normal;
}

/* ONE accent use */
.p-accent-bar {
	height: 3mm;
	background: var(--accent);
	flex-shrink: 0;
}

/* Meta bar */
.p-meta {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	padding: 3mm 12mm;
	border-bottom: 0.5mm solid #0a0a0a;
	flex-shrink: 0;
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 2.8mm;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	gap: 4mm;
}

.p-meta-left {
	color: #0a0a0a;
}

.p-meta-right {
	display: flex;
	align-items: baseline;
	gap: 2mm;
	text-align: right;
}

.p-venue-name {
	color: #0a0a0a;
}

.p-venue-addr {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 2.6mm;
	font-style: italic;
	text-transform: none;
	letter-spacing: 0;
	color: #555;
}

/* Middle: flex column, top content + bottom specifics */
.p-middle {
	flex: 1;
	overflow: hidden;
	padding: 5mm 12mm 4mm;
	display: flex;
	flex-direction: column;
}

.p-middle-top {
	flex-shrink: 0;
}

/* Lineup + agenda anchored to bottom of middle zone */
.p-middle-bottom {
	margin-top: auto;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	gap: 3mm;
}

.p-section-label {
	display: block;
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 1.8mm;
	letter-spacing: 0.22em;
	color: #888;
	margin-bottom: 1.5mm;
	text-transform: uppercase;
}

/* Description: manifesto-scale italic statement */
.p-description {
	font-size: 8mm;
	font-style: italic;
	line-height: 1.35;
	color: #1a1a1a;
	margin: 0 0 4mm;
}

.p-body {
	font-size: 3.8mm;
	line-height: 1.6;
	color: #333;
	white-space: pre-wrap;
	margin: 0;
}

.p-lineup {
	display: flex;
	flex-direction: column;
	gap: 1mm;
}

.p-act-row {
	display: flex;
	align-items: baseline;
	gap: 2mm;
}

.p-act-name {
	font-size: 5mm;
	font-weight: 700;
	line-height: 1.3;
	color: #0a0a0a;
}

.p-act-role {
	font-size: 3mm;
	font-style: italic;
	color: #555;
}

.p-agenda-block {
	display: flex;
	flex-direction: column;
}

.p-agenda-text {
	font-family: 'Courier New', Courier, monospace;
	font-size: 3.2mm;
	line-height: 1.55;
	color: #333;
	margin: 0;
	white-space: pre-wrap;
}

/* Footer: info left, QR right */
.p-footer {
	display: flex;
	align-items: stretch;
	flex-shrink: 0;
	border-top: 0.5mm solid #0a0a0a;
	margin-top: auto;
}

.p-foot-info {
	flex: 1;
	padding: 4mm 12mm;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 2mm;
}

.p-organiser {
	font-size: 2.8mm;
	font-style: italic;
	color: #444;
	margin: 0;
}

.p-ticket-block {
	display: flex;
	flex-direction: column;
	gap: 0.5mm;
}

.p-ticket-label {
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 1.8mm;
	letter-spacing: 0.2em;
	color: #555;
	text-transform: uppercase;
}

.p-ticket-url {
	font-family: 'Courier New', Courier, monospace;
	font-size: 2.5mm;
	color: #0a0a0a;
	word-break: break-all;
}

/* QR block */
.p-qr-block {
	flex-shrink: 0;
	padding: 4mm;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2mm;
	background: #fff;
	border-left: 0.5mm solid #0a0a0a;
}

.p-qr-label {
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 1.8mm;
	letter-spacing: 0.2em;
	color: #999;
	text-transform: uppercase;
}

.p-qr {
	width: 58mm;
	height: 58mm;
	display: block;
	image-rendering: pixelated;
}

/* Site footer */
.site-footer {
	padding: 1.25rem 2rem;
	border-top: 1px solid #ddd;
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 0.8125rem;
	color: #aaa;
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

/* ════════════════════════════════════════════════════════
   PRINT — show poster, hide screen layout
════════════════════════════════════════════════════════ */
@media print {
	.no-print { display: none !important; }
	@page { size: A4 portrait; margin: 0; }
	.declaration { display: none !important; }
	.poster {
		position: relative;
		top: auto;
		left: auto;
		visibility: visible;
		pointer-events: auto;
	}
}
</style>

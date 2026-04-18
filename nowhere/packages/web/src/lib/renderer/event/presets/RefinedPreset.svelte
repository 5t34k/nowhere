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
		dateDisplayMedium, timeDisplay,
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

	const accent = $derived(accentColor || '#1B4F72');
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
<div class="refined" style="--accent: {accent}">
	<div class="container">

		<header class="header">
			<h1 class="event-name" use:fitText>{name}</h1>
			{#if description}
				<p class="tagline">{description}</p>
			{/if}
			<div class="accent-rule"></div>
		</header>

		<div class="meta-row">
			<div class="meta-left">
				{#if dateDisplayMedium}
					<span class="meta-date">{dateDisplayMedium}</span>
				{/if}
				{#if timeDisplay}
					<span class="meta-time">{timeDisplay}</span>
				{/if}
			</div>
			<div class="meta-right">
				{#if venueName}
					<span class="meta-venue">{venueName}</span>
				{/if}
				{#if venueAddress}
					<span class="meta-addr">{venueAddress}</span>
				{/if}
				{#if onlineUrl}
					<a href={sanitizeUrl(onlineUrl)} class="meta-online" target="_blank" rel="noopener noreferrer">Online Event</a>
				{/if}
			</div>
		</div>

		{#if organiser}
			<p class="organiser-line">Presented by {organiser}</p>
		{/if}
		{#if organiserPhrase}
			<div class="organiser-phrase">
				<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				{organiserPhrase}
			</div>
		{/if}

		{#if allImages.length === 1}
			<div
				class="image-single"
				role="button"
				tabindex="0"
				onclick={() => openLightbox(0)}
				onkeydown={(e) => e.key === 'Enter' && openLightbox(0)}
				aria-label="View image"
			>
				{#if allImages[0].startsWith('<')}
					<div class="svg-inline" role="img" aria-label={name}>{@html sanitizeSvg(allImages[0])}</div>
				{:else}
					<img src={allImages[0]} alt={name} />
				{/if}
			</div>
		{:else if allImages.length > 1}
			<div class="image-grid">
				{#each allImages as src, i}
					<div
						class="image-cell"
						class:image-cell-wide={i === 0 && allImages.length % 2 !== 0}
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
			<div class="body-section">
				<p class="body-text">{@html bodyHtml}</p>
			</div>
		{/if}

		{#if lineup.length > 0}
			<section class="section">
				<h2 class="section-label">Lineup</h2>
				<ul class="lineup">
					{#each lineup as act}
						<li class="lineup-item">
							<span class="act-name">{act.name}</span>
							{#if act.role}<span class="act-role">{act.role}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if agenda}
			<section class="section">
				<h2 class="section-label">Schedule</h2>
				<pre class="agenda-text">{@html agendaHtml}</pre>
			</section>
		{/if}

		{#if admissionDisplay || capacity || ageRestriction || dressCode}
			<section class="section">
				<h2 class="section-label">Details</h2>
				<dl class="details">
					{#if admissionDisplay}
						<div class="detail-pair">
							<dt>Admission</dt>
							<dd>{admissionDisplay}</dd>
						</div>
					{/if}
					{#if capacity}
						<div class="detail-pair">
							<dt>Capacity</dt>
							<dd>{capacity}</dd>
						</div>
					{/if}
					{#if ageRestriction}
						<div class="detail-pair">
							<dt>Age</dt>
							<dd>{ageRestriction}</dd>
						</div>
					{/if}
					{#if dressCode}
						<div class="detail-pair">
							<dt>Dress code</dt>
							<dd>{dressCode}</dd>
						</div>
					{/if}
				</dl>
			</section>
		{/if}

		{#if contacts.length > 0}
			<section class="section">
				<h2 class="section-label">Contact</h2>
				<div class="contacts">
					{#each contacts as c}
						<div class="contact-row">
							<span class="contact-platform">{c.name}</span>
							{#if c.handle}<span class="contact-handle"><CopyHandle text={c.handle} /></span>{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if rsvpUrl || onlineUrl}
			<div class="rsvp-block">
				{#if rsvpUrl && !rsvpUrl.startsWith('http')}
					<span class="rsvp-plain">{rsvpUrl}</span>
				{:else}
					<a href={sanitizeUrl(rsvpUrl || onlineUrl)} class="rsvp-link" target="_blank" rel="noopener noreferrer">
						{rsvpUrl ? 'RSVP / Tickets' : 'View Online Event'} →
					</a>
				{/if}
			</div>
		{/if}

		{#if eventPhrase}
			<div class="event-phrase">{eventPhrase}</div>
		{/if}

		{#if organiser}
			<footer class="event-footer">
				<span class="footer-organiser">{organiser}</span>
			</footer>
		{/if}

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

		<header class="p-header">
			<h1 class="p-name" use:fitText>{name}</h1>
			<div class="p-rule"></div>
			{#if description}
				<p class="p-tagline">{description}</p>
			{/if}
		</header>

		<div class="p-meta">
			<div class="p-meta-left">
				{#if dateDisplayMedium}<span class="p-date">{dateDisplayMedium}</span>{/if}
				{#if timeDisplay}<span class="p-time">{timeDisplay}</span>{/if}
			</div>
			<div class="p-meta-right">
				{#if venueName}<span class="p-venue">{venueName}</span>{/if}
				{#if venueAddress}<span class="p-addr">{venueAddress}</span>{/if}
			</div>
		</div>


		<div class="p-middle">
			{#if showBody}
				<p class="p-body p-body-section">{@html bodyPlain}</p>
			{/if}
			{#if showLineup}
				<div class="p-section p-lineup-section">
					<span class="p-label">Lineup</span>
					{#each lineup as act}
						<div class="p-act">
							<span class="p-act-name">{act.name}</span>
							{#if act.role}<span class="p-act-role">{act.role}</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if showAgenda}
				<div class="p-section p-agenda-section">
					<span class="p-label">Schedule</span>
					<pre class="p-agenda">{@html agendaPlain}</pre>
				</div>
			{/if}
		</div>

		<footer class="p-footer">
			<div class="p-foot-left">
				{#if organiser}
					<span class="p-organiser">{organiser}</span>
				{/if}
				{#if rsvpUrl}
					<div class="p-rsvp">
						<span class="p-label">RSVP / Tickets</span>
						{#if rsvpUrl.startsWith('http')}
							<span class="p-rsvp-url">{rsvpUrl}</span>
						{:else}
							<span class="p-rsvp-text">{rsvpUrl}</span>
						{/if}
					</div>
				{/if}
				{#if onlineUrl}
					<div class="p-rsvp">
						<span class="p-label">Online</span>
						<span class="p-rsvp-url">{onlineUrl}</span>
					</div>
				{/if}
			</div>
			{#if qrDataUrl}
				<div class="p-qr">
					<img src={qrDataUrl} alt="QR code" class="p-qr-img" />
				</div>
			{/if}
		</footer>

	</div>
</div>

<style>
/* ════════════════════════════════════════════════════════
   SCREEN LAYOUT
════════════════════════════════════════════════════════ */

.refined {
	background: #fff;
	color: #0a0a0a;
	min-height: 100vh;
	font-family: Georgia, 'Palatino Linotype', serif;
}

.container {
	max-width: 680px;
	margin: 0 auto;
	padding: 7rem 2rem 8rem;
}

/* Header — title commands silence around it */
.header {
	margin-bottom: 3.5rem;
}

.event-name {
	font-size: clamp(3rem, 9vw, 6rem);
	font-weight: 400;
	font-style: normal;
	line-height: 1.0;
	letter-spacing: 0.015em;
	color: #0a0a0a;
	margin: 0 0 0.625rem;
}

.tagline {
	font-size: 1.0625rem;
	font-style: italic;
	color: #777;
	margin: 0 0 2rem;
	line-height: 1.6;
	max-width: 52ch;
}

/* ONE decisive accent use */
.accent-rule {
	width: 3rem;
	height: 1px;
	background: var(--accent);
	margin-bottom: 2rem;
}

/* Meta — date left, venue right, small sans-serif */
.meta-row {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 2rem;
	margin-bottom: 1.25rem;
	padding-bottom: 1.25rem;
	border-bottom: 1px solid #f0f0f0;
}

.meta-left,
.meta-right {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.meta-right {
	text-align: right;
}

.meta-date {
	font-size: 0.875rem;
	font-weight: 500;
	color: #0a0a0a;
	letter-spacing: 0.01em;
}

.meta-time {
	font-size: 0.8125rem;
	color: #888;
}

.meta-venue {
	font-size: 0.875rem;
	font-weight: 500;
	color: #0a0a0a;
}

.meta-addr {
	font-size: 0.8125rem;
	color: #aaa;
}

.meta-online {
	font-size: 0.8125rem;
	color: var(--accent);
	text-decoration: none;
}

.organiser-line {
	font-size: 0.8125rem;
	color: #bbb;
	font-style: italic;
	margin: 0 0 3.5rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.organiser-line + .organiser-phrase {
	margin-top: -3.125rem;
}

.organiser-phrase {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.6875rem;
	font-style: italic;
	color: var(--accent);
	margin: 0 0 3.5rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

/* Image — clean, unadorned, given room */
.image-single {
	margin: 3.5rem 0;
	cursor: pointer;
	overflow: hidden;
}

.image-single img, .image-single .svg-inline {
	width: 100%;
	max-height: 480px;
	object-fit: cover;
	display: block;
	transition: opacity 0.15s;
	overflow: hidden;
}
.image-single:hover img { opacity: 0.9; }

.image-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.75rem;
	margin: 3.5rem 0;
}

.image-cell {
	cursor: pointer;
	overflow: hidden;
}

.image-cell img, .image-cell .svg-inline {
	width: 100%;
	aspect-ratio: 3 / 2;
	object-fit: cover;
	display: block;
	transition: opacity 0.15s;
	overflow: hidden;
}

.svg-inline :global(svg) {
	width: 100%;
	height: 100%;
	display: block;
}
.image-cell:hover img { opacity: 0.9; }

.image-cell-wide {
	grid-column: 1 / -1;
}

.image-cell-wide img {
	aspect-ratio: 16 / 7;
}

/* Body */
.body-section {
	margin: 3.5rem 0;
}

.body-text {
	font-size: 1rem;
	line-height: 1.9;
	color: #333;
	margin: 0;
	white-space: pre-wrap;
}

.body-text :global(a),
.agenda-text :global(a) {
	color: var(--accent);
	text-decoration: none;
	border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	transition: border-color 0.2s ease;
}

.body-text :global(a:hover),
.agenda-text :global(a:hover) {
	border-bottom-color: var(--accent);
}

/* Sections — labeled with tiny tracked caps */
.section {
	margin: 3rem 0;
	padding-top: 2rem;
	border-top: 1px solid #f0f0f0;
}

.section-label {
	font-size: 0.625rem;
	font-weight: 400;
	font-style: normal;
	text-transform: uppercase;
	letter-spacing: 0.25em;
	color: #999;
	margin: 0 0 1.5rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

/* Lineup */
.lineup {
	list-style: none;
	padding: 0;
	margin: 0;
}

.lineup-item {
	display: flex;
	align-items: baseline;
	gap: 1.5rem;
	padding: 0.75rem 0;
	border-bottom: 1px solid #f5f5f5;
}

.lineup-item:last-child {
	border-bottom: none;
}

.act-name {
	font-size: 1.0625rem;
	color: #111;
	letter-spacing: 0.01em;
}

.act-role {
	font-size: 0.8125rem;
	color: #bbb;
	font-style: italic;
}

/* Agenda */
.agenda-text {
	font-family: 'Courier New', monospace;
	font-size: 0.875rem;
	line-height: 1.75;
	color: #555;
	margin: 0;
	white-space: pre-wrap;
}

/* Details */
.details {
	margin: 0;
	padding: 0;
}

.detail-pair {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	padding: 0.625rem 0;
	border-bottom: 1px solid #f5f5f5;
}

.detail-pair:last-child {
	border-bottom: none;
}

.detail-pair dt {
	font-size: 0.875rem;
	color: #bbb;
	font-style: italic;
}

.detail-pair dd {
	font-size: 0.875rem;
	color: #222;
	font-weight: 500;
	margin: 0;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

/* Contacts */
.contacts {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.contact-row {
	display: flex;
	align-items: baseline;
	gap: 1rem;
}

.contact-platform {
	font-size: 0.625rem;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	color: #999;
	font-family: system-ui, -apple-system, Arial, sans-serif;
	white-space: nowrap;
}

.contact-handle {
	font-size: 0.875rem;
	color: #444;
}

/* RSVP */
.rsvp-block {
	margin: 3rem 0;
}

.rsvp-link {
	font-family: system-ui, -apple-system, Arial, sans-serif;
	font-size: 0.75rem;
	font-weight: 500;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--accent);
	text-decoration: none;
}

.rsvp-link:hover {
	text-decoration: underline;
}

.rsvp-plain {
	font-size: 0.875rem;
	color: #555;
	font-style: italic;
}

/* Footer */
.event-footer {
	margin-top: 5rem;
	padding-top: 2rem;
	border-top: 1px solid #f0f0f0;
	display: flex;
	justify-content: space-between;
	align-items: flex-end;
}

.footer-organiser {
	font-size: 0.75rem;
	color: #ccc;
	font-style: italic;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.event-phrase {
	font-size: 0.625rem;
	font-variant: small-caps;
	letter-spacing: 0.18em;
	color: #ddd;
	margin-top: 4rem;
	padding-top: 2rem;
	border-top: 1px solid #f0f0f0;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.qr-img {
	width: 52px;
	height: 52px;
	display: block;
	opacity: 0.45;
}

/* Site footer */
.site-footer {
	padding: 2rem 3rem;
	border-top: 1px solid #f0f0f0;
	font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
	font-size: 0.75rem;
	letter-spacing: 0.08em;
	color: #ccc;
	text-align: center;
}

.footer-link {
	color: var(--accent);
	text-decoration: none;
}

.footer-link:hover {
	text-decoration: underline;
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
	background: #fff;
	color: #0a0a0a;
	font-family: Georgia, 'Palatino Linotype', serif;
	box-sizing: border-box;
}

.p-inner {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	padding: 22mm 22mm 16mm;
	box-sizing: border-box;
}

/* Header */
.p-header {
	flex-shrink: 0;
	margin-bottom: 8mm;
}

.p-name {
	font-size: 26mm;
	font-weight: 300;
	font-style: normal;
	line-height: 0.95;
	letter-spacing: 0.015em;
	color: #0a0a0a;
	margin: 0 0 6mm;
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
}

/* ONE accent use */
.p-rule {
	width: 12mm;
	height: 0.4mm;
	background: var(--accent);
	margin-bottom: 4mm;
}

.p-tagline {
	font-size: 4.5mm;
	font-style: italic;
	color: #777;
	margin: 0;
	line-height: 1.45;
}

/* Meta — date left, venue right */
.p-meta {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	flex-shrink: 0;
	margin-bottom: 8mm;
	padding-bottom: 4mm;
	border-bottom: 0.2mm solid #e8e8e8;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.p-meta-left,
.p-meta-right {
	display: flex;
	flex-direction: column;
	gap: 1mm;
}

.p-meta-right {
	text-align: right;
}

.p-date {
	font-size: 3.2mm;
	font-weight: 500;
	color: #0a0a0a;
}

.p-time {
	font-size: 2.8mm;
	color: #999;
}

.p-venue {
	font-size: 3.2mm;
	font-weight: 500;
	color: #0a0a0a;
}

.p-addr {
	font-size: 2.8mm;
	color: #bbb;
}


/* Middle content */
.p-middle {
	flex: 1;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	gap: 4mm;
}

.p-body {
	font-size: 3.8mm;
	line-height: 1.65;
	color: #333;
	white-space: pre-wrap;
	margin: 0;
}

.p-section {
	display: flex;
	flex-direction: column;
	gap: 1.5mm;
}

.p-label {
	font-size: 2mm;
	font-weight: 400;
	text-transform: uppercase;
	letter-spacing: 0.25em;
	color: #ccc;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.p-act {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	padding: 1mm 0;
	border-bottom: 0.2mm solid #f0f0f0;
}

.p-act-name {
	font-size: 4mm;
	color: #111;
}

.p-act-role {
	font-size: 2.8mm;
	color: #bbb;
	font-style: italic;
}

.p-agenda {
	font-family: 'Courier New', monospace;
	font-size: 3mm;
	line-height: 1.6;
	color: #555;
	margin: 0;
	white-space: pre-wrap;
}

/* Footer */
.p-footer {
	flex-shrink: 0;
	display: flex;
	justify-content: space-between;
	align-items: flex-end;
	padding-top: 4mm;
	border-top: 0.2mm solid #e8e8e8;
	margin-top: auto;
}

.p-foot-left {
	display: flex;
	flex-direction: column;
	gap: 2mm;
}

.p-organiser {
	font-size: 2.5mm;
	color: #bbb;
	font-style: italic;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.p-rsvp {
	display: flex;
	flex-direction: column;
	gap: 0.5mm;
}

.p-rsvp-url {
	font-family: 'Courier New', monospace;
	font-size: 2.5mm;
	color: #555;
	word-break: break-all;
}

.p-rsvp-text {
	font-size: 2.5mm;
	color: #555;
	font-style: italic;
}

.p-qr {
	flex-shrink: 0;
}

.p-qr-img {
	width: 42mm;
	height: 42mm;
	display: block;
}

@media print {
	.no-print { display: none !important; }
	@page { size: A4 portrait; margin: 0; }
	.refined { display: none !important; }
	.poster {
		position: relative;
		top: auto;
		left: auto;
		visibility: visible;
		pointer-events: auto;
	}
}
</style>

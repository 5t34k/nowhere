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
		contacts, qrDataUrl,
		eventPhrase = '', organiserPhrase = '', signed = false
	}: Props = $props();

	import CopyHandle from './CopyHandle.svelte';
	import SvgImage from '$lib/renderer/components/SvgImage.svelte';
	import { svgToBackgroundUrl } from '$lib/renderer/utils/svg-sanitize.js';
	import { sanitizeUrl, sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { renderLinksOnly, stripLinks } from '$lib/renderer/utils/link-markdown.js';
	import { fitText } from './fitText.js';

	const bodyHtml = $derived(renderLinksOnly(body));
	const agendaHtml = $derived(renderLinksOnly(agenda));
	const bodyPlain = $derived(stripLinks(body));
	const agendaPlain = $derived(stripLinks(agenda));

	const accent = $derived(accentColor || '#00ff99');

	const isSvgImage = $derived(image?.startsWith('<'));
	const bgImageStyle = $derived.by(() => {
		if (!image) return '';
		if (isSvgImage) return `background-image: ${svgToBackgroundUrl(image)}`;
		const safe = sanitizeImageUrl(image);
		if (!safe) return '';
		return `background-image: url("${safe.replace(/["\\]/g, '')}")`;
	});

	const hasCells = $derived(
		!!(dateDisplayShort || timeDisplay24 || venueName || admissionDisplay || ageRestriction || dressCode || capacity)
	);

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
<div class="underground" style="--accent: {accent}">
	{#if image}
		<div class="bg-img" style={bgImageStyle}></div>
	{/if}
	<div class="bg-overlay"></div>
	<div class="bg-grid"></div>
	<div class="bg-vignette"></div>

	<!-- Hero: full viewport height, name anchored to bottom -->
	<div class="hero">
		<div class="hero-body">
			<h1 class="event-name" use:fitText>{name.toUpperCase()}</h1>
			{#if description}
				<p class="tagline">{description.toUpperCase()}</p>
			{/if}
		</div>
		<div class="neon-bar"></div>
	</div>

	<!-- Data strip: immediately below the fold -->
	{#if hasCells}
		<div class="data-strip">
			{#if dateDisplayShort}
				<div class="strip-cell">
					<span class="cell-label">DATE</span>
					<span class="cell-value">{dateDisplayShort}</span>
				</div>
			{/if}
			{#if timeDisplay24}
				<div class="strip-cell">
					<span class="cell-label">TIME</span>
					<span class="cell-value">{timeDisplay24}</span>
				</div>
			{/if}
			{#if venueName}
				<div class="strip-cell venue-cell">
					<span class="cell-label">VENUE</span>
					<span class="cell-value">{venueName.toUpperCase()}</span>
					{#if venueAddress}<span class="cell-sub">{venueAddress}</span>{/if}
				</div>
			{/if}
			{#if admissionDisplay}
				<div class="strip-cell">
					<span class="cell-label">ADMISSION</span>
					<span class="cell-value">{admissionDisplay.toUpperCase()}</span>
				</div>
			{/if}
			{#if ageRestriction}
				<div class="strip-cell">
					<span class="cell-label">AGE</span>
					<span class="cell-value">{ageRestriction}</span>
				</div>
			{/if}
			{#if dressCode}
				<div class="strip-cell">
					<span class="cell-label">DRESS</span>
					<span class="cell-value">{dressCode.toUpperCase()}</span>
				</div>
			{/if}
			{#if capacity}
				<div class="strip-cell">
					<span class="cell-label">CAPACITY</span>
					<span class="cell-value">{capacity}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Lineup -->
	{#if lineup.length > 0}
		<div class="content-section">
			<div class="section-hdr">LINEUP</div>
			{#each lineup as act, i}
				<div class="act-row" class:headliner={i === 0}>
					<span class="act-num">{String(i + 1).padStart(2, '0')}</span>
					<span class="act-name">{act.name.toUpperCase()}</span>
					{#if act.role}<span class="act-role">{act.role.toUpperCase()}</span>{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Info / body -->
	{#if body || agenda}
		<div class="content-section">
			{#if body}
				<div class="section-hdr">INFO</div>
				<p class="body-text">{@html bodyHtml}</p>
			{/if}
			{#if agenda}
				<div class="section-hdr">SCHEDULE</div>
				<pre class="body-text mono">{@html agendaHtml}</pre>
			{/if}
		</div>
	{/if}

	<!-- Contact details: inline, wrapping -->
	{#if contacts.length > 0}
		<div class="content-section">
			<div class="section-hdr">CONTACT</div>
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

	<!-- Footer: organiser + tickets + stream, all inline -->
	{#if organiser || rsvpUrl || onlineUrl}
		<div class="footer-row">
			{#if organiser}
				<span class="footer-presented">PRESENTED BY <span class="accent-text">{organiser.toUpperCase()}</span></span>
			{/if}
			{#if organiserPhrase}
				<span class="footer-organiser-phrase">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					{organiserPhrase}
				</span>
			{/if}
			{#if rsvpUrl}
				{#if rsvpUrl.startsWith('http')}
					<a href={sanitizeUrl(rsvpUrl)} class="footer-tickets" target="_blank" rel="noopener noreferrer">
						<span class="cell-label">TICKETS</span>
						<span class="footer-url">{rsvpUrl}</span>
					</a>
				{:else}
					<div class="footer-tickets">
						<span class="cell-label">TICKETS</span>
						<span class="footer-url">{rsvpUrl}</span>
					</div>
				{/if}
			{/if}
			{#if onlineUrl}
				<a href={sanitizeUrl(onlineUrl)} class="footer-tickets" target="_blank" rel="noopener noreferrer">
					<span class="cell-label">STREAM</span>
					<span class="footer-url">{onlineUrl}</span>
				</a>
			{/if}
		</div>
	{/if}

	{#if eventPhrase}
		<div class="event-phrase">{eventPhrase}</div>
	{/if}

	<footer class="site-footer">
		Hosted <a href="https://hostednowhere.com" class="footer-link" target="_blank" rel="noopener noreferrer">nowhere</a>. Present everywhere.
	</footer>
</div>

<!-- ─── PRINT POSTER ────────────────────────────────────────────── -->
<div class="poster" style="--accent: {accent}" bind:this={posterEl} aria-hidden="true">
	{#if image}
		<div class="p-bg" style={bgImageStyle}></div>
		<div class="p-bg-veil"></div>
	{/if}
	<div class="p-grid"></div>

	<div class="p-inner">
		<!-- Darkness + name anchored to bottom of this zone -->
		<div class="p-title-zone">
			<h1 class="p-name" use:fitText>{name.toUpperCase()}</h1>
			{#if description}
				<div class="p-tagline">{description.toUpperCase()}</div>
			{/if}
		</div>

		<div class="p-neon-line"></div>

		{#if hasCells}
			<div class="p-cells">
				{#if dateDisplayShort}
					<div class="p-cell">
						<span class="p-lbl">DATE</span>
						<span class="p-val">{dateDisplayShort}</span>
					</div>
				{/if}
				{#if timeDisplay24}
					<div class="p-cell">
						<span class="p-lbl">TIME</span>
						<span class="p-val">{timeDisplay24}</span>
					</div>
				{/if}
				{#if venueName}
					<div class="p-cell p-venue">
						<span class="p-lbl">VENUE</span>
						<span class="p-val">{venueName.toUpperCase()}</span>
						{#if venueAddress}<span class="p-sub">{venueAddress}</span>{/if}
					</div>
				{/if}
				{#if admissionDisplay}
					<div class="p-cell">
						<span class="p-lbl">ADMISSION</span>
						<span class="p-val">{admissionDisplay.toUpperCase()}</span>
					</div>
				{/if}
				{#if ageRestriction}
					<div class="p-cell">
						<span class="p-lbl">AGE</span>
						<span class="p-val">{ageRestriction}</span>
					</div>
				{/if}
				{#if dressCode}
					<div class="p-cell">
						<span class="p-lbl">DRESS</span>
						<span class="p-val">{dressCode.toUpperCase()}</span>
					</div>
				{/if}
				{#if capacity}
					<div class="p-cell">
						<span class="p-lbl">CAPACITY</span>
						<span class="p-val">{capacity}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Middle: lineup + body/agenda, overflow clipped to fit -->
		<div class="p-middle">
			{#if showLineup}
				<div class="p-lineup-block p-lineup-section">
					<div class="p-sec-hdr">LINEUP</div>
					{#each lineup as act, i}
						<div class="p-act" class:p-act-top={i === 0}>
							<span class="p-act-n">{String(i + 1).padStart(2, '0')}</span>
							<span class="p-act-name">{act.name.toUpperCase()}</span>
							{#if act.role}<span class="p-act-role">{act.role.toUpperCase()}</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if showBody}
				<div class="p-info-block p-body-section" class:p-info-bordered={showLineup}>
					<div class="p-sec-hdr">INFO</div>
					<p class="p-body-text">{@html bodyPlain}</p>
				</div>
			{/if}
			{#if showAgenda}
				<div class="p-info-block p-agenda-section" class:p-info-bordered={showLineup || showBody}>
					<div class="p-sec-hdr">SCHEDULE</div>
					<pre class="p-body-text p-mono">{@html agendaPlain}</pre>
				</div>
			{/if}
		</div>

		<!-- Footer: info left, QR right -->
		<div class="p-footer">
			<div class="p-footer-info">
				{#if organiser}
					<div class="p-presented">PRESENTED BY <span class="p-accent">{organiser.toUpperCase()}</span></div>
				{/if}
				{#if rsvpUrl}
					<div class="p-ticket-block">
						<span class="p-lbl">TICKETS</span>
						<span class="p-ticket-url">{rsvpUrl}</span>
					</div>
				{/if}
				{#if contacts.length > 0}
					<div class="p-contacts">
						{#each contacts as c}
							<span class="p-contact-entry"><span class="p-contact-platform">{c.name.toUpperCase()}</span> {c.handle}</span>
						{/each}
					</div>
				{/if}
			</div>
			{#if qrDataUrl}
				<div class="p-qr-block">
					<span class="p-lbl">SCAN TO ENTER</span>
					<img src={qrDataUrl} alt="QR" class="p-qr" />
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
/* ════════════════════════════════════════════════════════
   SCREEN LAYOUT
════════════════════════════════════════════════════════ */

.underground {
	position: relative;
	background: #000;
	color: #fff;
	min-height: 100vh;
	font-family: 'Arial Black', 'Arial Bold', Arial, sans-serif;
	overflow-x: hidden;
}

/* ── Background layers ── */
.bg-img {
	position: fixed;
	inset: 0;
	background-size: cover;
	background-position: center;
	z-index: 0;
}

.bg-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.91);
	z-index: 1;
}

.bg-grid {
	position: fixed;
	inset: 0;
	z-index: 2;
	background-image:
		linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
		linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
	background-size: 48px 48px;
	pointer-events: none;
}

.bg-vignette {
	position: fixed;
	inset: 0;
	z-index: 3;
	background: radial-gradient(ellipse at 50% 40%, transparent 20%, rgba(0, 0, 0, 0.7) 100%);
	pointer-events: none;
}

/* ── Hero ── */
.hero {
	position: relative;
	z-index: 10;
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
}

.hero-body {
	padding: 2rem 2rem 1.75rem;
}

.event-name {
	font-size: clamp(3.5rem, 18vw, 13rem);
	font-weight: 900;
	line-height: 0.85;
	letter-spacing: -0.04em;
	color: #fff;
	margin: 0 0 1rem;
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
}

.tagline {
	font-size: 0.6875rem;
	letter-spacing: 0.26em;
	color: var(--accent);
	font-weight: 700;
	margin: 0;
	text-shadow: 0 0 14px color-mix(in srgb, var(--accent) 55%, transparent);
}

.neon-bar {
	width: 100%;
	height: 3px;
	flex-shrink: 0;
	background: var(--accent);
	box-shadow:
		0 0 8px var(--accent),
		0 0 24px var(--accent),
		0 0 60px color-mix(in srgb, var(--accent) 45%, transparent);
}

/* ── Data strip ── */
.data-strip {
	position: relative;
	z-index: 10;
	display: flex;
	flex-wrap: wrap;
	border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.strip-cell {
	flex: 1 1 100px;
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	padding: 1rem 1.5rem;
	border-right: 1px solid rgba(255, 255, 255, 0.07);
	min-width: 0;
}

.strip-cell:last-child { border-right: none; }
.venue-cell { flex: 2 1 180px; }

.cell-label {
	font-size: 0.5rem;
	letter-spacing: 0.26em;
	color: var(--accent);
	font-weight: 700;
	text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
}

.cell-value {
	font-size: 0.875rem;
	font-weight: 700;
	color: #fff;
	line-height: 1.2;
}

.cell-sub {
	font-size: 0.625rem;
	color: rgba(255, 255, 255, 0.38);
	font-weight: 400;
	font-family: Arial, sans-serif;
}

/* ── Content sections ── */
.content-section {
	position: relative;
	z-index: 10;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	max-width: 42rem;
}

.section-hdr {
	font-size: 0.5rem;
	letter-spacing: 0.26em;
	color: var(--accent);
	font-weight: 700;
	padding: 0.75rem 1.5rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
}

/* ── Lineup ── */
.act-row {
	display: flex;
	align-items: baseline;
	gap: 1.25rem;
	padding: 0.875rem 1.5rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.act-row:last-child { border-bottom: none; }

.act-row:hover { background: rgba(255, 255, 255, 0.025); }

.act-row.headliner .act-name {
	font-size: 1.375rem;
}

.act-num {
	font-size: 0.4375rem;
	color: rgba(255, 255, 255, 0.18);
	letter-spacing: 0.12em;
	width: 1.75rem;
	flex-shrink: 0;
}

.act-name {
	font-size: 1rem;
	font-weight: 900;
	color: #fff;
	letter-spacing: 0.04em;
	flex: 1;
}

.act-role {
	font-size: 0.5rem;
	letter-spacing: 0.26em;
	color: var(--accent);
	font-weight: 700;
	white-space: nowrap;
	text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
}

/* ── Body / agenda ── */
.body-text {
	font-size: 0.8125rem;
	line-height: 1.75;
	color: rgba(255, 255, 255, 0.5);
	padding: 1rem 1.5rem;
	margin: 0;
	font-family: Arial, sans-serif;
	font-weight: 400;
	white-space: pre-wrap;
}

.mono { font-family: 'Courier New', monospace; }

.body-text :global(a) {
	color: var(--accent);
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 3px;
	word-break: break-word;
}

.body-text :global(a:hover) {
	text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 60%, transparent);
}

.cell-link {
	color: var(--accent);
	text-decoration: none;
	word-break: break-all;
	font-size: 0.75rem;
	font-weight: 400;
	font-family: 'Courier New', monospace;
}

/* ── Contacts ── */
.contacts-inline {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem 1.5rem;
	padding: 0.875rem 1.5rem;
}

.contact-chip {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
}

.contact-platform {
	font-size: 0.5rem;
	letter-spacing: 0.26em;
	color: var(--accent);
	font-weight: 700;
	text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
	white-space: nowrap;
}

.contact-handle {
	font-size: 0.8125rem;
	font-weight: 700;
	color: rgba(255, 255, 255, 0.75);
	font-family: 'Courier New', monospace;
}

/* ── Footer ── */
.footer-row {
	position: relative;
	z-index: 10;
	display: flex;
	align-items: center;
	gap: 2rem;
	padding: 1.25rem 1.5rem;
	flex-wrap: wrap;
}

.footer-presented {
	font-size: 0.5rem;
	letter-spacing: 0.26em;
	color: rgba(255, 255, 255, 0.22);
	font-weight: 700;
}

.accent-text { color: var(--accent); }

.footer-organiser-phrase {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-family: 'Courier New', monospace;
	font-size: 0.5rem;
	letter-spacing: 0.12em;
	color: var(--accent);
}

.event-phrase {
	position: relative;
	z-index: 10;
	font-family: 'Courier New', monospace;
	font-size: 0.5rem;
	letter-spacing: 0.16em;
	color: var(--accent);
	padding: 0.75rem 1.5rem;
	border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.footer-tickets {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	text-decoration: none;
}

.footer-url {
	font-size: 0.6875rem;
	font-family: 'Courier New', monospace;
	color: rgba(255, 255, 255, 0.4);
	word-break: break-all;
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
	background: #000;
	color: #fff;
	font-family: 'Arial Black', 'Arial Bold', Arial, sans-serif;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
	box-sizing: border-box;
}

.p-bg {
	position: absolute;
	inset: 0;
	background-size: cover;
	background-position: center;
	z-index: 0;
}

.p-bg-veil {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.88);
	z-index: 1;
}

.p-grid {
	position: absolute;
	inset: 0;
	z-index: 2;
	background-image:
		linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
		linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
	background-size: 12mm 12mm;
}

.p-inner {
	position: relative;
	z-index: 10;
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
}

/* Title zone: darkness fills above, name at bottom */
.p-title-zone {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	padding: 0 12mm 5mm;
}

.p-name {
	font-size: 20mm;
	font-weight: 900;
	line-height: 0.85;
	letter-spacing: -0.04em;
	color: #fff;
	margin: 0 0 2.5mm;
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
}

.p-tagline {
	font-size: 2.5mm;
	font-weight: 700;
	letter-spacing: 0.22em;
	color: var(--accent);
}

/* Neon separator line */
.p-neon-line {
	width: 100%;
	height: 0.5mm;
	background: var(--accent);
	flex-shrink: 0;
}

/* Data cells */
.p-cells {
	display: flex;
	flex-shrink: 0;
	border-bottom: 0.3mm solid rgba(255, 255, 255, 0.18);
}

.p-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.8mm;
	padding: 2.5mm 3mm;
	border-right: 0.3mm solid rgba(255, 255, 255, 0.18);
}

.p-cell:last-child { border-right: none; }
.p-venue { flex: 2; }

.p-lbl {
	font-size: 1.8mm;
	font-weight: 700;
	letter-spacing: 0.2em;
	color: var(--accent);
}

.p-val {
	font-size: 3.8mm;
	font-weight: 700;
	color: #fff;
	line-height: 1.1;
}

.p-sub {
	font-size: 2.5mm;
	color: rgba(255, 255, 255, 0.45);
	font-weight: 400;
}

/* Middle: lineup + body, overflow clips to fit */
.p-middle {
	flex: 1;
	border-bottom: 0.3mm solid rgba(255, 255, 255, 0.18);
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.p-sec-hdr {
	font-size: 1.8mm;
	font-weight: 700;
	letter-spacing: 0.2em;
	color: var(--accent);
	padding: 2mm 3mm;
	border-bottom: 0.3mm solid rgba(255, 255, 255, 0.18);
	flex-shrink: 0;
}

/* Lineup block */
.p-lineup-block {
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	overflow: hidden;
}

.p-act {
	display: flex;
	align-items: baseline;
	gap: 3mm;
	padding: 2mm 3mm;
	border-bottom: 0.3mm solid rgba(255, 255, 255, 0.06);
	flex-shrink: 0;
}

.p-act:last-child { border-bottom: none; }
.p-act-top .p-act-name { font-size: 5.5mm; }

.p-act-n {
	font-size: 1.8mm;
	color: rgba(255, 255, 255, 0.2);
	letter-spacing: 0.1em;
	width: 5mm;
	flex-shrink: 0;
}

.p-act-name {
	font-size: 4mm;
	font-weight: 900;
	color: #fff;
	letter-spacing: 0.04em;
	flex: 1;
}

.p-act-role {
	font-size: 1.8mm;
	font-weight: 700;
	letter-spacing: 0.18em;
	color: var(--accent);
}

/* Info / body block */
.p-info-block {
	flex: 1;
	overflow: hidden;
}

.p-info-bordered {
	border-top: 0.3mm solid rgba(255, 255, 255, 0.18);
}

.p-body-text {
	font-size: 2.8mm;
	line-height: 1.55;
	color: rgba(255, 255, 255, 0.65);
	margin: 0;
	padding: 2mm 3mm;
	font-family: Arial, sans-serif;
	font-weight: 400;
	white-space: pre-wrap;
}

.p-mono { font-family: 'Courier New', monospace; }

/* Footer: info left, QR right */
.p-footer {
	display: flex;
	align-items: stretch;
	flex-shrink: 0;
}

.p-footer-info {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 2.5mm;
	padding: 4mm;
	border-right: 0.3mm solid rgba(255, 255, 255, 0.18);
	border-top: 0.3mm solid rgba(255, 255, 255, 0.18);
}

.p-presented {
	font-size: 2mm;
	font-weight: 700;
	letter-spacing: 0.2em;
	color: rgba(255, 255, 255, 0.3);
}

.p-accent { color: var(--accent); }

.p-ticket-block {
	display: flex;
	flex-direction: column;
	gap: 0.5mm;
}

.p-ticket-url {
	font-size: 2.5mm;
	font-family: 'Courier New', monospace;
	color: var(--accent);
	word-break: break-all;
}

/* QR zone — large and prominent */
.p-qr-block {
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2mm;
	padding: 4mm;
	background: #000;
	border-top: 0.3mm solid rgba(255, 255, 255, 0.18);
}

.p-qr {
	width: 58mm;
	height: 58mm;
	display: block;
	image-rendering: pixelated;
	filter: invert(1);
}

/* Contacts in footer */
.p-contacts {
	display: flex;
	flex-wrap: wrap;
	gap: 1mm 3mm;
}

.p-contact-entry {
	display: flex;
	align-items: baseline;
	gap: 1mm;
	font-size: 2.2mm;
	color: rgba(255, 255, 255, 0.6);
	font-family: 'Courier New', monospace;
}

.p-contact-platform {
	color: var(--accent);
	font-weight: 700;
	letter-spacing: 0.1em;
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 1.8mm;
	white-space: nowrap;
}

/* Site footer */
.site-footer {
	position: relative;
	z-index: 10;
	padding: 1rem 1.5rem;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	font-family: 'Arial Black', Arial, sans-serif;
	font-size: 0.625rem;
	letter-spacing: 0.16em;
	color: rgba(255, 255, 255, 0.55);
}

.footer-link {
	color: var(--accent);
	text-decoration: none;
	letter-spacing: 0.16em;
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
	.underground { display: none !important; }
	.poster {
		position: relative;
		top: auto;
		left: auto;
		visibility: visible;
		pointer-events: auto;
	}
}
</style>

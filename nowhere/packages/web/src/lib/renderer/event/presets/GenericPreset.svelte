<script lang="ts">
	interface Props {
		name: string; description: string; image: string; organiser: string;
		accentColor: string; dateDisplay: string; dateDisplayMedium: string; dateDisplayShort: string;
		timeDisplay: string; timeDisplay24: string; venueName: string;
		venueAddress: string; onlineUrl: string; body: string; admissionDisplay: string;
		rsvpUrl: string; lineup: { name: string; role: string }[]; agenda: string; capacity: string;
		ageRestriction: string; dressCode: string; secondaryImages: string[];
		contacts: { name: string; handle: string }[];
		qrDataUrl: string;
		[key: string]: unknown;
	}

	let {
		name, description, image, organiser, accentColor,
		dateDisplay, dateDisplayMedium, dateDisplayShort, timeDisplay,
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

	const isSvgImage = $derived(image?.startsWith('<'));
	const sanitizedSvg = $derived.by(() => isSvgImage ? sanitizeSvg(image) : '');

	const accent = $derived(accentColor || '#2563eb');

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	const lightboxImages = $derived([image, ...secondaryImages].filter(Boolean));

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	// ── Poster overflow trimming ──────────────────────────
	// The poster is always rendered off-screen so we can measure it.
	// If it overflows 297mm, we drop the tallest optional section and retry.
	let posterEl: HTMLElement | undefined = $state();
	let showBody   = $state(true);
	let showLineup = $state(true);
	let showAgenda = $state(true);

	$effect(() => {
		// Re-run whenever content changes; reset all sections first.
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
			showBody   && body             ? { key: 'body'   as const, h: posterEl.querySelector<HTMLElement>('.p-body-section')?.offsetHeight   ?? 0 } : null,
			showLineup && lineup.length > 0 ? { key: 'lineup' as const, h: posterEl.querySelector<HTMLElement>('.p-lineup-section')?.offsetHeight ?? 0 } : null,
			showAgenda && agenda           ? { key: 'agenda' as const, h: posterEl.querySelector<HTMLElement>('.p-agenda-section')?.offsetHeight  ?? 0 } : null,
		].filter((c): c is { key: 'body' | 'lineup' | 'agenda'; h: number } => c !== null && c.h > 0);

		if (candidates.length === 0) return;

		const tallest = candidates.reduce((a, b) => a.h > b.h ? a : b);
		if      (tallest.key === 'body')   showBody   = false;
		else if (tallest.key === 'lineup') showLineup = false;
		else                               showAgenda = false;

		requestAnimationFrame(() => measureAndTrim());
	}
</script>

<!-- ── Screen ── -->
<div class="generic no-print" style="--accent: {accent}">

	<nav class="event-nav">
		<div class="nav-inner">
			<div class="nav-brand">
				<a href="https://hostednowhere.com" class="nav-brand-name" target="_blank" rel="noopener noreferrer">nowhere</a>
				<span class="nav-brand-type">Event</span>
			</div>
		</div>
	</nav>

	<div class="container">
		<div class="layout">

			<!-- Left top: title block -->
			<header class="main-header">
				<h1 class="name" use:fitText>{name}</h1>
				{#if description}<p class="tagline">{description}</p>{/if}
				{#if organiser}<p class="organiser">Organised by <strong>{organiser}</strong></p>{/if}
			{#if organiserPhrase}
				<div class="organiser-phrase">
					<svg class="signed-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					{organiserPhrase}
				</div>
			{/if}
			</header>

			<!-- Right: sidebar (image → info → RSVP) -->
			<aside class="sidebar">
				{#if image}
					<div
						class="hero"
						role="button"
						tabindex="0"
						onclick={() => openLightbox(0)}
						onkeydown={(e) => e.key === 'Enter' && openLightbox(0)}
						aria-label="View image"
					>
						{#if isSvgImage}
							<div class="svg-inline" role="img" aria-label={name}>{@html sanitizedSvg}</div>
						{:else}
							<img src={image} alt={name} />
						{/if}
					</div>
				{/if}

				{#if dateDisplay || venueName || venueAddress || admissionDisplay || onlineUrl}
					<div class="info-block">
						{#if dateDisplay || timeDisplay}
							<div class="info-row">
								<div class="info-icon-wrap">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
								</div>
								<div>
									<div class="info-label">Date &amp; Time</div>
									{#if dateDisplay}<div class="info-main">{dateDisplay}</div>{/if}
									{#if timeDisplay}<div class="info-sub">{timeDisplay}</div>{/if}
								</div>
							</div>
						{/if}

						{#if venueName || venueAddress}
							<div class="info-row">
								<div class="info-icon-wrap">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
								</div>
								<div>
									<div class="info-label">Location</div>
									{#if venueName}<div class="info-main">{venueName}</div>{/if}
									{#if venueAddress}<div class="info-sub">{venueAddress}</div>{/if}
								</div>
							</div>
						{/if}

						{#if admissionDisplay}
							<div class="info-row">
								<div class="info-icon-wrap">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>
								</div>
								<div>
									<div class="info-label">Admission</div>
									<div class="info-main">{admissionDisplay}</div>
								</div>
							</div>
						{/if}

						{#if onlineUrl}
							<div class="info-row">
								<div class="info-icon-wrap">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
								</div>
								<div>
									<div class="info-label">Online event</div>
									<a href={sanitizeUrl(onlineUrl)} class="info-main info-link" target="_blank" rel="noopener noreferrer">View stream link</a>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				{#if rsvpUrl}
					<div class="rsvp-zone">
						{#if rsvpUrl.startsWith('http')}
							<a href={sanitizeUrl(rsvpUrl)} class="rsvp-btn" target="_blank" rel="noopener noreferrer">
								Get Tickets / RSVP
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
							</a>
						{:else}
							<p class="rsvp-plain">{rsvpUrl}</p>
						{/if}
					</div>
				{/if}
			</aside>

			<!-- Left bottom: main body content -->
			<div class="main-content">
				{#if body}
					<section class="section">
						<h2 class="section-label">About this event</h2>
						<p class="body-text">{body}</p>
					</section>
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
						<pre class="agenda">{agenda}</pre>
					</section>
				{/if}

				{#if capacity || ageRestriction || dressCode}
					<section class="section">
						<h2 class="section-label">Details</h2>
						<div class="chips">
							{#if capacity}
								<div class="chip">
									<span class="chip-label">Capacity</span>
									<span class="chip-value">{capacity}</span>
								</div>
							{/if}
							{#if ageRestriction}
								<div class="chip">
									<span class="chip-label">Age</span>
									<span class="chip-value">{ageRestriction}</span>
								</div>
							{/if}
							{#if dressCode}
								<div class="chip">
									<span class="chip-label">Dress code</span>
									<span class="chip-value">{dressCode}</span>
								</div>
							{/if}
						</div>
					</section>
				{/if}

				{#if secondaryImages.length > 0}
					<section class="section">
						<h2 class="section-label">Gallery</h2>
						<div class="gallery">
							{#each secondaryImages as src, i}
								<button class="lb-trigger" onclick={() => openLightbox(image ? i + 1 : i)} aria-label="View image {i + 1}">
									<img {src} alt="Event photo {i + 1}" class="gallery-img" />
								</button>
							{/each}
						</div>
					</section>
				{/if}

				{#if contacts.length > 0}
					<section class="section">
						<h2 class="section-label">Contact</h2>
						<div class="contacts">
							{#each contacts as c}
								<div class="contact-row">
									<span class="contact-platform">{c.name}</span>
									<span class="contact-handle"><CopyHandle text={c.handle} /></span>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>

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

<!-- ── Print poster (always rendered off-screen for JS measurement) ── -->
<div class="poster" style="--accent: {accent}" bind:this={posterEl} aria-hidden="true">
	<div class="p-top">
		<h1 class="p-name" use:fitText>{name}</h1>
		{#if organiser}<p class="p-by">by {organiser}</p>{/if}
		<div class="p-rule"></div>
		{#if description}<p class="p-tagline">{description}</p>{/if}
	</div>

	{#if image}
		<div class="p-image-wrap">
			{#if isSvgImage}
				<div class="p-image svg-inline" role="img" aria-label={name}>{@html sanitizedSvg}</div>
			{:else}
				<img src={image} alt={name} class="p-image" />
			{/if}
		</div>
	{/if}

	<div class="p-info">
		{#if dateDisplay}
			<div class="p-info-row">
				<span class="p-info-label">When</span>
				<span class="p-info-val">{dateDisplayMedium || dateDisplay}{#if timeDisplay} · {timeDisplay}{/if}</span>
			</div>
		{/if}
		{#if venueName || venueAddress}
			<div class="p-info-row">
				<span class="p-info-label">Where</span>
				<span class="p-info-val">{[venueName, venueAddress].filter(Boolean).join(' · ')}</span>
			</div>
		{/if}
		{#if admissionDisplay}
			<div class="p-info-row">
				<span class="p-info-label">Entry</span>
				<span class="p-info-val">{admissionDisplay}</span>
			</div>
		{/if}
		{#if rsvpUrl}
			<div class="p-info-row">
				<span class="p-info-label">Tickets</span>
				<span class="p-info-val">{rsvpUrl}</span>
			</div>
		{/if}
	</div>

	{#if showBody || showLineup || showAgenda}
		<div class="p-sections">
			{#if showBody}
				<div class="p-section p-body-section">
					<h2 class="p-section-label">About</h2>
					<p class="p-body">{body}</p>
				</div>
			{/if}
			{#if showLineup}
				<div class="p-section p-lineup-section">
					<h2 class="p-section-label">Lineup</h2>
					<div class="p-lineup">
						{#each lineup as act}
							<div class="p-lineup-item">
								<span class="p-act-name">{act.name}</span>
								{#if act.role}<span class="p-act-role"> — {act.role}</span>{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
			{#if showAgenda}
				<div class="p-section p-agenda-section">
					<h2 class="p-section-label">Schedule</h2>
					<pre class="p-agenda">{agenda}</pre>
				</div>
			{/if}
		</div>
	{/if}

	{#if qrDataUrl}
		<footer class="p-footer">
			<div class="p-qr">
				<img src={qrDataUrl} alt="QR code" class="p-qr-img" />
				<span class="p-qr-label">Scan to view event</span>
			</div>
		</footer>
	{/if}
</div>

<style>
	/* ─── Screen ─────────────────────────────────────────── */

	/* Nav */
	.event-nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid #ebebeb;
	}

	.nav-inner {
		max-width: 1060px;
		margin: 0 auto;
		padding: 0.625rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.nav-brand-name {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: #111;
		text-transform: lowercase;
		text-decoration: none;
	}

	.nav-brand-name:hover {
		text-decoration: none;
	}

	.nav-brand-type {
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #999;
	}

	.generic {
		background: #fff;
		color: #111;
		min-height: 100vh;
		font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
	}

	.container {
		max-width: 1060px;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 5rem;
	}

	/* ── Two-column grid ── */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		grid-template-areas:
			"header  sidebar"
			"content sidebar";
		column-gap: 3rem;
		align-items: start;
	}

	.main-header {
		grid-area: header;
		padding-bottom: 2rem;
	}

	.sidebar {
		grid-area: sidebar;
		position: sticky;
		top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.main-content {
		grid-area: content;
	}

	/* Mobile: single column, sidebar between header and content */
	@media (max-width: 700px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas:
				"header"
				"sidebar"
				"content";
		}
		.sidebar {
			position: static;
			min-width: 0;
		}
		.main-header,
		.main-content {
			min-width: 0;
		}
	}

	/* Header */
	.name {
		font-size: clamp(1.875rem, 6vw, 3.25rem);
		font-weight: 800;
		line-height: 1.08;
		letter-spacing: -0.025em;
		color: #0a0a0a;
		margin: 0 0 0.625rem;
	}

	.tagline {
		font-size: 1.0625rem;
		color: #444;
		margin: 0 0 0.375rem;
		line-height: 1.55;
		font-weight: 400;
		overflow-wrap: break-word;
	}

	.organiser {
		font-size: 0.875rem;
		color: #888;
		margin: 0.375rem 0 0;
	}
	.organiser strong {
		color: var(--accent);
		font-weight: 600;
	}

	.organiser-phrase {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: var(--accent);
		margin-top: 0.5rem;
		letter-spacing: 0.02em;
	}
	.organiser-phrase .signed-check {
		color: var(--accent);
		flex-shrink: 0;
	}

	.event-phrase {
		text-align: center;
		font-size: 0.75rem;
		color: #bbb;
		letter-spacing: 0.04em;
		padding: 1.5rem 2rem;
	}

	/* Sidebar: hero image */
	.hero {
		border-radius: 12px;
		overflow: hidden;
		background: #f4f4f4;
		cursor: pointer;
	}
	.hero img, .hero .svg-inline {
		width: 100%;
		aspect-ratio: 16 / 10;
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
	.hero:hover img { opacity: 0.88; }

	/* Sidebar: info block */
	.info-block {
		border: 1px solid #ebebeb;
		border-radius: 12px;
		overflow: hidden;
	}

	.info-row {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid #f4f4f4;
	}
	.info-row:last-child { border-bottom: none; }

	.info-icon-wrap {
		width: 36px;
		height: 36px;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.info-icon-wrap svg {
		width: 17px;
		height: 17px;
		color: var(--accent);
	}

	.info-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #aaa;
		margin-bottom: 0.2rem;
	}

	.info-main {
		font-size: 0.9rem;
		font-weight: 600;
		color: #111;
		line-height: 1.4;
		overflow-wrap: break-word;
	}

	.info-sub {
		font-size: 0.8125rem;
		color: #666;
		margin-top: 0.125rem;
		overflow-wrap: break-word;
	}

	.info-link {
		color: var(--accent);
		text-decoration: none;
	}
	.info-link:hover { text-decoration: underline; }

	/* Sidebar: RSVP */
	.rsvp-zone { /* no extra margin — gap on sidebar flex handles spacing */ }

	.rsvp-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.875rem 1.5rem;
		background: var(--accent);
		color: #fff;
		border-radius: 10px;
		font-size: 0.9375rem;
		font-weight: 700;
		text-decoration: none;
		letter-spacing: 0.005em;
		transition: opacity 0.15s, transform 0.15s;
		box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 30%, transparent);
		box-sizing: border-box;
	}
	.rsvp-btn:hover { opacity: 0.88; transform: translateY(-1px); }

	.rsvp-plain {
		font-size: 0.9375rem;
		color: #444;
		font-weight: 500;
		margin: 0;
		padding: 0.75rem 0;
		border-top: 1px solid #f0f0f0;
	}

	/* Main content sections */
	.section {
		padding-top: 2rem;
		border-top: 1px solid #f0f0f0;
	}
	.section + .section {
		margin-top: 2rem;
	}
	.main-content .section:first-child {
		border-top: none;
		padding-top: 0;
	}

	.section-label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #888;
		margin: 0 0 1rem;
	}

	.body-text {
		font-size: 1rem;
		line-height: 1.75;
		color: #333;
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}

	/* Lineup */
	.lineup {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.lineup-item {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		background: #fafafa;
		border: 1px solid #f0f0f0;
		border-radius: 8px;
	}

	.act-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #111;
	}

	.act-role {
		font-size: 0.8125rem;
		color: #777;
	}

	/* Agenda */
	.agenda {
		font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
		font-size: 0.875rem;
		line-height: 1.65;
		color: #333;
		margin: 0;
		white-space: pre-wrap;
		background: #fafafa;
		border: 1px solid #ebebeb;
		padding: 1.125rem;
		border-radius: 10px;
	}

	/* Detail chips */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
	}

	.chip {
		display: flex;
		flex-direction: column;
		padding: 0.625rem 1rem;
		background: #fafafa;
		border: 1px solid #ebebeb;
		border-radius: 10px;
		min-width: 90px;
	}

	.chip-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #aaa;
		margin-bottom: 0.25rem;
	}

	.chip-value {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #111;
	}

	/* Gallery */
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.625rem;
	}

	.lb-trigger {
		display: block;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		border-radius: 8px;
		overflow: hidden;
	}
	.lb-trigger:hover .gallery-img { opacity: 0.88; }

	.gallery-img {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: 8px;
		display: block;
		transition: opacity 0.15s;
	}

	/* Contacts */
	.contacts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1.25rem;
	}

	.contact-row {
		display: contents;
	}

	.contact-platform {
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #aaa;
		white-space: nowrap;
		align-self: center;
	}

	.contact-handle {
		font-size: 0.9375rem;
		color: #222;
		word-break: break-all;
		align-self: center;
	}

	/* Site footer */
	.site-footer {
		padding: 1.25rem 2rem;
		border-top: 1px solid #e8e8e8;
		font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
		font-size: 0.8125rem;
		color: #aaa;
		text-align: center;
	}

	.footer-link {
		color: #555;
		text-decoration: none;
		font-weight: 600;
	}

	.footer-link:hover {
		color: #111;
		text-decoration: underline;
	}

	/* ─── Print poster ─────────────────────────────────────────────
	   Always rendered off-screen so JS can measure & trim overflow.
	   @media print just moves it into the page and makes it visible.
	─────────────────────────────────────────────────────────────── */
	.poster {
		position: fixed;
		top: -9999px;
		left: -9999px;
		visibility: hidden;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		width: 210mm;
		height: 297mm;
		overflow: hidden;
		background: #fff;
		color: #111;
		font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
		padding: 18mm 16mm 58mm;
		box-sizing: border-box;
	}

	.p-top { flex-shrink: 0; }

	.p-name {
		font-size: 20mm;
		font-weight: 800;
		line-height: 1.0;
		letter-spacing: -0.025em;
		color: #0a0a0a;
		margin: 0 0 3mm;
		word-break: normal;
		hyphens: none;
		overflow-wrap: normal;
	}

	.p-by {
		font-size: 4.5mm;
		color: #666;
		margin: 0 0 4mm;
		font-weight: 400;
	}

	.p-rule {
		width: 14mm;
		height: 1.5mm;
		background: var(--accent);
		margin-bottom: 4mm;
	}

	.p-tagline {
		font-size: 5mm;
		color: #444;
		margin: 0 0 5mm;
		line-height: 1.4;
		font-weight: 400;
	}

	.p-image-wrap {
		flex-shrink: 0;
		margin-bottom: 7mm;
	}

	.p-image {
		width: 100%;
		max-height: 72mm;
		object-fit: cover;
		display: block;
		border-radius: 2mm;
	}

	.p-info {
		flex-shrink: 0;
		border-top: 0.4mm solid #e8e8e8;
		padding-top: 5mm;
		display: flex;
		flex-direction: column;
		gap: 3mm;
	}

	.p-info-row {
		display: grid;
		grid-template-columns: 16mm 1fr;
		gap: 4mm;
		align-items: baseline;
	}

	.p-info-label {
		font-size: 3mm;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}

	.p-info-val {
		font-size: 4.5mm;
		font-weight: 500;
		color: #111;
		word-break: break-word;
	}

	.p-sections {
		flex-shrink: 0;
		border-top: 0.4mm solid #e8e8e8;
		padding-top: 5mm;
		margin-top: 2mm;
		display: flex;
		flex-direction: column;
		gap: 4mm;
	}

	.p-section {
		display: flex;
		flex-direction: column;
		gap: 1.5mm;
	}

	.p-section-label {
		font-size: 2.75mm;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #888;
		margin: 0;
	}

	.p-body {
		font-size: 4mm;
		line-height: 1.5;
		color: #333;
		margin: 0;
		white-space: pre-wrap;
	}

	.p-lineup {
		display: flex;
		flex-direction: column;
		gap: 1mm;
	}

	.p-lineup-item { font-size: 4mm; color: #111; }
	.p-act-name    { font-weight: 600; }
	.p-act-role    { font-weight: 400; color: #666; }

	.p-agenda {
		font-family: 'Courier New', monospace;
		font-size: 3.5mm;
		line-height: 1.55;
		color: #333;
		margin: 0;
		white-space: pre-wrap;
	}

	.p-footer {
		position: absolute;
		bottom: 16mm;
		right: 16mm;
	}

	.p-qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2mm;
	}

	.p-qr-img {
		width: 38mm;
		height: 38mm;
		display: block;
		image-rendering: pixelated;
	}

	.p-qr-label {
		font-size: 2.5mm;
		color: #aaa;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	/* In print: bring poster into the page */
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

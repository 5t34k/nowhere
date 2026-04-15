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
	import SvgImage from '$lib/renderer/components/SvgImage.svelte';
	import { svgToBackgroundUrl } from '$lib/renderer/utils/svg-sanitize.js';
	import { sanitizeUrl, sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { fitText } from './fitText.js';

	const accent = $derived(accentColor || '#F59E0B');

	const isSvgImage = $derived(image?.startsWith('<'));
	const bgImageStyle = $derived.by(() => {
		if (!image) return '';
		if (isSvgImage) return `background-image: ${svgToBackgroundUrl(image)}`;
		const safe = sanitizeImageUrl(image);
		if (!safe) return '';
		return `background-image: url("${safe.replace(/["\\]/g, '')}")`;
	});

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	const lightboxImages = $derived([image, ...secondaryImages].filter(Boolean));

	function openLightboxSecondary(i: number) {
		lightboxIndex = image ? i + 1 : i;
		lightboxOpen = true;
	}
</script>

<!-- ─── SCREEN ──────────────────────────────────────────────────── -->
<div class="monumental no-print" style="--accent: {accent}">

	<!-- Full-bleed background: image or cinematic gradient -->
	{#if image}
		<div class="bg-image" style={bgImageStyle}></div>
		<div class="bg-overlay"></div>
	{:else}
		<div class="bg-gradient"></div>
	{/if}

	<!-- Hero: name fills the viewport -->
	<section class="hero">
		<div class="hero-inner">
			<h1 class="event-name" use:fitText>{name}</h1>
			{#if description}
				<p class="tagline">{description}</p>
			{/if}
		</div>

		<div class="hero-footer">
			{#if dateDisplayMedium}
				<span class="hf-date">{dateDisplayMedium.toUpperCase()}</span>
			{/if}
			{#if timeDisplay}
				<span class="hf-sep">·</span>
				<span class="hf-time">{timeDisplay}</span>
			{/if}
			{#if venueName || venueAddress}
				<span class="hf-sep">·</span>
				<span class="hf-venue">
					{#if venueName}{venueName}{/if}{#if venueName && venueAddress}, {/if}{#if venueAddress}{venueAddress}{/if}
				</span>
			{/if}
			{#if onlineUrl && !venueName && !venueAddress}
				<span class="hf-sep">·</span>
				<a href={sanitizeUrl(onlineUrl)} class="hf-online" target="_blank" rel="noopener noreferrer">Online Event</a>
			{/if}
			{#if organiser}
				<span class="hf-sep">·</span>
				<span class="hf-organiser">Presented by {organiser}</span>
			{/if}
			{#if organiserPhrase}
				<span class="hf-sep">·</span>
				<span class="hf-organiser-phrase">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					{organiserPhrase}
				</span>
			{/if}
		</div>
	</section>

	<!-- Details: scrollable dark panel below the hero -->
	{#if body || lineup.length > 0 || agenda || admissionDisplay || capacity || ageRestriction || dressCode || rsvpUrl || onlineUrl || contacts.length > 0 || secondaryImages.length > 0}
		<div class="details">

			{#if body}
				<div class="d-block">
					<p class="body-text">{body}</p>
				</div>
			{/if}

			{#if lineup.length > 0}
				<div class="d-block">
					<h2 class="d-label">Lineup</h2>
					<ul class="lineup">
						{#each lineup as act}
							<li class="lineup-item">
								<span class="act-name">{act.name}</span>
								{#if act.role}<span class="act-role">{act.role}</span>{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if agenda}
				<div class="d-block">
					<h2 class="d-label">Schedule</h2>
					<pre class="agenda-text">{agenda}</pre>
				</div>
			{/if}

			{#if admissionDisplay || capacity || ageRestriction || dressCode || rsvpUrl || onlineUrl}
				<div class="d-block info-row">
					{#if admissionDisplay}
						<div class="info-pair">
							<span class="ip-label">Admission</span>
							<span class="ip-value">{admissionDisplay}</span>
						</div>
					{/if}
					{#if capacity}
						<div class="info-pair">
							<span class="ip-label">Capacity</span>
							<span class="ip-value">{capacity}</span>
						</div>
					{/if}
					{#if ageRestriction}
						<div class="info-pair">
							<span class="ip-label">Age</span>
							<span class="ip-value">{ageRestriction}</span>
						</div>
					{/if}
					{#if dressCode}
						<div class="info-pair">
							<span class="ip-label">Dress</span>
							<span class="ip-value">{dressCode}</span>
						</div>
					{/if}
					{#if rsvpUrl || onlineUrl}
						<div class="info-pair">
							<span class="ip-label">Tickets</span>
							{#if rsvpUrl && !rsvpUrl.startsWith('http')}
								<span class="ip-plain">{rsvpUrl}</span>
							{:else}
								<a href={sanitizeUrl(rsvpUrl || onlineUrl)} class="ip-link" target="_blank" rel="noopener noreferrer">RSVP →</a>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			{#if contacts.length > 0}
				<div class="d-block">
					<h2 class="d-label">Contact</h2>
					<div class="contacts">
						{#each contacts as c}
							<div class="contact-row">
								<span class="contact-platform">{c.name}</span>
								{#if c.handle}<span class="contact-handle"><CopyHandle text={c.handle} /></span>{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if secondaryImages.length > 0}
				<div class="d-block gallery">
					{#each secondaryImages as src, i}
						<button class="lb-trigger" onclick={() => openLightboxSecondary(i)} aria-label="View image {i + 1}">
							<img {src} alt="Event image {i + 1}" class="gallery-img" />
						</button>
					{/each}
				</div>
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

{#if lightboxOpen}
	<ImageLightbox images={lightboxImages} startIndex={lightboxIndex} onclose={() => lightboxOpen = false} />
{/if}

<!-- ─── PRINT POSTER ────────────────────────────────────────────── -->
<div class="poster" style="--accent: {accent}">

	{#if image}
		<div class="p-bg" style={bgImageStyle}></div>
		<div class="p-overlay"></div>
	{:else}
		<div class="p-gradient"></div>
	{/if}

	<div class="p-inner">
		<div class="p-hero">
			<h1 class="p-name" use:fitText>{name}</h1>
			{#if description}
				<p class="p-tagline">{description}</p>
			{/if}
		</div>

		<div class="p-meta">
			{#if dateDisplayMedium}
				<span class="p-date">{dateDisplayMedium.toUpperCase()}</span>
			{/if}
			{#if timeDisplay}
				<span class="p-meta-sep">·</span>
				<span class="p-time">{timeDisplay}</span>
			{/if}
			{#if venueName}
				<span class="p-meta-sep">·</span>
				<span class="p-venue">{venueName}</span>
			{/if}
			{#if venueAddress}
				<span class="p-addr">{venueAddress}</span>
			{/if}
		</div>

		<div class="p-footer">
			<div class="p-foot-left">
				{#if organiser}
					<span class="p-organiser">Presented by {organiser}</span>
				{/if}
				{#if rsvpUrl}
					<div class="p-rsvp">
						{#if rsvpUrl.startsWith('http')}
							<span class="p-rsvp-url">{rsvpUrl}</span>
						{:else}
							<span class="p-rsvp-text">{rsvpUrl}</span>
						{/if}
					</div>
				{/if}
			</div>
			{#if qrDataUrl}
				<div class="p-qr">
					<img src={qrDataUrl} alt="QR code" class="p-qr-img" />
				</div>
			{/if}
		</div>
	</div>

</div>

<style>
/* ════════════════════════════════════════════════════════
   SCREEN LAYOUT
════════════════════════════════════════════════════════ */

.monumental {
	position: relative;
	background: #050507;
	color: #fff;
	min-height: 100vh;
	font-family: Impact, 'Arial Black', Arial, sans-serif;
}

/* Full-bleed backgrounds — fixed for parallax effect */
.bg-image {
	position: fixed;
	inset: 0;
	background-size: cover;
	background-position: center;
	z-index: 0;
}

/* Gradient: heavy top, clear centre, heavy bottom — text legibility at both ends */
.bg-overlay {
	position: fixed;
	inset: 0;
	background:
		linear-gradient(to bottom,
			rgba(0, 0, 0, 0.85) 0%,
			rgba(0, 0, 0, 0.3) 30%,
			rgba(0, 0, 0, 0.3) 60%,
			rgba(0, 0, 0, 0.92) 100%);
	z-index: 1;
}

/* No-image: cinematic — two off-centre light sources, like stage lighting */
.bg-gradient {
	position: fixed;
	inset: 0;
	background:
		radial-gradient(ellipse at 25% 55%, color-mix(in srgb, var(--accent) 22%, #000) 0%, transparent 55%),
		radial-gradient(ellipse at 75% 45%, color-mix(in srgb, var(--accent) 12%, #000) 0%, transparent 45%),
		#040406;
	z-index: 0;
}

/* Hero section: fills full viewport, name centred in the space */
.hero {
	position: relative;
	z-index: 10;
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	padding: 8vh 6vw 5vh;
	box-sizing: border-box;
}

.hero-inner {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	text-align: center;
}

/* Name: maximum scale, carved weight */
.event-name {
	font-size: clamp(4rem, 14vw, 10rem);
	font-weight: 400; /* Impact has no weight variation — 400 renders at full weight */
	line-height: 0.9;
	letter-spacing: 0.02em;
	color: #fff;
	margin: 0 0 1.5rem;
	text-shadow:
		0 0 80px rgba(0, 0, 0, 0.8),
		0 4px 60px rgba(0, 0, 0, 0.5);
	word-break: normal;
	hyphens: none;
	overflow-wrap: normal;
	text-transform: uppercase;
}

.tagline {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: clamp(0.9375rem, 2vw, 1.25rem);
	font-style: italic;
	font-weight: 400;
	color: rgba(255, 255, 255, 0.85);
	margin: 0;
	max-width: 55ch;
	line-height: 1.5;
	background: rgba(0, 0, 0, 0.55);
	padding: 0.5em 0.875em;
	border-radius: 4px;
	backdrop-filter: blur(4px);
}

/* Footer strip: date · venue — centred, below the title */
.hero-footer {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
	gap: 0.5rem 0.875rem;
	padding-top: 2rem;
	border-top: 1px solid rgba(255, 255, 255, 0.18);
	text-align: center;
}

.hf-date {
	font-size: 0.8125rem;
	font-weight: 400;
	letter-spacing: 0.18em;
	color: var(--accent);
}

.hf-sep {
	color: rgba(255, 255, 255, 0.25);
	font-size: 0.875rem;
}

.hf-time {
	font-family: system-ui, -apple-system, Arial, sans-serif;
	font-size: 0.8125rem;
	color: rgba(255, 255, 255, 0.55);
	letter-spacing: 0.05em;
}

.hf-venue {
	font-family: system-ui, -apple-system, Arial, sans-serif;
	font-size: 0.875rem;
	color: rgba(255, 255, 255, 0.8);
	font-weight: 500;
}

.hf-online {
	font-family: system-ui, -apple-system, Arial, sans-serif;
	font-size: 0.8125rem;
	color: var(--accent);
	text-decoration: none;
}

.hf-organiser {
	font-family: Georgia, serif;
	font-size: 0.8125rem;
	font-style: italic;
	color: rgba(255, 255, 255, 0.4);
}

.hf-organiser-phrase {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
	font-size: 0.75rem;
	color: var(--accent);
}

.event-phrase {
	position: relative;
	z-index: 10;
	text-align: center;
	font-family: system-ui, -apple-system, Arial, sans-serif;
	font-size: 0.6875rem;
	color: rgba(255, 255, 255, 0.2);
	letter-spacing: 0.06em;
	padding: 1.5rem 2rem;
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* Details section: dark panel, scrollable below the hero */
.details {
	position: relative;
	z-index: 10;
	background: #0c0c0e;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	padding: 4rem 6vw 5rem;
}

.d-block {
	max-width: 680px;
	margin: 0 auto 3rem;
}

.d-block:last-child {
	margin-bottom: 0;
}

.d-label {
	font-size: 0.5625rem;
	font-weight: 400;
	text-transform: uppercase;
	letter-spacing: 0.25em;
	color: var(--accent);
	margin: 0 0 1.25rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.body-text {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 1rem;
	line-height: 1.8;
	color: rgba(255, 255, 255, 0.7);
	margin: 0;
	white-space: pre-wrap;
}

/* Lineup */
.lineup {
	list-style: none;
	padding: 0;
	margin: 0;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.lineup-item {
	display: flex;
	align-items: baseline;
	gap: 1rem;
	padding: 0.625rem 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.lineup-item:last-child {
	border-bottom: none;
}

.act-name {
	font-size: 1rem;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.88);
}

.act-role {
	font-size: 0.8125rem;
	color: rgba(255, 255, 255, 0.4);
	font-style: italic;
	font-family: Georgia, serif;
}

/* Agenda */
.agenda-text {
	font-family: 'Courier New', monospace;
	font-size: 0.875rem;
	line-height: 1.7;
	color: rgba(255, 255, 255, 0.55);
	margin: 0;
	white-space: pre-wrap;
}

/* Info row */
.info-row {
	display: flex;
	flex-wrap: wrap;
	gap: 2.5rem;
}

.info-pair {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
}

.ip-label {
	font-size: 0.5625rem;
	text-transform: uppercase;
	letter-spacing: 0.2em;
	color: rgba(255, 255, 255, 0.35);
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.ip-value {
	font-size: 0.9375rem;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.88);
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.ip-link {
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--accent);
	text-decoration: none;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.ip-plain {
	font-size: 0.9375rem;
	color: rgba(255, 255, 255, 0.85);
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

/* Contacts */
.contacts {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 0.5rem 1.5rem;
	font-family: system-ui, -apple-system, Arial, sans-serif;
}

.contact-row {
	display: contents;
}

.contact-platform {
	font-size: 0.5625rem;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	color: rgba(255, 255, 255, 0.3);
}

.contact-handle {
	font-size: 0.875rem;
	color: rgba(255, 255, 255, 0.7);
}

/* Gallery */
.gallery {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 0.75rem;
	padding: 0;
}

.lb-trigger {
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
	aspect-ratio: 4 / 3;
	object-fit: cover;
	display: block;
	transition: opacity 0.15s;
}

/* Site footer */
.site-footer {
	position: relative;
	z-index: 10;
	padding: 1rem 2rem;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
	font-size: 0.75rem;
	letter-spacing: 0.1em;
	color: rgba(255, 255, 255, 0.55);
	text-align: center;
}

.footer-link {
	color: rgba(255, 255, 255, 0.75);
	text-decoration: none;
}

.footer-link:hover {
	color: #fff;
	text-decoration: underline;
}

/* ════════════════════════════════════════════════════════
   PRINT SWITCH
════════════════════════════════════════════════════════ */
.poster { display: none; }

/* ════════════════════════════════════════════════════════
   PRINT POSTER — A4 portrait, full-bleed cinematic
════════════════════════════════════════════════════════ */
@media print {
	@page { size: A4 portrait; margin: 0; }

	.no-print { display: none !important; }

	.poster {
		display: block;
		position: relative;
		width: 210mm;
		height: 297mm;
		overflow: hidden;
		background: #050507;
		color: #fff;
		font-family: Impact, 'Arial Black', Arial, sans-serif;
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}

	.p-bg {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
	}

	.p-overlay {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(to bottom,
				rgba(0, 0, 0, 0.82) 0%,
				rgba(0, 0, 0, 0.28) 30%,
				rgba(0, 0, 0, 0.28) 60%,
				rgba(0, 0, 0, 0.92) 100%);
	}

	.p-gradient {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 25% 55%, color-mix(in srgb, var(--accent) 22%, #000) 0%, transparent 55%),
			radial-gradient(ellipse at 75% 45%, color-mix(in srgb, var(--accent) 12%, #000) 0%, transparent 45%),
			#040406;
	}

	.p-inner {
		position: relative;
		z-index: 10;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 18mm 16mm 12mm;
		box-sizing: border-box;
	}

	/* Hero: name in the upper-centre mass of the poster */
	.p-hero {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		text-align: center;
	}

	.p-name {
		font-size: 28mm;
		font-weight: 400;
		line-height: 0.88;
		letter-spacing: 0.02em;
		color: #fff;
		margin: 0 0 6mm;
		text-shadow:
			0 0 20mm rgba(0, 0, 0, 0.6);
		text-transform: uppercase;
		word-break: normal;
		hyphens: none;
		overflow-wrap: normal;
	}

	.p-tagline {
		font-family: Georgia, serif;
		font-size: 5mm;
		font-style: italic;
		font-weight: 400;
		color: rgba(255, 255, 255, 0.85);
		margin: 0;
		line-height: 1.4;
		background: rgba(0, 0, 0, 0.55);
		padding: 2mm 3.5mm;
		border-radius: 1mm;
	}

	/* Date · venue strip */
	.p-meta {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1.5mm 3mm;
		padding: 4mm 6mm;
		border-radius: 1mm;
		background: rgba(0, 0, 0, 0.6);
		text-align: center;
		flex-shrink: 0;
	}

	.p-date {
		font-size: 3.2mm;
		letter-spacing: 0.18em;
		color: var(--accent);
	}

	.p-meta-sep {
		color: rgba(255, 255, 255, 0.25);
		font-size: 3mm;
	}

	.p-time {
		font-family: system-ui, Arial, sans-serif;
		font-size: 3mm;
		color: rgba(255, 255, 255, 0.55);
		letter-spacing: 0.06em;
	}

	.p-venue {
		font-family: system-ui, Arial, sans-serif;
		font-size: 3.5mm;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		letter-spacing: 0.03em;
	}

	.p-addr {
		font-family: Georgia, serif;
		font-size: 2.8mm;
		font-style: italic;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Footer */
	.p-footer {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		flex-shrink: 0;
		padding-top: 5mm;
	}

	.p-foot-left {
		display: flex;
		flex-direction: column;
		gap: 2mm;
	}

	.p-organiser {
		font-family: Georgia, serif;
		font-size: 2.8mm;
		font-style: italic;
		color: rgba(255, 255, 255, 0.45);
	}

	.p-rsvp {
		display: flex;
		flex-direction: column;
	}

	.p-rsvp-url {
		font-family: 'Courier New', monospace;
		font-size: 2.5mm;
		color: rgba(255, 255, 255, 0.6);
	}

	.p-rsvp-text {
		font-family: Georgia, serif;
		font-size: 2.5mm;
		font-style: italic;
		color: rgba(255, 255, 255, 0.6);
	}

	.p-qr {
		flex-shrink: 0;
	}

	.p-qr-img {
		width: 44mm;
		height: 44mm;
		display: block;
		filter: invert(1);
	}
}
</style>

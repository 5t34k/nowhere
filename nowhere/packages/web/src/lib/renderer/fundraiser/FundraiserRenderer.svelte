<script lang="ts">
	import type { FundraiserData, Tag } from '@nowhere/codec';
	import { formatCurrency } from '@nowhere/codec';
	import { siteData, siteSigned } from '$lib/renderer/stores/site-data.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import { renderMarkdown } from '$lib/renderer/utils/markdown-sanitize.js';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import QRCode from 'qrcode';
	import { parseTipMethods } from '$lib/tips.js';
	import { parseContacts, platformByCode, CUSTOM_CODE, CUSTOM_ICON } from '$lib/contacts.js';
	import FundraiserSidebar from './FundraiserSidebar.svelte';
	import FundraiserFooter from './FundraiserFooter.svelte';
	import ImageCarousel from '../store/ImageCarousel.svelte';
	import SvgImage from '$lib/renderer/components/SvgImage.svelte';
	import { tick } from 'svelte';
	import './fundraiser.css';

	const data = $derived($siteData as FundraiserData);

	// ─── Tag helpers ───
	function getTag(key: string): string | undefined {
		return data?.tags?.find((t: Tag) => t.key === key)?.value;
	}
	function hasTag(key: string): boolean {
		return data?.tags?.some((t: Tag) => t.key === key) ?? false;
	}

	// ─── Derived values ───
	const currency = $derived(getTag('$') || 'USD');
	const goalCents = $derived(getTag('g') ? parseInt(getTag('g')!, 10) : null);
	const goalFormatted = $derived(goalCents ? formatCurrency(goalCents / 100, currency) : null);
	const deadline = $derived(getTag('h') || null);
	const tagline = $derived(getTag('t') || null);
	const budgetMarkdown = $derived(getTag('b') || null);
	const teamRaw = $derived(getTag('T') || null);
	const teamMembers = $derived(teamRaw ? teamRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
	const faqContent = $derived(getTag('Q') || null);
	const tipMethodsRaw = $derived(getTag('l'));
	const tipMethods = $derived(tipMethodsRaw ? parseTipMethods(tipMethodsRaw) : []);

	// Contact methods
	const contactsRaw = $derived(getTag('j'));
	const contactEmail = $derived(getTag('I') || null);
	const nostrContact = $derived(hasTag('G') && $siteSigned);
	const contacts = $derived(contactsRaw ? parseContacts(contactsRaw) : []);
	let expandedContact = $state<string | null>(null);

	// Creator name: first team member if available
	const creatorName = $derived(teamMembers.length > 0 ? teamMembers[0] : null);

	// ─── Deadline countdown ───
	const daysLeft = $derived.by(() => {
		if (!deadline) return null;
		const now = new Date();
		const end = new Date(deadline);
		const diff = end.getTime() - now.getTime();
		return Math.ceil(diff / (1000 * 60 * 60 * 24));
	});

	// ─── FAQ parsing ───
	const faqPairs = $derived.by(() => {
		if (!faqContent) return [];
		const pairs: { q: string; a: string }[] = [];
		const lines = faqContent.split('\n');
		let currentQ = '';
		let currentA = '';
		for (const line of lines) {
			if (line.startsWith('Q:')) {
				if (currentQ) pairs.push({ q: currentQ, a: currentA.trim() });
				currentQ = line.slice(2).trim();
				currentA = '';
			} else if (line.startsWith('A:')) {
				currentA = line.slice(2).trim();
			} else if (currentA !== undefined) {
				currentA += '\n' + line;
			}
		}
		if (currentQ) pairs.push({ q: currentQ, a: currentA.trim() });
		return pairs;
	});

	// ─── Markdown rendering ───
	const renderedStory = $derived(renderMarkdown(data?.description ?? ''));
	const renderedBudget = $derived(renderMarkdown(budgetMarkdown ?? ''));

	// ─── Verification ───
	let authorPhrase = $state('');
	let campaignPhrase = $state('');
	let fingerprint = $state('');

	$effect(() => {
		if (data) {
			computeVerification(data).then((result) => {
				authorPhrase = result.sellerPhrase;
				campaignPhrase = result.storePhrase;
				fingerprint = result.storeFingerprint;
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
	const npubTruncated = $derived(npub ? npub.slice(0, 12) + '...' + npub.slice(-4) : '');

	// ─── QR code ───
	let qrDataUrl = $state('');
	let qrTooLong = $state(false);
	let showQr = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			QRCode.toDataURL(window.location.href, {
				width: 1024, margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url) => {
				qrDataUrl = url;
			}).catch(() => {
				qrTooLong = true;
			});
		}
	});

	// ─── Copy helpers ───
	let linkCopied = $state(false);
	let npubCopied = $state(false);

	async function copyUrl() {
		if (typeof window === 'undefined') return;
		try { await navigator.clipboard.writeText(window.location.href); } catch {}
		linkCopied = true;
		setTimeout(() => (linkCopied = false), 2000);
	}

	async function copyNpub() {
		if (!npub) return;
		try { await navigator.clipboard.writeText(npub); } catch {}
		npubCopied = true;
		setTimeout(() => (npubCopied = false), 2000);
	}

	// ─── Cover images ───
	const isSvgImage = $derived(data?.image?.trimStart().startsWith('<'));
	const coverImages = $derived(isSvgImage ? [] : (data?.image ? data.image.split(' ').filter(Boolean) : []));
	let carouselIndex = $state(0);

	// ─── Donate flow state ───
	let showDonateFlow = $state(false);
	let showMobileSheet = $state(false);
	let showMobileShare = $state(false);
	let showShareQr = $state(false);
	let qrWrapEl: HTMLDivElement | undefined = $state();
	const canNativeShare = $derived(typeof navigator !== 'undefined' && !!navigator.share);

	async function nativeShare() {
		if (!canNativeShare) return;
		try {
			await navigator.share({
				title: data?.name ?? 'Fundraiser',
				text: goalFormatted
					? `Help us reach ${goalFormatted} — ${data.name}`
					: `Support this campaign — ${data.name}`,
				url: window.location.href
			});
		} catch {}
	}

	// ─── Team initial color — warm hues only ───
	function nameToHue(name: string): number {
		let sum = 0;
		for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
		return (sum % 80) + 10; // 10-90: reds, oranges, yellows
	}

	// ─── Set background color ───
	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.style.backgroundColor = '#ffffff';
		}
	});
</script>

{#if data}
<div class="fundraiser-page">
	<!-- Header bar -->
	<header class="fr-header-bar">
		<a href="https://hostednowhere.com" class="fr-header-brand" target="_blank" rel="noopener noreferrer">nowhere</a>
		<span class="fr-header-type">Fundraiser</span>
	</header>

	<div class="fr-disclaimer">Nowhere is permissionless. Anyone can create a fundraiser on Nowhere. Campaigns are private, only visible to those who have the link, and cannot be reviewed, moderated, or removed. All donations are peer-to-peer and irreversible. Campaigns can be cryptographically signed by their creator. Check the creator's verification phrase to make sure you trust who you're donating to.</div>

	<!-- Title banner — full width -->
	<div class="fr-title-banner">
		<div class="fr-title-inner">
			<h1 class="fr-campaign-title">{data.name}</h1>
			{#if tagline}
				<p class="fr-campaign-tagline">{tagline}</p>
			{/if}
			<!-- Creator + verification -->
			{#if creatorName || authorPhrase}
				<div class="fr-creator-row">
					{#if creatorName}
						<span class="fr-creator-name">by {creatorName}</span>
					{/if}
					{#if $siteSigned && npub}
						<span class="fr-creator-npub" role="button" tabindex="0" onclick={copyNpub} onkeydown={(e) => { if (e.key === 'Enter') copyNpub(); }}>{npubCopied ? 'Copied!' : npubTruncated}</span>
					{/if}
				</div>
				{#if $siteSigned && authorPhrase}
					{@const words = authorPhrase.split(' ')}
					{@const mid = Math.ceil(words.length / 2)}
					<div class="fr-creator-verification-wrap">
						<div class="fr-creator-verification">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							<div class="fr-verification-lines">
								<span>{words.slice(0, mid).join(' \u00B7 ')}</span>
								<span>{words.slice(mid).join(' \u00B7 ')}</span>
							</div>
						</div>
					</div>
				{:else if authorPhrase}
					<div class="fr-creator-row">
						<span class="fr-creator-phrase unsigned">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
							Campaign not signed - donate with caution
						</span>
					</div>
				{/if}
			{/if}
			{#if contactEmail || nostrContact || contacts.length > 0}
				<div class="fr-mobile-contact-row">
					{#if contactEmail}
						<button class="fr-contact-icon-btn" class:active={expandedContact === 'email'} onclick={() => (expandedContact = expandedContact === 'email' ? null : 'email')} title="Email">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
						</button>
					{/if}
					{#if nostrContact}
						<button class="fr-contact-icon-btn" class:active={expandedContact === 'nostr'} onclick={() => (expandedContact = expandedContact === 'nostr' ? null : 'nostr')} title="Nostr">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18V6l10 12V6"/></svg>
						</button>
					{/if}
					{#each contacts as entry}
						{@const platform = platformByCode.get(entry.code)}
						{#if platform || entry.code === CUSTOM_CODE}
							<button class="fr-contact-icon-btn" class:active={expandedContact === entry.code + entry.handle} onclick={() => (expandedContact = expandedContact === entry.code + entry.handle ? null : entry.code + entry.handle)} title={platform?.name || entry.customName || 'Contact'}>
								{@html platform?.icon || CUSTOM_ICON}
							</button>
						{/if}
					{/each}
				</div>
				{#if expandedContact}
					<div class="fr-mobile-contact-detail fr-contact-detail">
						{#if expandedContact === 'email' && contactEmail}
							<span class="fr-contact-detail-label">Email</span>
							<a href="mailto:{contactEmail}" class="fr-contact-detail-link">{contactEmail}</a>
						{:else if expandedContact === 'nostr' && $siteSigned && npub}
							<span class="fr-contact-detail-label">npub</span>
							<span class="fr-contact-detail-text" role="button" tabindex="0" style="cursor: pointer; word-break: break-all;" onclick={copyNpub} onkeydown={(e) => { if (e.key === 'Enter') copyNpub(); }}>{npubCopied ? 'Copied!' : npub}</span>
						{:else}
							{#each contacts as entry}
								{@const platform = platformByCode.get(entry.code)}
								{#if expandedContact === entry.code + entry.handle}
									<span class="fr-contact-detail-label">{platform?.name || entry.customName || 'Contact'}</span>
									<span class="fr-contact-detail-text">{entry.handle}</span>
								{/if}
							{/each}
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Mobile goal/deadline row (visible only on mobile) -->
	{#if goalFormatted || (deadline && daysLeft !== null)}
		<div class="fr-mobile-goal-row">
			{#if goalFormatted}
				<span class="fr-sidebar-goal">{goalFormatted}</span>
				<span class="fr-sidebar-goal-label">goal</span>
			{/if}
			{#if deadline && daysLeft !== null}
				<span class="fr-deadline-pill" class:urgent={daysLeft <= 7}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
					{#if daysLeft > 0}
						{daysLeft} day{daysLeft === 1 ? '' : 's'} left
					{:else if daysLeft === 0}
						Ends today
					{:else}
						Campaign ended
					{/if}
				</span>
			{/if}
		</div>
	{/if}

	<!-- Two-column layout -->
	<div class="fr-layout">
		<!-- Main column -->
		<main class="fr-main">
			{#if isSvgImage && data?.image}
				<div class="fr-hero-image">
					<SvgImage image={data.image} alt={data.name} />
				</div>
			{:else if coverImages.length === 1}
				<div class="fr-hero-image">
					<img src={sanitizeImageUrl(coverImages[0])} alt={data.name} />
				</div>
			{:else if coverImages.length > 1}
				<div class="fr-hero-image">
					<ImageCarousel images={coverImages} name={data.name} activeIndex={carouselIndex} onchange={(i) => (carouselIndex = i)} />
				</div>
			{/if}

			{#if renderedStory}
				<div class="fr-section">
					<div class="fr-section-title">The Story</div>
					<div class="fr-prose">{@html renderedStory}</div>
				</div>
			{/if}

			{#if renderedBudget}
				<div class="fr-section">
					<div class="fr-section-title">What the Money is For</div>
					<div class="fr-prose">{@html renderedBudget}</div>
				</div>
			{/if}

			{#if faqPairs.length > 0}
				<div class="fr-section">
					<div class="fr-section-title">FAQ</div>
					{#each faqPairs as pair}
						<div class="fr-faq-item">
							<div class="fr-faq-q">{pair.q}</div>
							<div class="fr-faq-a">{pair.a}</div>
						</div>
					{/each}
				</div>
			{/if}
		</main>

		<!-- Sidebar — single sticky card -->
		<aside class="fr-sidebar">
			<div class="fr-sidebar-card">
				<!-- Goal + Donate -->
				{#if goalFormatted}
					<div class="fr-sidebar-goal">{goalFormatted}</div>
					<div class="fr-sidebar-goal-label">goal</div>
				{/if}

				{#if deadline && daysLeft !== null}
					<div class="fr-card-row">
						<span class="fr-deadline-pill" class:urgent={daysLeft <= 7}>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
							{#if daysLeft > 0}
								{daysLeft} day{daysLeft === 1 ? '' : 's'} left
							{:else if daysLeft === 0}
								Ends today
							{:else}
								Campaign ended
							{/if}
						</span>
					</div>
				{/if}

				{#if tipMethods.length > 0}
					<div class="fr-card-row">
						{#if !showDonateFlow}
							<button class="fr-donate-btn" onclick={() => (showDonateFlow = true)}>Donate Now</button>
						{:else}
							<div class="fr-donate-flow">
								<FundraiserSidebar {tipMethods} onCollapse={() => (showDonateFlow = false)} />
							</div>
						{/if}
					</div>
				{/if}

				<!-- Verification -->
				<div class="fr-card-divider"></div>

				{#if creatorName}
					<div class="fr-id-creator">{creatorName}</div>
				{/if}

				{#if $siteSigned && npub}
					<div class="fr-card-subsection">
						<span class="fr-identity-label">Identity</span>
						<span class="fr-npub" role="button" tabindex="0" onclick={copyNpub} onkeydown={(e) => { if (e.key === 'Enter') copyNpub(); }}>
							{npubCopied ? 'Copied!' : npubTruncated}
							{#if !npubCopied}
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							{/if}
						</span>
					</div>
				{/if}

				{#if $siteSigned && authorPhrase}
					<div class="fr-id-verified">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						Verified
					</div>
					<div class="fr-id-phrase">{authorPhrase.split(' ').join(' \u00B7 ')}</div>
				{:else if authorPhrase}
					<div class="fr-id-unverified">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
						Campaign not signed
					</div>
					<div class="fr-id-unverified-hint">This campaign is not cryptographically signed. The creator's identity cannot be confirmed.</div>
				{/if}

				{#if teamMembers.length > 1}
					<div class="fr-card-subsection">
						<div class="fr-team-title">Team</div>
						<div class="fr-team-list">
							{#each teamMembers as member}
								<span class="fr-team-member">
									<span class="fr-team-initial" style="background: hsl({nameToHue(member)}, 45%, 45%);">{member.charAt(0).toUpperCase()}</span>
									{member}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Contact icons -->
				{#if contactEmail || nostrContact || contacts.length > 0}
					<div class="fr-card-divider"></div>
					<div class="fr-card-section-label">Contact</div>
					<div class="fr-contact-icons">
						{#if contactEmail}
							<button class="fr-contact-icon-btn" class:active={expandedContact === 'email'} onclick={() => (expandedContact = expandedContact === 'email' ? null : 'email')} title="Email">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
							</button>
						{/if}
						{#if nostrContact}
							<button class="fr-contact-icon-btn" class:active={expandedContact === 'nostr'} onclick={() => (expandedContact = expandedContact === 'nostr' ? null : 'nostr')} title="Nostr">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18V6l10 12V6"/></svg>
							</button>
						{/if}
						{#each contacts as entry}
							{@const platform = platformByCode.get(entry.code)}
							{#if platform || entry.code === CUSTOM_CODE}
								<button class="fr-contact-icon-btn" class:active={expandedContact === entry.code + entry.handle} onclick={() => (expandedContact = expandedContact === entry.code + entry.handle ? null : entry.code + entry.handle)} title={platform?.name || entry.customName || 'Contact'}>
									{@html platform?.icon || CUSTOM_ICON}
								</button>
							{/if}
						{/each}
					</div>
					<!-- Expanded contact detail -->
					{#if expandedContact}
						<div class="fr-contact-detail">
							{#if expandedContact === 'email' && contactEmail}
								<span class="fr-contact-detail-label">Email</span>
								<a href="mailto:{contactEmail}" class="fr-contact-detail-link">{contactEmail}</a>
							{:else if expandedContact === 'nostr' && $siteSigned && npub}
								<span class="fr-contact-detail-label">npub</span>
								<span class="fr-contact-detail-text" role="button" tabindex="0" style="cursor: pointer; word-break: break-all;" onclick={copyNpub} onkeydown={(e) => { if (e.key === 'Enter') copyNpub(); }}>{npubCopied ? 'Copied!' : npub}</span>
							{:else}
								{#each contacts as entry}
									{@const platform = platformByCode.get(entry.code)}
									{#if expandedContact === entry.code + entry.handle}
										<span class="fr-contact-detail-label">{platform?.name || entry.customName || 'Contact'}</span>
										<span class="fr-contact-detail-text">{entry.handle}</span>
									{/if}
								{/each}
							{/if}
						</div>
					{/if}
				{/if}

				<!-- Share -->
				<div class="fr-card-divider"></div>
				<button class="fr-share-btn" onclick={() => (showQr = true)}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
					Share
				</button>
			</div>
		</aside>
	</div>

	<!-- Footer -->
	<FundraiserFooter
		{data}
		{tipMethods}
		{authorPhrase}
		campaignPhrase={campaignPhrase}
		signed={$siteSigned}
		{fingerprint}
		onshareqr={() => (showQr = true)}
		onmobileshare={() => { showShareQr = false; showMobileShare = true; }}
		{canNativeShare}
	/>

	<!-- Share modal -->
	{#if showQr}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fr-share-backdrop" onclick={() => (showQr = false)}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fr-share-modal" onclick={(e) => e.stopPropagation()}>
				<button class="fr-share-modal-close" onclick={() => (showQr = false)}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
				<div class="fr-share-modal-header">Share this campaign</div>
				<div class="fr-share-modal-name">{data.name}</div>
				{#if qrTooLong}
					<div class="fr-share-modal-qr fr-share-modal-qr-fallback">
						<svg class="fr-share-fallback-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="3" y="3" width="7" height="7"/>
							<rect x="14" y="14" width="3" height="3"/>
							<rect x="3" y="14" width="7" height="7"/>
						</svg>
						<div class="fr-share-fallback-title">This campaign is too large for a QR code</div>
						<div class="fr-share-fallback-body">The link itself contains the entire fundraiser. Copy it below to share.</div>
					</div>
				{:else if qrDataUrl}
					<img src={qrDataUrl} alt="QR code" class="fr-share-modal-qr" />
				{/if}
				{#if !qrTooLong}
					<div class="fr-share-modal-hint">Scan to view this fundraiser</div>
				{/if}
				<button class="fr-share-modal-copy" onclick={copyUrl}>
					{#if linkCopied}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						Copied!
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						Copy link
					{/if}
				</button>
			</div>
		</div>
	{/if}

	<!-- Mobile sticky bar -->
	<div class="fr-mobile-bar">
		{#if tipMethods.length > 0}
			<button class="fr-mobile-bar-btn" onclick={() => (showMobileSheet = true)}>Donate</button>
		{/if}
		<button class="fr-mobile-bar-btn fr-mobile-bar-btn--share" onclick={() => { showShareQr = false; showMobileShare = true; }}>Share</button>
	</div>

	<!-- Mobile bottom sheet -->
	{#if showMobileSheet}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fr-bottom-sheet-backdrop" onclick={() => (showMobileSheet = false)}></div>
		<div class="fr-bottom-sheet">
			<div class="fr-bottom-sheet-drag"></div>
			<div class="fr-bottom-sheet-header">
				<span class="fr-bottom-sheet-title">Donate</span>
				<button class="fr-bottom-sheet-close" onclick={() => (showMobileSheet = false)}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			{#if creatorName || authorPhrase}
				<div style="margin-bottom: 0.75rem;">
					{#if creatorName}
						<span style="font-size: 0.85rem; font-weight: 600; color: var(--fr-text);">{creatorName}</span>
					{/if}
					{#if $siteSigned && authorPhrase}
						<div style="display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; font-weight: 600; color: var(--fr-text-muted); margin-top: 0.2rem;">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							Verified
						</div>
						<div style="font-size: 0.65rem; font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; color: var(--fr-text-muted); margin-top: 0.15rem;">{authorPhrase.split(' ').join(' \u00B7 ')}</div>
					{:else if authorPhrase}
						<div style="display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: #b45309; margin-top: 0.2rem;">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
							Campaign not signed
						</div>
					{/if}
				</div>
			{/if}
			{#if goalFormatted}
				<div style="font-size: 1.25rem; font-weight: 700; color: var(--fr-text); margin-bottom: 1rem;">{goalFormatted} <span style="font-size: 0.75rem; font-weight: 600; color: var(--fr-text-muted); text-transform: uppercase; letter-spacing: 0.08em;">goal</span></div>
			{/if}
			<FundraiserSidebar {tipMethods} onCollapse={() => (showMobileSheet = false)} />
		</div>
	{/if}

	<!-- Mobile share bottom sheet -->
	{#if showMobileShare}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fr-bottom-sheet-backdrop" onclick={() => (showMobileShare = false)}></div>
		<div class="fr-bottom-sheet">
			<div class="fr-bottom-sheet-drag"></div>
			<div class="fr-bottom-sheet-header">
				<span class="fr-bottom-sheet-title">Share</span>
				<button class="fr-bottom-sheet-close" onclick={() => (showMobileShare = false)}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>

			<div class="fr-share-sheet-hero">
				<svg class="fr-share-sheet-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
				<div class="fr-share-sheet-name">{data.name}</div>
				{#if goalFormatted}
					<div class="fr-share-sheet-goal">Goal: {goalFormatted}</div>
				{/if}
				<p class="fr-share-sheet-message">Sharing is one of the most powerful ways to help. A single share can reach someone who wants to contribute.</p>
			</div>

			{#if canNativeShare}
				<button class="fr-share-sheet-primary" onclick={nativeShare}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
					Share via...
				</button>
			{/if}

			<button class="fr-share-sheet-copy" onclick={copyUrl}>
				{#if linkCopied}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					Copied!
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					Copy link
				{/if}
			</button>

			{#if qrTooLong}
				<div class="fr-share-sheet-qr-wrap" bind:this={qrWrapEl}>
					<div class="fr-share-modal-qr-fallback fr-share-modal-qr-fallback--sheet">
						<svg class="fr-share-fallback-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="3" y="3" width="7" height="7"/>
							<rect x="14" y="14" width="3" height="3"/>
							<rect x="3" y="14" width="7" height="7"/>
						</svg>
						<div class="fr-share-fallback-title">Too large for a QR code</div>
						<div class="fr-share-fallback-body">The link itself contains the campaign. Copy it above to share.</div>
					</div>
				</div>
			{:else if qrDataUrl}
				<button class="fr-share-sheet-qr-toggle" onclick={async () => { showShareQr = !showShareQr; if (showShareQr) { await tick(); qrWrapEl?.scrollIntoView({ behavior: 'smooth', block: 'end' }); } }}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
					{showShareQr ? 'Hide' : 'Show'} QR code
					<span class="fr-share-sheet-chevron" class:open={showShareQr}>&#9660;</span>
				</button>
				{#if showShareQr}
					<div class="fr-share-sheet-qr-wrap" bind:this={qrWrapEl}>
						<img src={qrDataUrl} alt="QR code" class="fr-share-sheet-qr" />
						<div class="fr-share-sheet-hint">Save or screenshot to share</div>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
{/if}

<script lang="ts">
	import type { PetitionData, Tag } from '@nowhere/codec';
	import { siteData, siteSigned, siteFragment } from '$lib/renderer/stores/site-data.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import { countSignatures } from '$lib/renderer/nostr/petition-signing.js';
	import { USE_LOCAL_RELAY, USE_PTR_RELAY, getPetitionRelays } from '$lib/renderer/nostr/relay-pool.js';
	import { renderMarkdown } from '$lib/renderer/utils/markdown-sanitize.js';
	import { sanitizeUrl, sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import QRCode from 'qrcode';
	import { parseContacts, platformByCode } from '$lib/contacts.js';
	import ImageCarousel from '../store/ImageCarousel.svelte';
	import SvgImage from '$lib/renderer/components/SvgImage.svelte';
	import PetitionSignForm from './PetitionSignForm.svelte';
	import FooterModal from '$lib/renderer/store/FooterModal.svelte';
	import './petition.css';

	const data = $derived($siteData as PetitionData);

	// ─── Tag helpers ───
	function getTag(key: string): string | undefined {
		return data?.tags?.find((t: Tag) => t.key === key)?.value;
	}
	function hasTag(key: string): boolean {
		return data?.tags?.some((t: Tag) => t.key === key) ?? false;
	}

	const title = $derived(data?.name ?? '');
	const tagline = $derived(getTag('t'));
	const organiser = $derived(getTag('T'));
	const goalRaw = $derived(getTag('g'));
	const goal = $derived(goalRaw ? parseInt(goalRaw, 10) : null);
	const deadline = $derived(getTag('h'));
	const additionalContext = $derived(getTag('b'));
	const contactsRaw = $derived(getTag('j'));
	const contactEmail = $derived(getTag('I'));
	const nostrContact = $derived(hasTag('G'));

	const contacts = $derived(contactsRaw ? parseContacts(contactsRaw) : []);

	// Decision makers from tag D: "name|title;name|title"
	const decisionMakers = $derived.by(() => {
		const raw = getTag('D');
		if (!raw) return [];
		return raw.split(';').filter(Boolean).map((entry) => {
			const [name, title] = entry.split('|');
			return { name: name || '', title: title || '' };
		});
	});

	// Images
	const isSvgImage = $derived(data?.image?.trimStart().startsWith('<'));
	const images = $derived(isSvgImage ? [] : (data?.image ? data.image.split(' ').filter(Boolean) : []));
	const hasMultipleImages = $derived(images.length > 1);
	let carouselIndex = $state(0);

	// ─── Markdown rendering ───
	const renderedBody = $derived(renderMarkdown(data?.description ?? ''));
	const renderedContext = $derived(renderMarkdown(additionalContext ?? ''));

	// ─── Preview mode ───
	const isPreview = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return new URLSearchParams(window.location.search).has('preview');
	});

	// ─── Dark mode ───
	let isDark = $state(false);

	function initTheme() {
		if (typeof window === 'undefined') return;
		const stored = sessionStorage.getItem('nowhere-petition-theme');
		if (stored) {
			isDark = stored === 'dark';
		} else {
			isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	}

	function toggleTheme() {
		isDark = !isDark;
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('nowhere-petition-theme', isDark ? 'dark' : 'light');
		}
	}

	$effect(() => {
		initTheme();
	});

	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.style.backgroundColor = isDark ? '#1A1A1A' : '#FAFAF7';
		}
	});

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
			}).then((url) => {
				qrDataUrl = url;
			}).catch(() => {
				qrTooLong = true;
			});
		}
	});

	// ─── Scroll progress ───
	let scrollProgress = $state(0);

	function handleScroll() {
		if (typeof window === 'undefined') return;
		const scrollTop = window.scrollY;
		const docHeight = document.documentElement.scrollHeight - window.innerHeight;
		scrollProgress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
	}

	$effect(() => {
		if (!isPreview && typeof window !== 'undefined') {
			window.addEventListener('scroll', handleScroll, { passive: true });
			return () => window.removeEventListener('scroll', handleScroll);
		}
	});

	// ─── Share ───
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

	// ─── Signature count ───
	let signatureCount = $state(0);
	let countLoaded = $state(false);
	let showSignForm = $state(false);

	$effect(() => {
		if (data && typeof window !== 'undefined' && !isPreview) {
			const relays = getPetitionRelays(data.tags);
			const fragment = $siteFragment;
			if (fragment) {
				countSignatures(fragment, relays).then((count) => {
					signatureCount = count;
					countLoaded = true;
				}).catch(() => {
					countLoaded = true;
				});
			}
		}
	});

	function handleSigned() {
		signatureCount += 1;
	}

	// ─── Deadline countdown ───
	const daysLeft = $derived.by(() => {
		if (!deadline) return null;
		const target = new Date(deadline);
		const now = new Date();
		const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
		return diff > 0 ? diff : 0;
	});

	// ─── Footer menu ───
	let openFooterPanel = $state<'contact' | null>(null);
	let openContactIdx = $state<number | null>(null);
	let showAbout = $state(false);

	const hasContacts = $derived(contacts.length > 0 || contactEmail || nostrContact);

	interface ContactItem {
		label: string;
		detail: string;
		href?: string;
		copyable?: boolean;
	}

	const allContacts = $derived.by((): ContactItem[] => {
		const items: ContactItem[] = [];
		if (nostrContact) {
			items.push({ label: 'Nostr', detail: 'View on Nostr', href: `https://njump.me/${npub}` });
		}
		if (contactEmail) {
			items.push({ label: 'Email', detail: contactEmail, href: `mailto:${contactEmail}` });
		}
		for (const entry of contacts) {
			const platform = platformByCode.get(entry.code);
			if (!platform) continue;
			const name = platform.name;
			const handle = entry.handle;
			if (entry.code === 'T') {
				items.push({ label: name, detail: handle, href: `https://t.me/${handle.replace(/^@/, '')}` });
			} else if (entry.code === 'K') {
				items.push({ label: name, detail: handle, href: `https://x.com/${handle.replace(/^@/, '')}` });
			} else if (entry.code === 'I') {
				items.push({ label: name, detail: handle, href: `https://instagram.com/${handle.replace(/^@/, '')}` });
			} else if (entry.code === 'D') {
				items.push({ label: name, detail: handle, copyable: true });
			} else if (entry.code === 'F') {
				items.push({ label: name, detail: handle, href: `https://m.me/${handle}` });
			} else if (entry.code === 'P') {
				items.push({ label: name, detail: handle, href: `tel:${handle}` });
			} else if (entry.code === 'W') {
				items.push({ label: name, detail: handle, href: `https://wa.me/${handle.replace(/[^0-9+]/g, '')}` });
			} else {
				items.push({ label: name, detail: handle, copyable: true });
			}
		}
		return items;
	});

	function toggleFooterPanel(panel: 'contact') {
		openFooterPanel = openFooterPanel === panel ? null : panel;
		openContactIdx = null;
	}

	function revealPanel(_node: HTMLElement) {
		window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
	}

	let contactCopied = $state(false);

	async function copyContact(text: string) {
		try { await navigator.clipboard.writeText(text); } catch {}
		contactCopied = true;
		setTimeout(() => (contactCopied = false), 2000);
	}

	function toggleContact(idx: number) {
		openContactIdx = openContactIdx === idx ? null : idx;
		contactCopied = false;
	}

	// ─── Verification phrases ───
	let authorPhrase = $state('');
	let petitionPhrase = $state('');

	$effect(() => {
		if (data) {
			computeVerification(data).then((result) => {
				authorPhrase = result.sellerPhrase;
				petitionPhrase = result.storePhrase;
			});
		}
	});

	const authorPhraseFormatted = $derived(
		authorPhrase ? authorPhrase.split(' ').join(' \u00B7 ') : ''
	);
	const petitionPhraseFormatted = $derived(
		petitionPhrase ? petitionPhrase.split(' ').join(' \u00B7 ') : ''
	);

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
	const npubTruncated = $derived(npub ? npub.slice(0, 8) + '...' : '');

	let npubCopied = $state(false);

	async function copyNpub() {
		if (!npub) return;
		try { await navigator.clipboard.writeText(npub); } catch {}
		npubCopied = true;
		setTimeout(() => (npubCopied = false), 2000);
	}
</script>

{#if data}
<div class="petition-page" class:dark={isDark}>
	{#if USE_LOCAL_RELAY}
		<div class="petition-testing-banner local-relay">LOCAL RELAY</div>
	{:else if USE_PTR_RELAY}
		<div class="petition-testing-banner ptr-relay"><span class="ptr-line">CONNECTED TO PRIVATE RELAY</span><span class="ptr-dash"> — </span><span class="ptr-line">TESTING ONLY</span></div>
	{/if}

	{#if !isPreview}
		<div class="scroll-progress" style:width="{scrollProgress}%"></div>
	{/if}

	<div class="petition-header">
		<a href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer">nowhere</a>
		<span class="petition-header-sep">|</span>
		<span class="petition-header-type">Petition</span>
	</div>

	{#if !isPreview}
		<button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
			{#if isDark}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
			{/if}
		</button>
	{/if}

	<div class="petition-content">
		<h1 class="petition-title">{title}</h1>
		{#if tagline}
			<p class="petition-tagline">{tagline}</p>
		{/if}

		<div class="petition-author">
			<div class="petition-author-info">
				<span class="petition-author-name">{organiser || 'Anonymous'}</span>
				{#if $siteSigned && authorPhraseFormatted}
					<span class="petition-author-phrase signed">
						<svg class="signed-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						{authorPhraseFormatted}
					</span>
				{:else if authorPhraseFormatted}
					<span class="petition-author-phrase unsigned">This petition was not signed by the creator</span>
				{/if}
			</div>
		</div>

		{#if decisionMakers.length > 0}
			<div class="petition-addressees">
				<div class="petition-addressee-label">To</div>
				{#each decisionMakers as dm}
					<div class="petition-addressee">
						<span class="petition-addressee-name">{dm.name}</span>
						{#if dm.title}
							<span class="petition-addressee-title">, {dm.title}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if isSvgImage && data?.image}
			<div class="petition-hero">
				<SvgImage image={data.image} alt={title} />
			</div>
		{:else if images.length > 0}
			<div class="petition-hero">
				{#if hasMultipleImages}
					<ImageCarousel {images} name={title} activeIndex={carouselIndex} onchange={(i) => (carouselIndex = i)} />
				{:else}
					<img src={sanitizeImageUrl(images[0])} alt={title} />
				{/if}
			</div>
		{/if}

		{#if renderedBody}
			<div class="petition-body">
				{@html renderedBody}
			</div>
		{/if}

		{#if renderedContext}
			<div class="petition-context-heading">Additional Context</div>
			<div class="petition-body">
				{@html renderedContext}
			</div>
		{/if}

		<!-- Signature area -->
		<div class="petition-signature-area">
			{#if !showSignForm}
				<button class="petition-sign-btn" onclick={() => (showSignForm = true)}>
					<svg class="petition-sign-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
					Sign this petition
				</button>
			{/if}

			<div class="petition-sig-count">
				{#if countLoaded || isPreview}
					{signatureCount} {signatureCount === 1 ? 'person has' : 'people have'} signed
				{:else}
					<span class="petition-sig-loading">Checking signatures...</span>
				{/if}
			</div>
			{#if goal || daysLeft !== null}
				<div class="petition-sig-meta">
					{#if goal}of {goal.toLocaleString()} goal{/if}
					{#if goal && daysLeft !== null} &middot; {/if}
					{#if daysLeft !== null}{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left{/if}
				</div>
			{/if}

			{#if showSignForm}
				<PetitionSignForm {data} onSigned={handleSigned} />
			{/if}
		</div>

		{#if petitionPhraseFormatted}
			<div class="petition-hash">
				{petitionPhraseFormatted}
				<div class="petition-hash-label">A unique phrase derived from this petition's content</div>
			</div>
		{/if}
	</div>

	<footer class="petition-footer">
		<div class="footer-menu">
			{#if hasContacts}
				<button class="footer-menu-item" class:active={openFooterPanel === 'contact'} onclick={() => toggleFooterPanel('contact')}>Contact</button>
			{/if}
			<button class="footer-menu-item" onclick={() => (showAbout = true)}>About this Petition</button>
		</div>

		{#if openFooterPanel === 'contact'}
			<div class="footer-contact-crossfade">
				<div class="footer-contact-layer" class:faded={openContactIdx !== null}>
					{#each allContacts as item, i}
						{#if i > 0}<span class="footer-contact-sep">&middot;</span>{/if}
						<button class="footer-contact-name" onclick={() => toggleContact(i)}>{item.label}</button>
					{/each}
				</div>
				{#each allContacts as item, i}
					<div class="footer-contact-layer footer-contact-detail-layer" class:visible={openContactIdx === i}>
						<button class="footer-contact-name" onclick={() => toggleContact(i)}>{item.label}</button>
						{#if item.href}
							<a class="footer-contact-handle" href={sanitizeUrl(item.href)} target="_blank" rel="noopener noreferrer">{item.detail}</a>
						{:else if item.copyable}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="footer-contact-handle footer-contact-copy" role="button" tabindex="0" onclick={() => copyContact(item.detail)} onkeydown={(e) => { if (e.key === 'Enter') copyContact(item.detail); }}>{contactCopied ? 'Copied!' : item.detail}</span>
						{:else}
							<span class="footer-contact-handle">{item.detail}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="petition-branding">Hosted <a href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer">nowhere</a>. Present everywhere.</div>
	</footer>

	{#if showAbout}
		<FooterModal title="About this Petition" onclose={() => (showAbout = false)}>
			<div class="petition-about-modal">
				<section>
					<h3>What is this petition?</h3>
					<p>This petition was created with Nowhere, a protocol that encodes pages entirely inside their URL. There are no servers, no accounts, and no company controlling this content. The petition was created by its organiser, encoded into a link, and cannot be modified, censored, or taken down by anyone.</p>
				</section>

				<section>
					<h3>What happens when I sign?</h3>
					<p>Your details are encrypted inside your browser before anything leaves your device. The encrypted data is then published to Nostr relays, a decentralised network of storage servers. Only the petition creator holds the key to decrypt and read what you submitted. No one else can.</p>
				</section>

				<section>
					<h3>Who can see my details?</h3>
					<p>Only the creator of this petition. Your submission is encrypted to their key before it leaves your browser. The relays that store it see only ciphertext and cannot read it. Nowhere itself has no access either. Crucially, neither Nowhere nor the relays know which petition your submission belongs to. Without the link, it is indistinguishable from any other encrypted data.</p>
				</section>

				<section>
					<h3>Who created this petition?</h3>
					{#if $siteSigned}
						<p>This petition was cryptographically signed by its creator. Signing proves that the person who published this petition controls the key associated with the identity shown. The verification phrase beneath the organiser's name is derived from that key. If it matches what you see on the creator's other channels, the petition is genuine.</p>
						{#if authorPhrase}
							<div class="petition-about-phrase">
								<span class="petition-about-phrase-label">Creator phrase:</span> {authorPhrase}
							</div>
						{/if}
						{#if npub}
							<div class="petition-about-phrase">
								<span class="petition-about-phrase-label">Npub:</span>
								<button class="petition-about-npub" onclick={copyNpub} title={npub}>{npubCopied ? 'Copied!' : npub.slice(0, 12) + '...' + npub.slice(-4)}</button>
							</div>
						{/if}
					{:else}
						<p>This petition was not signed. There is no cryptographic proof of who created it. If you are unsure whether it is genuine, try to verify the organiser's identity through a channel you already trust before signing.</p>
					{/if}
				</section>

				<section>
					<h3>Concerns about this petition</h3>
					<p>If you believe this petition is misleading or fraudulent, it is important to be honest about what can be done. Because the petition exists entirely in its URL, there is no server to contact and no authority that can remove it. The same property that protects legitimate organisers from censorship also means no one can take it down.</p>
					<p>If you have concerns, do not sign, and warn others through your own channels. If the petition involves a payment address or personal data collection, you may be able to report that to the relevant service.</p>
				</section>
			</div>
		</FooterModal>
	{/if}

	{#if !isPreview}
		<button class="share-btn" onclick={() => (showQr = true)} aria-label="QR code">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 2h2v4h-4v-2h2v-2zm-3-2h2v2h-2v-2zm-2-2h2v2h-2v-2zm2 4h2v2h-2v-2zm2-4h4v2h-2v2h-2v-2zm0 6h2v2h-2v-2zm-4 0h2v2h-2v-2z"/></svg>
		</button>
	{/if}

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="qr-overlay" class:visible={showQr} onclick={() => (showQr = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="qr-overlay-content" onclick={(e) => e.stopPropagation()}>
			{#if qrTooLong}
				<div class="qr-overlay-fallback">
					<svg class="qr-overlay-fallback-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="3" y="3" width="7" height="7"/>
						<rect x="14" y="14" width="3" height="3"/>
						<rect x="3" y="14" width="7" height="7"/>
					</svg>
					<div class="qr-overlay-fallback-title">This petition is too long for a QR code.</div>
					<div class="qr-overlay-fallback-body">The link itself contains the petition in full. Copy it below to share.</div>
				</div>
			{:else if qrDataUrl}
				<img src={qrDataUrl} alt="QR code" />
				<div class="qr-overlay-title">{title}</div>
				<div class="qr-overlay-label">Scan to sign</div>
			{/if}
			<button class="qr-copy-btn" onclick={copyUrl}>
				{linkCopied ? 'Copied!' : 'Copy link'}
			</button>
		</div>
	</div>
</div>
{/if}

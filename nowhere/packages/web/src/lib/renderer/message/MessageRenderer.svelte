<script lang="ts">
	import type { MessageData, Tag } from '@nowhere/codec';
	import { base64urlToHex } from '@nowhere/codec';
	import { siteData, siteSigned } from '$lib/renderer/stores/site-data.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import { renderMarkdown } from '$lib/renderer/utils/markdown-sanitize.js';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import QRCode from 'qrcode';
	import { parseContacts, platformByCode } from '$lib/contacts.js';
	import { parseTipMethods } from '$lib/tips.js';
	import TipPanel from './TipDialog.svelte';
	import FooterModal from '$lib/renderer/store/FooterModal.svelte';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import './message.css';

	// ─── Nowhere avatar (lazy-loaded) ───
	type AvatarFn = (seed: string, size: number) => string;
	let nowhereAvatarFn: AvatarFn | null = null;
	const nowhereAvatarReady: Promise<AvatarFn | null> = import('$lib/nowhere-avatar.js')
		.then(mod => { nowhereAvatarFn = mod.generateAvatar; return nowhereAvatarFn; })
		.catch(() => null);

	const data = $derived($siteData as MessageData);

	// ─── Tag helpers ───
	function getTag(key: string): string | undefined {
		return data?.tags?.find((t: Tag) => t.key === key)?.value;
	}
	function hasTag(key: string): boolean {
		return data?.tags?.some((t: Tag) => t.key === key) ?? false;
	}

	const title = $derived(getTag('t'));
	const tipMethodsRaw = $derived(getTag('l'));
	const tipMethods = $derived(tipMethodsRaw ? parseTipMethods(tipMethodsRaw) : []);
	const hasTips = $derived(tipMethods.length > 0);
	const contactsRaw = $derived(getTag('j'));
	const contactEmail = $derived(getTag('I'));
	const nostrContact = $derived(hasTag('G'));

	const contacts = $derived(contactsRaw ? parseContacts(contactsRaw) : []);

	// ─── Markdown rendering ───
	const renderedBody = $derived(renderMarkdown(data?.description ?? ''));

	// ─── Adaptive layout ───
	const isShort = $derived(!data?.description || data.description.length < 100);

	// ─── Preview mode ───
	const isPreview = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return new URLSearchParams(window.location.search).has('preview');
	});

	// ─── Dark mode ───
	let isDark = $state(false);

	function initTheme() {
		if (typeof window === 'undefined') return;
		const stored = sessionStorage.getItem('nowhere-message-theme');
		if (stored) {
			isDark = stored === 'dark';
		} else {
			isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	}

	function toggleTheme() {
		isDark = !isDark;
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('nowhere-message-theme', isDark ? 'dark' : 'light');
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
	let showQr = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			QRCode.toDataURL(window.location.href, {
				width: 512,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url) => {
				qrDataUrl = url;
			});
		}
	});

	// ─── Scroll progress ───
	let scrollProgress = $state(0);
	let showScrollBar = $derived(!isShort && !isPreview);

	function handleScroll() {
		if (typeof window === 'undefined') return;
		const scrollTop = window.scrollY;
		const docHeight = document.documentElement.scrollHeight - window.innerHeight;
		scrollProgress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
	}

	$effect(() => {
		if (showScrollBar && typeof window !== 'undefined') {
			window.addEventListener('scroll', handleScroll, { passive: true });
			return () => window.removeEventListener('scroll', handleScroll);
		}
	});

	// ─── Share ───
	let linkCopied = $state(false);

	function handleShareClick() {
		showQr = true;
	}

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

	// ─── Footer menu ───
	let openFooterPanel = $state<'contact' | 'tip' | null>(null);
	let openContactIdx = $state<number | null>(null);
	let showAbout = $state(false);

	const hasContacts = $derived(contacts.length > 0 || contactEmail || nostrContact);

	// Build unified contact list for the compact display
	interface ContactItem {
		label: string;
		detail: string;
		href?: string;
		copyable?: boolean;
	}

	const allContacts = $derived.by((): ContactItem[] => {
		const items: ContactItem[] = [];
		if (nostrContact) {
			items.push({ label: 'Nostr', detail: 'View on Nostr', href: `https://njump.me/${data?.pubkey}` });
		}
		if (contactEmail) {
			items.push({ label: 'Email', detail: contactEmail, href: `mailto:${contactEmail}` });
		}
		for (const entry of contacts) {
			const platform = platformByCode.get(entry.code);
			if (!platform) continue;
			const name = platform.name;
			const handle = entry.handle;
			// Build href for platforms that have standard URLs
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

	function toggleFooterPanel(panel: 'contact' | 'tip') {
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
	let messagePhrase = $state('');

	$effect(() => {
		if (data) {
			computeVerification(data).then((result) => {
				authorPhrase = result.sellerPhrase;
				messagePhrase = result.storePhrase;
			});
		}
	});

	const authorPhraseFormatted = $derived(
		authorPhrase ? authorPhrase.split(' ').join(' \u00B7 ') : ''
	);
	const messagePhraseFormatted = $derived(
		messagePhrase ? messagePhrase.split(' ').join(' \u00B7 ') : ''
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
		try {
			await navigator.clipboard.writeText(npub);
		} catch {
			// fallback
		}
		npubCopied = true;
		setTimeout(() => (npubCopied = false), 2000);
	}

	// ─── Avatar helpers ───
	const avatarIsNowhere = $derived(data?.image === '@' && !!data?.pubkey);
	const avatarIsSvg = $derived(!avatarIsNowhere && data?.image?.startsWith('<'));
	const avatarIsEmoji = $derived(data?.image && data.image !== '@' && !data.image.startsWith('http') && !avatarIsSvg);
	const sanitizedAvatarSvg = $derived.by(() => {
		if (!avatarIsSvg || !data?.image) return '';
		return sanitizeSvg(data.image);
	});

	// Generate nowhere avatar from pubkey when image === '@'
	let nowhereAvatarSvg = $state('');
	$effect(() => {
		if (!avatarIsNowhere || !data?.pubkey) { nowhereAvatarSvg = ''; return; }
		const hexPubkey = base64urlToHex(data.pubkey);
		if (nowhereAvatarFn) {
			nowhereAvatarSvg = sanitizeSvg(nowhereAvatarFn(hexPubkey, 44));
		} else {
			nowhereAvatarReady.then(fn => {
				if (fn && data?.pubkey) nowhereAvatarSvg = sanitizeSvg(fn(hexPubkey, 44));
			});
		}
	});
	const firstLine = $derived(
		title || (data?.description ? data.description.split('\n')[0].slice(0, 60) : '')
	);
</script>

{#if data}
<div class="message-page" class:dark={isDark}>
	{#if showScrollBar}
		<div class="scroll-progress" style:width="{scrollProgress}%"></div>
	{/if}

	{#if !isPreview}
		<button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
			{#if isDark}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
			{/if}
		</button>
	{/if}

	<div class="message-content" class:short={isShort}>
		{#if title}
			<h1 class="message-title">{title}</h1>
		{/if}

		<div class="message-author">
			{#if data.image}
				<div class="message-avatar">
					{#if avatarIsNowhere && nowhereAvatarSvg}
						<div class="message-avatar-svg" role="img" aria-label={data.name}>{@html nowhereAvatarSvg}</div>
					{:else if avatarIsSvg}
						<div class="message-avatar-svg" role="img" aria-label={data.name}>{@html sanitizedAvatarSvg}</div>
					{:else if avatarIsEmoji}
						<span class="message-avatar-emoji">{data.image}</span>
					{:else if !avatarIsNowhere}
						<img src={sanitizeImageUrl(data.image)} alt="{data.name}" class="message-avatar-img" />
					{/if}
				</div>
			{/if}
			<div class="message-author-info">
				<span class="message-author-name">{data.name}</span>
				{#if $siteSigned && authorPhraseFormatted}
					<span class="message-author-phrase signed">
						<svg class="signed-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						{authorPhraseFormatted}
					</span>
				{:else if authorPhraseFormatted}
					<span class="message-author-phrase unsigned">This message was not signed by the author</span>
				{/if}
			</div>
		</div>

		{#if renderedBody}
			<div class="message-body">
				{@html renderedBody}
			</div>
		{/if}

		{#if messagePhraseFormatted}
			<div class="message-hash">
				{messagePhraseFormatted}
				<div class="message-hash-label">A unique phrase derived from this message's content</div>
			</div>
		{/if}
	</div>

	<footer class="message-footer">
		<div class="footer-menu">
			{#if hasContacts}
				<button class="footer-menu-item" class:active={openFooterPanel === 'contact'} onclick={() => toggleFooterPanel('contact')}>Contact</button>
			{/if}
			{#if hasTips}
				<button class="footer-menu-item" class:active={openFooterPanel === 'tip'} onclick={() => toggleFooterPanel('tip')}>Tip</button>
			{/if}
			<button class="footer-menu-item" onclick={() => (showAbout = true)}>About this Message</button>
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
							<a class="footer-contact-handle" href={item.href} target="_blank" rel="noopener noreferrer">{item.detail}</a>
						{:else if item.copyable}
							<span class="footer-contact-handle footer-contact-copy" role="button" tabindex="0" onclick={() => copyContact(item.detail)} onkeydown={(e) => { if (e.key === 'Enter') copyContact(item.detail); }}>{contactCopied ? 'Copied!' : item.detail}</span>
						{:else}
							<span class="footer-contact-handle">{item.detail}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if openFooterPanel === 'tip'}
			<TipPanel tipMethods={tipMethods} onCollapse={() => { openFooterPanel = null; }} />
		{/if}

		<div class="message-branding">Hosted <a href="/" class="message-branding-link">nowhere</a>. Present everywhere.</div>
	</footer>

	{#if showAbout}
		<FooterModal title="About this Message" onclose={() => (showAbout = false)}>
			<div class="message-about-modal">
				<section>
					<h3>What is this?</h3>
					<p>This message was created with Nowhere, a protocol that encodes pages entirely inside their URL. There are no servers, no accounts, and no company controlling this content. The author created it, encoded it into a link, and it cannot be modified, censored, or taken down by anyone.</p>
				</section>

				<section>
					<h3>Is this authentic?</h3>
					{#if $siteSigned}
						<p>This message was cryptographically signed by its author. Signing proves that the person who published it controls the key associated with the identity shown. The verification phrase beneath the author's name is derived from that key. If it matches what you see on the author's other channels, the message is genuine.</p>
						{#if authorPhrase}
							<div class="message-about-phrase">
								<span class="message-about-phrase-label">Author phrase:</span> {authorPhrase}
							</div>
						{/if}
						{#if npub}
							<div class="message-about-phrase">
								<span class="message-about-phrase-label">Npub:</span>
								<button class="message-about-npub" onclick={copyNpub} title={npub}>{npubCopied ? 'Copied!' : npub.slice(0, 12) + '...' + npub.slice(-4)}</button>
							</div>
						{/if}
					{:else}
						<p>This message was not signed. There is no cryptographic proof of who wrote it. If you are unsure whether it is genuine, verify the author's identity through a channel you already trust before acting on its contents.</p>
					{/if}
				</section>

				<section>
					<h3>Can this message be altered?</h3>
					<p>No. The phrase shown at the bottom of the message is derived from its exact contents. Any change to the text, even a single character, produces a completely different phrase. If the phrase shown here matches what the author published elsewhere, the message is word-for-word what they wrote.</p>
					<p>This also protects against link manipulation. If someone intercepts and modifies the URL before you open it, the content and phrase will not match what the author originally shared.</p>
				</section>

				<section>
					<h3>Concerns about this message</h3>
					<p>If you believe this message is fraudulent or is impersonating someone, it is important to be honest about what can be done. Nowhere cannot remove it. There is no server to contact, no account to suspend, no hosting provider to pressure. The message exists entirely in its URL.</p>
					<p>The same property that makes this impossible is what makes every legitimate message on Nowhere permanent, uncensorable, and beyond the reach of any authority, including us. For whistleblowers, journalists, and anyone publishing under threat of censorship, that is precisely the point.</p>
					<p>If you have concerns about a specific message, do not act on its contents, and warn others through your own channels.</p>
				</section>
			</div>
		</FooterModal>
	{/if}

	{#if !isPreview}
		<button class="share-btn" onclick={handleShareClick} aria-label="QR code">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 2h2v4h-4v-2h2v-2zm-3-2h2v2h-2v-2zm-2-2h2v2h-2v-2zm2 4h2v2h-2v-2zm2-4h4v2h-2v2h-2v-2zm0 6h2v2h-2v-2zm-4 0h2v2h-2v-2z"/></svg>
		</button>
	{/if}

	{#if qrDataUrl}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="qr-overlay" class:visible={showQr} onclick={() => (showQr = false)}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="qr-overlay-content" onclick={(e) => e.stopPropagation()}>
				<img src={qrDataUrl} alt="QR code" />
				{#if firstLine}
					<div class="qr-overlay-title">{firstLine}</div>
				{/if}
				<div class="qr-overlay-label">Scan to read</div>
				<button class="qr-copy-btn" onclick={copyUrl}>
					{linkCopied ? 'Copied!' : 'Copy link'}
				</button>
			</div>
		</div>
	{/if}
</div>
{/if}

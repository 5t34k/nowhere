<script lang="ts">
	import type { StoreData, Tag } from '@nowhere/codec';
	import { formatCurrency, GPU_CRACK_TIMES } from '@nowhere/codec';
	import type { VerificationResult } from '$lib/renderer/nostr/verify.js';
	import { getAvailablePaymentMethods } from '$lib/payment-methods.js';
	import { platformByCode, parseContacts, CUSTOM_CODE, CUSTOM_ICON } from '$lib/contacts.js';
	import FooterModal from './FooterModal.svelte';

	interface Props {
		store: StoreData;
		currency: string;
		verification: VerificationResult | null;
		signed?: boolean;
	}

	let { store, currency, verification, signed = false }: Props = $props();

	let activeModal = $state<string | null>(null);

	function getTag(key: string): string {
		return store.tags.find((t: Tag) => t.key === key)?.value ?? '';
	}

	function hasTag(key: string): boolean {
		return store.tags.some((t: Tag) => t.key === key);
	}

	// --- Structured derived data ---

	const shippingData = $derived.by(() => {
		const shippingCurrency = getTag('K') || currency;
		const weightUnit = getTag('w') || 'kg';
		const freeTag = store.tags.find((t: Tag) => t.key === 'F');

		let freeShipping: { all: boolean; threshold?: string; includesIntl?: boolean } | null = null;
		if (freeTag) {
			if (!freeTag.value) {
				freeShipping = { all: true };
			} else {
				const threshold = parseInt(freeTag.value, 10);
				if (!isNaN(threshold) && threshold > 0) {
					freeShipping = {
						all: false,
						threshold: formatCurrency(threshold / 100, currency),
						includesIntl: hasTag('J')
					};
				}
			}
		}

		const domBase = getTag('s');
		let domestic: { rate: string; weightSurcharge?: string } | null = null;
		if (domBase) {
			const cents = parseInt(domBase, 10);
			if (!isNaN(cents)) {
				const domWeight = getTag('h');
				domestic = {
					rate: formatCurrency(cents / 100, shippingCurrency),
					weightSurcharge: domWeight ? `${formatCurrency(parseFloat(domWeight) / 100, shippingCurrency)} per ${weightUnit}` : undefined
				};
			}
		}

		const intlBase = getTag('S');
		const intlWeight = getTag('H');
		const effectiveIntlBase = intlBase || domBase;
		const effectiveIntlWeight = intlWeight || getTag('h');
		let international: { rate: string; weightSurcharge?: string } | null = null;
		if (effectiveIntlBase) {
			const cents = parseInt(effectiveIntlBase, 10);
			if (!isNaN(cents)) {
				international = {
					rate: formatCurrency(cents / 100, shippingCurrency),
					weightSurcharge: effectiveIntlWeight ? `${formatCurrency(parseFloat(effectiveIntlWeight) / 100, shippingCurrency)} per ${weightUnit}` : undefined
				};
			}
		}

		const country = getTag('L') || null;
		const allowed = getTag('c');
		const excluded = getTag('x');
		const delivery = getTag('D') || null;

		return {
			freeShipping,
			domestic,
			international,
			weightUnit,
			country,
			allowedCountries: allowed ? allowed.split('.') : [],
			excludedCountries: excluded ? excluded.split('.') : [],
			deliveryDays: delivery
		};
	});

	const aboutData = $derived.by(() => {
		return {
			name: store.name,
			description: store.description || null,
			longDesc: getTag('b') || null,
			sellerPhrase: signed ? (verification?.sellerPhrase || null) : null,
			storePhrase: verification?.storePhrase || null,
			sellerFingerprint: signed ? (verification?.sellerFingerprint || null) : null,
			storeFingerprint: verification?.storeFingerprint || null,
			allSellerPhrases: signed ? (verification?.allSellerPhrases || null) : null,
			allStorePhrases: verification?.allStorePhrases || null,
			defaultPhraseLength: verification?.defaultPhraseLength ?? 5,
			nostrContact: hasTag('G')
		};
	});

	const paymentMethods = $derived(getAvailablePaymentMethods(store.tags));

	const paymentSubtitle = $derived.by(() => {
		if (paymentMethods.length === 0) return undefined;
		if (paymentMethods.length === 1) return `This store accepts ${paymentMethods[0].method.name}`;
		return `This store accepts ${paymentMethods.length} payment methods`;
	});

	const contactData = $derived.by(() => {
		return {
			nostrContact: hasTag('G'),
			email: getTag('I') || null,
			methods: parseContacts(getTag('j'))
		};
	});

	const returnsContent = $derived(getTag('r'));
	const warrantyContent = $derived(getTag('Y'));
	const faqContent = $derived(getTag('Q'));

	function parseFaqPairs(content: string): { question: string; answer: string }[] | null {
		const lines = content.split('\n').filter(l => l.trim());
		const pairs: { question: string; answer: string }[] = [];
		let i = 0;
		while (i < lines.length) {
			const qMatch = lines[i].match(/^Q:\s*(.+)/i);
			if (!qMatch) return null;
			i++;
			const aLines: string[] = [];
			while (i < lines.length && !lines[i].match(/^Q:\s*/i)) {
				const aMatch = lines[i].match(/^A:\s*(.+)/i);
				if (aMatch) {
					aLines.push(aMatch[1]);
				} else {
					aLines.push(lines[i].trim());
				}
				i++;
			}
			if (aLines.length === 0) return null;
			pairs.push({ question: qMatch[1], answer: aLines.join('\n') });
		}
		return pairs.length > 0 ? pairs : null;
	}

	const faqPairs = $derived(faqContent ? parseFaqPairs(faqContent) : null);

	type ModalKey = 'about' | 'contact' | 'shipping' | 'returns' | 'faq' | 'payment' | 'orderIssues' | 'warranty' | 'whatIsNowhere' | 'howItWorks' | 'privacy' | 'openSource' | 'sellerVerification' | 'paymentSecurity' | 'storeIntegrity' | 'verificationPhrase';

	function open(key: ModalKey) {
		activeModal = key;
	}
</script>

<footer class="store-footer">
	<div class="footer-content">
		<div class="footer-columns">
			<div class="footer-col">
				<h4>Shop</h4>
				<ul>
					<li><button onclick={() => open('about')}>About</button></li>
					<li><button onclick={() => open('contact')}>Contact</button></li>
					<li><button onclick={() => open('shipping')}>Shipping</button></li>
					<li><button onclick={() => open('returns')}>Returns & Refunds</button></li>
				</ul>
			</div>

			<div class="footer-col">
				<h4>Help</h4>
				<ul>
					<li><button onclick={() => open('faq')}>FAQ</button></li>
					<li><button onclick={() => open('payment')}>Payment Methods</button></li>
					<li><button onclick={() => open('orderIssues')}>Order Issues</button></li>
					<li><button onclick={() => open('warranty')}>Warranty</button></li>
				</ul>
			</div>

			<div class="footer-col">
				<h4>Nowhere</h4>
				<ul>
					<li><button onclick={() => open('whatIsNowhere')}>What is Nowhere?</button></li>
					<li><button onclick={() => open('howItWorks')}>How it Works</button></li>
					<li><button onclick={() => open('privacy')}>Privacy</button></li>
					<li><button onclick={() => open('openSource')}>Open Source</button></li>
				</ul>
			</div>

			<div class="footer-col">
				<h4>Trust & Security</h4>
				<ul>
					<li><button onclick={() => open('sellerVerification')}>Seller Verification</button></li>
					<li><button onclick={() => open('storeIntegrity')}>Store Integrity</button></li>
					<li><button onclick={() => open('verificationPhrase')}>Verification Phrase</button></li>
					<li><button onclick={() => open('paymentSecurity')}>Payment Security</button></li>
				</ul>
			</div>
		</div>

		<div class="footer-bottom">
			<span>{store.name} &middot; Powered by <a href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer" class="footer-link">Nowhere</a></span>
		</div>
	</div>
</footer>

<!-- ============ MODALS ============ -->

{#if activeModal === 'about'}
	<FooterModal title="About {store.name}" subtitle={aboutData.description ?? undefined} onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
		{/snippet}

		{#if aboutData.longDesc}
			<div class="modal-prose">
				{#each aboutData.longDesc.split('\n\n') as paragraph}
					<p>{paragraph}</p>
				{/each}
			</div>
		{/if}

		<div class="modal-section">
			<div class="modal-section-title">Seller identity</div>
			{#if aboutData.sellerPhrase}
				<div class="info-card info-card--accent" style="--accent-color: #6366f1;">
					<div class="icon-row">
						<div class="icon-circle" style="background: color-mix(in srgb, #6366f1 15%, transparent); color: #6366f1;">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
						</div>
						<div>
							<div class="detail-label">Seller phrase</div>
							<div class="detail-value" style="font-family: var(--font-mono); font-size: var(--text-xs);">{aboutData.sellerPhrase}</div>
							<div class="detail-label" style="margin-top: 4px;">Same for all stores from this seller. Use it to recognize a seller you've bought from before.</div>
						</div>
					</div>
				</div>
			{/if}
			{#if aboutData.storePhrase}
				<div class="info-card info-card--accent" style="margin-top: var(--space-2);">
					<div class="icon-row">
						<div class="icon-circle icon-circle--success">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						</div>
						<div>
							<div class="detail-label">Store phrase</div>
							<div class="detail-value" style="font-family: var(--font-mono); font-size: var(--text-xs);">{aboutData.storePhrase}</div>
							<div class="detail-label" style="margin-top: 4px;">Unique to this store URL. Confirms the link hasn't been modified.</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'shipping'}
	<FooterModal title="Shipping Information" subtitle={shippingData.country ? `Ships from ${shippingData.country}` : 'Shipping rates and delivery'} onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
		{/snippet}

		{#if shippingData.freeShipping}
			<div class="info-card info-card--accent" style="--accent-color: var(--color-success);">
				<div class="icon-row">
					<div class="icon-circle icon-circle--success">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					</div>
					<div>
						<div class="detail-value">Free Shipping</div>
						{#if shippingData.freeShipping.all}
							<div class="detail-label">On all orders</div>
						{:else}
							<div class="detail-label">On orders over {shippingData.freeShipping.threshold}{shippingData.freeShipping.includesIntl ? ' (domestic & international)' : ' (domestic)'}</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		{#if shippingData.domestic || shippingData.international}
			<div class="two-col" class:single={!shippingData.domestic || !shippingData.international}>
				{#if shippingData.domestic}
					<div class="info-card">
						<div class="modal-section-title">Domestic</div>
						<div class="detail-value" style="font-size: var(--text-lg); margin: var(--space-1) 0;">{shippingData.domestic.rate}</div>
						<div class="detail-label">Flat rate</div>
						{#if shippingData.domestic.weightSurcharge}
							<div class="detail-label" style="margin-top: var(--space-2);">+ {shippingData.domestic.weightSurcharge} weight surcharge</div>
						{/if}
					</div>
				{/if}
				{#if shippingData.international}
					<div class="info-card">
						<div class="modal-section-title">International</div>
						<div class="detail-value" style="font-size: var(--text-lg); margin: var(--space-1) 0;">{shippingData.international.rate}</div>
						<div class="detail-label">Flat rate</div>
						{#if shippingData.international.weightSurcharge}
							<div class="detail-label" style="margin-top: var(--space-2);">+ {shippingData.international.weightSurcharge} weight surcharge</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if shippingData.deliveryDays}
			<div class:modal-section={!!shippingData.freeShipping || !!shippingData.domestic || !!shippingData.international}>
				<div class="icon-row">
					<div class="icon-circle">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
					</div>
					<div>
						<div class="detail-label">Estimated domestic delivery</div>
						<div class="detail-value">{shippingData.deliveryDays} days</div>
					</div>
				</div>
				<div class="modal-prose" style="margin-top: var(--space-2); padding-left: 48px;">
					<p>Individual items may have different shipping times - check item details for specifics.</p>
				</div>
			</div>
		{/if}

		{#if shippingData.international}
			<div class:modal-section={!!shippingData.freeShipping || !!shippingData.domestic || !!shippingData.deliveryDays}>
				<div class="modal-prose">
					<p>International delivery times vary. We aim to dispatch all international orders as quickly as possible.</p>
				</div>
			</div>
		{/if}

		{#if shippingData.allowedCountries.length > 0}
			<div class:modal-section={!!shippingData.freeShipping || !!shippingData.domestic || !!shippingData.international || !!shippingData.deliveryDays}>
				<div class="modal-section-title">Ships to</div>
				<div class="pill-wrap">
					{#each shippingData.allowedCountries as country}
						<span class="tag-pill">{country}</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if shippingData.excludedCountries.length > 0}
			<div class="modal-section">
				<div class="modal-section-title">Does not ship to</div>
				<div class="pill-wrap">
					{#each shippingData.excludedCountries as country}
						<span class="tag-pill tag-pill--warning">{country}</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if !shippingData.freeShipping && !shippingData.domestic && !shippingData.international && shippingData.allowedCountries.length === 0}
			<div class="empty-state">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
				<p>Contact the seller for shipping information.</p>
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'payment'}
	<FooterModal title="Payment Methods" subtitle={paymentSubtitle} onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
		{/snippet}

		{#if paymentMethods.length === 0}
			<div class="empty-state">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
				<p>No payment methods configured.</p>
			</div>
		{:else}
			{#each paymentMethods as pm}
				<div class="info-card" style="margin-bottom: var(--space-3);">
					<div class="icon-row">
						<div class="icon-circle" style="background: {pm.method.color}20; color: {pm.method.color};">
							{#if pm.method.id === 'bitcoin'}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
							{:else}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
							{/if}
						</div>
						<div>
							<div class="detail-value">{pm.method.name}</div>
							{#if pm.method.id === 'bitcoin'}
								<div class="detail-label">Pay via Lightning Network. Instant, low-fee payments accepted worldwide.</div>
							{:else}
								<div class="detail-label">{pm.method.description}</div>
							{/if}
						</div>
					</div>
					{#if pm.method.type === 'fiat' && pm.method.currencies.length > 0}
						<div style="margin-top: var(--space-2); padding-left: 48px;">
							<div class="pill-wrap">
								{#each pm.method.currencies as cur}
									<span class="tag-pill">{cur}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</FooterModal>

{:else if activeModal === 'returns'}
	<FooterModal title="Returns & Refunds" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
		{/snippet}

		{#if returnsContent}
			<div class="modal-prose">
				{#each returnsContent.split('\n\n') as paragraph}
					<p>{paragraph}</p>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
				<p>The seller has not provided a returns & refunds policy.</p>
				<p class="empty-state-sub">Contact the seller if you have questions.</p>
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'warranty'}
	<FooterModal title="Warranty" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
		{/snippet}

		{#if warrantyContent}
			<div class="modal-prose">
				{#each warrantyContent.split('\n\n') as paragraph}
					<p>{paragraph}</p>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
				<p>The seller has not provided warranty information.</p>
				<p class="empty-state-sub">Contact the seller if you have questions.</p>
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'faq'}
	<FooterModal title="Frequently Asked Questions" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
		{/snippet}

		{#if faqContent}
			{#if faqPairs}
				<div class="faq-list">
					{#each faqPairs as pair}
						<div class="faq-item">
							<div class="faq-question">
								<div class="faq-q-icon">Q</div>
								<div class="detail-value">{pair.question}</div>
							</div>
							<div class="faq-answer">
								<div class="detail-label">{pair.answer}</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="modal-prose">
					{#each faqContent.split('\n\n') as paragraph}
						<p>{#each paragraph.split('\n') as line, i}{#if i > 0}<br>{/if}{line}{/each}</p>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="empty-state">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
				<p>The seller has not provided an FAQ.</p>
				<p class="empty-state-sub">Contact the seller if you have questions.</p>
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'whatIsNowhere'}
	<FooterModal title="What is Nowhere?" subtitle="Decentralized, censorship-resistant e-commerce" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
		{/snippet}

		<div class="modal-prose">
			<p>Nowhere is an e-commerce protocol — not a platform. There are no servers, no databases, and no accounts. Every store is encoded directly into its URL - when you open a store link, your browser decodes and renders it locally.</p>
			<p>Because stores live in their URLs, there is nothing to host and nothing to take down. No third party can censor, modify, or shut down a store. The seller controls everything - their products, prices, policies, and how they receive payments.</p>
			<p>There are no platform fees, no middlemen, and no gatekeepers. Nowhere is built on open protocols and is completely free to use. Orders are encrypted so that only the seller can read them - no one else can see what you ordered or who you are.</p>
			<p>Want to try it yourself? The store builder is free and easy to use. You can create and share your own store in minutes - <a href="/create/store" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); text-decoration: underline;">start building your store</a>.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'howItWorks'}
	<FooterModal title="How it Works" subtitle="The technology behind Nowhere" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
		{/snippet}

		<div class="modal-prose">
			<p>Every Nowhere store is a compact data structure - products, prices, images, settings - encoded directly into a URL. When you open a store link, your browser decodes this data and renders the store entirely client-side. No server is involved in displaying the store.</p>
			<p>Orders are placed using the Nostr protocol, a decentralized communication network. When you check out, your order details are encrypted with the seller's public key and published to the network's relays. Only the seller has the private key needed to decrypt and read your order. When an order is broadcast, the network can see that a Nowhere purchase was made - but it is impossible to tell which store it was for, who placed it, or what was ordered.</p>
			<p>Seller identity and store integrity are verified using deterministic phrases derived from cryptographic fingerprints. The seller phrase identifies the seller across all their stores. The store phrase confirms a specific store URL hasn't been modified. Both are computed locally with no network calls.</p>
			<p>There are no central servers or databases, and no platform operator handling your data. Everything runs in your browser, and all communication happens over decentralized relays. The result is a fully peer-to-peer shopping experience with cryptographic guarantees of privacy and authenticity.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'privacy'}
	<FooterModal title="Privacy" subtitle="Private by design" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
		{/snippet}

		<div class="modal-prose" style="margin-bottom: var(--space-4);">
			<p>Nowhere is private by design. Your shopping activity is between you and the seller. Nobody else can see it.</p>
		</div>

		<div class="feature-list">
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">No accounts required</div>
					<div class="detail-label">Neither buyers nor sellers need to create accounts.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">No tracking</div>
					<div class="detail-label">There are no analytics, cookies, or fingerprinting.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Serverless catalogue</div>
					<div class="detail-label">Store catalogue, item names, and descriptions are never stored on a server.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Client-side only</div>
					<div class="detail-label">Everything runs in your browser.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Encrypted orders</div>
					<div class="detail-label">Your order details are encrypted and only the seller has the keys to read them.</div>
				</div>
			</div>
		</div>
	</FooterModal>

{:else if activeModal === 'openSource'}
	<FooterModal title="Open Source" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
		{/snippet}

		<div class="modal-prose" style="margin-bottom: var(--space-4);">
			<p>Nowhere is open source. All the code is publicly available and can be reviewed by anyone. Transparency is a core principle. If you can't inspect it, you can't trust it.</p>
		</div>

		<div class="feature-list">
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Verify the software</div>
					<div class="detail-label">You can verify exactly what the software does.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">No hidden features</div>
					<div class="detail-label">There are no hidden features or secret data collection.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Security audits</div>
					<div class="detail-label">Anyone can audit the code for security.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Host it yourself</div>
					<div class="detail-label">The Nowhere code is open source, so anyone can run their own instance. Store links are universal - they work on any site running the Nowhere software, not just <a href="https://nowhr.xyz" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); text-decoration: underline;">nowhr.xyz</a>.</div>
				</div>
			</div>
		</div>
	</FooterModal>

{:else if activeModal === 'sellerVerification'}
	<FooterModal title="Seller Verification" subtitle="Cryptographic identity verification" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
		{/snippet}

		<div class="modal-prose" style="margin-bottom: var(--space-4);">
			<p>Nowhere uses verification phrases instead of identity checks. No profiles are fetched and no network calls are made. Two types of phrases help you verify stores:</p>
		</div>

		<div class="feature-list" style="margin-bottom: var(--space-4);">
			<div class="feature-item">
				<div class="feature-check" style="background: color-mix(in srgb, #6366f1 12%, transparent); color: #6366f1;">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
				</div>
				<div>
					<div class="detail-value">Seller phrase</div>
					<div class="detail-label">Derived from the seller's public key. Stable across all stores from the same seller. Use it to recognize someone you've bought from before.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Store phrase</div>
					<div class="detail-label">Derived from the store contents. Unique to this URL. Confirms the link hasn't been modified.</div>
				</div>
			</div>
			<div class="feature-item">
				<div class="feature-check">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
				<div>
					<div class="detail-value">Offline & private</div>
					<div class="detail-label">All phrases are computed locally. No network requests, no relay queries, no privacy leaks.</div>
				</div>
			</div>
		</div>

		{#if signed && verification}
			<div class="info-card info-card--accent" style="--accent-color: #6366f1;">
				<div class="icon-row">
					<div class="icon-circle" style="background: color-mix(in srgb, #6366f1 15%, transparent); color: #6366f1;">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
					</div>
					<div>
						<div class="detail-label">Seller phrase</div>
						<div class="detail-value" style="font-family: var(--font-mono); font-size: var(--text-xs);">{verification.sellerPhrase}</div>
					</div>
				</div>
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'paymentSecurity'}
	<FooterModal title="Payment Security" subtitle="How payments work on Nowhere" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		{/snippet}

		<div class="info-card" style="margin-bottom: var(--space-3);">
			<div class="icon-row">
				<div class="icon-circle" style="background: #f7931a20; color: #f7931a;">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
				</div>
				<div>
					<div class="detail-value">Bitcoin / Lightning</div>
					<div class="detail-label">Near-instant, irreversible payments. No payment information stored. Invoices generated fresh for each transaction.</div>
				</div>
			</div>
		</div>

		<div class="info-card" style="margin-bottom: var(--space-4);">
			<div class="icon-row">
				<div class="icon-circle">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
				</div>
				<div>
					<div class="detail-value">Fiat Methods</div>
					<div class="detail-label">Payment details provided directly by the seller. Transactions happen through existing banking infrastructure. Nowhere never handles funds.</div>
				</div>
			</div>
		</div>

		<div class="modal-prose">
			<p>Lightning payments are private, fast, cheap, and settle instantly. They can be fully self-custodial. Fiat payments are processed through the seller's chosen payment provider. Nowhere never touches your money.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'storeIntegrity'}
	<FooterModal title="Store Integrity" subtitle="Cryptographic tamper detection" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
		{/snippet}

		<div class="modal-prose" style="margin-bottom: var(--space-4);">
			<p>Every Nowhere store has a unique verification phrase derived from a cryptographic hash of its contents. It is impossible to alter any aspect of a store without changing its verification phrase. Any modification to prices, products, images, or settings produces a new hash and a new phrase.</p>
		</div>

		<div class="icon-row" style="margin-bottom: var(--space-3);">
			<div class="icon-circle icon-circle--warning">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
			</div>
			<div>
				<div class="detail-value">Verifiable</div>
				<div class="detail-label">You can verify the store hasn't been modified since the seller published it.</div>
			</div>
		</div>

		<div class="icon-row" style="margin-bottom: var(--space-3);">
			<div class="icon-circle icon-circle--warning">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
			</div>
			<div>
				<div class="detail-value">Cryptographically signed</div>
				<div class="detail-label">Verified stores have had their fingerprint confirmed by the seller's cryptographic key.</div>
			</div>
		</div>

		<div class="icon-row">
			<div class="icon-circle icon-circle--warning">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
			</div>
			<div>
				<div class="detail-value">Verification phrase</div>
				<div class="detail-label">A seller may not publicly verify their store on Nostr, but they can share a verification phrase with you directly. If the phrase matches, you can be sure the store is authentic.</div>
			</div>
		</div>

		{#if verification}
			<div class="modal-section">
				{#if verification.storePhrase}
					<div class="info-card info-card--accent" style="margin-bottom: var(--space-2);">
						<div class="icon-row">
							<div class="icon-circle icon-circle--success">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							</div>
							<div>
								<div class="detail-label">Store phrase</div>
								<div class="detail-value" style="font-family: var(--font-mono); font-size: var(--text-xs);">{verification.storePhrase}</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'orderIssues'}
	<FooterModal title="Order Issues" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		{/snippet}

		<div class="step-list" style="margin-bottom: var(--space-4);">
			<div class="step-item">
				<div class="step-text">
					<div class="detail-value">Contact the seller</div>
					<div class="detail-label">Check the store for contact information.</div>
				</div>
			</div>
			<div class="step-item">
				<div class="step-text">
					<div class="detail-value">Keep your order ID</div>
					<div class="detail-label">Keep your order ID and any payment receipts. These are your reference for any communication with the seller.</div>
				</div>
			</div>
			<div class="step-item">
				<div class="step-text">
					<div class="detail-value">Be patient</div>
					<div class="detail-label">Sellers on Nowhere are independent merchants and may have different response times.</div>
				</div>
			</div>
		</div>

		<div class="info-card info-card--accent">
			<div class="icon-row">
				<div class="icon-circle">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
				</div>
				<div>
					<div class="detail-value" style="margin-bottom: var(--space-2);">Important</div>
					<div class="detail-label">Nowhere is a protocol, not a marketplace. Nowhere cannot access any store information or order data. Nowhere has no way to contact sellers on your behalf. Nowhere cannot assist with orders, refunds, or disputes. All customer service is handled directly by individual sellers.</div>
				</div>
			</div>
		</div>
	</FooterModal>

{:else if activeModal === 'contact'}
	<FooterModal title="Contact" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
		{/snippet}

		{#if contactData.nostrContact}
			<div class="info-card" style="margin-bottom: var(--space-3);">
				<div class="icon-row">
					<div class="icon-circle">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
					</div>
					<div>
						<div class="detail-value">{store.name || 'Anonymous'}</div>
						<div class="detail-label">This seller can be contacted via Nostr.</div>
					</div>
				</div>
			</div>
		{/if}

		{#if contactData.email}
			<div class="info-card" style="margin-bottom: var(--space-3);">
				<div class="icon-row">
					<div class="icon-circle">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
					</div>
					<div>
						<div class="detail-value">{contactData.email}</div>
						<div class="detail-label">Contact this seller at {contactData.email}</div>
					</div>
				</div>
			</div>
		{/if}

		{#if contactData.methods.length > 0}
			{#each contactData.methods as entry}
				{@const platform = platformByCode.get(entry.code)}
				{#if entry.code === CUSTOM_CODE && entry.handle}
					<div class="info-card" style="margin-bottom: var(--space-3);">
						<div class="icon-row">
							<div class="icon-circle">
								{@html CUSTOM_ICON}
							</div>
							<div>
								<div class="detail-value">{entry.handle}</div>
								<div class="detail-label">{entry.customName || 'Other'}</div>
							</div>
						</div>
					</div>
				{:else if platform && entry.handle}
					<div class="info-card" style="margin-bottom: var(--space-3);">
						<div class="icon-row">
							<div class="icon-circle">
								{@html platform.icon}
							</div>
							<div>
								<div class="detail-value">{entry.handle}</div>
								<div class="detail-label">{platform.name}</div>
							</div>
						</div>
					</div>
				{/if}
			{/each}
		{/if}

		{#if !contactData.nostrContact && !contactData.email && contactData.methods.length === 0}
			<div class="empty-state">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
				<p>This seller has not provided contact details.</p>
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'verificationPhrase'}
	<FooterModal title="Verification Phrase" subtitle="Verify store authenticity" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		{/snippet}

		<div class="modal-prose" style="margin-bottom: var(--space-4);">
			<p>Nowhere uses two types of verification phrases. The <strong>seller phrase</strong> is derived from the seller's public key and is the same across all their stores — use it to recognize a seller you've bought from before. The <strong>store phrase</strong> is derived from the store contents and confirms the URL hasn't been modified.</p>
			<p>If the phrase a seller shares matches what you see here, you can trust the store is authentic. Phrases come in lengths from 3 to 12 words. Longer phrases are harder to forge.</p>
		</div>

		{#if aboutData.sellerPhrase}
			<div class="info-card info-card--accent" style="--accent-color: #6366f1; margin-bottom: var(--space-2);">
				<div class="icon-row">
					<div class="icon-circle" style="background: color-mix(in srgb, #6366f1 15%, transparent); color: #6366f1;">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
					</div>
					<div>
						<div class="detail-label">Seller phrase ({aboutData.defaultPhraseLength} words)</div>
						<div class="detail-value" style="font-family: var(--font-mono); font-size: var(--text-xs);">{aboutData.sellerPhrase}</div>
					</div>
				</div>
			</div>
		{/if}

		{#if aboutData.storePhrase}
			<div class="info-card info-card--accent">
				<div class="icon-row">
					<div class="icon-circle icon-circle--success">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					</div>
					<div>
						<div class="detail-label">Store phrase ({aboutData.defaultPhraseLength} words)</div>
						<div class="detail-value" style="font-family: var(--font-mono); font-size: var(--text-xs);">{aboutData.storePhrase}</div>
					</div>
				</div>
			</div>

			{#if aboutData.allStorePhrases}
				<details class="all-phrases-section">
					<summary class="all-phrases-toggle">See all phrase lengths</summary>
					<div class="all-phrases-list">
						{#if aboutData.allSellerPhrases}
							<div class="detail-label" style="font-weight: 600; margin-bottom: var(--space-1);">Seller phrases</div>
							{#each [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as wordCount}
								<div class="phrase-length-item" class:is-default={wordCount === aboutData.defaultPhraseLength}>
									<div class="phrase-length-header">
										<span class="phrase-length-label">{wordCount} words</span>
										{#if wordCount === aboutData.defaultPhraseLength}
											<span class="phrase-default-badge">default</span>
										{/if}
										<span class="phrase-crack-time">{GPU_CRACK_TIMES[wordCount]}</span>
									</div>
									<div class="phrase-length-value">{aboutData.allSellerPhrases[wordCount]}</div>
								</div>
							{/each}
						{/if}
						<div class="detail-label" style="font-weight: 600; margin: var(--space-3) 0 var(--space-1);">Store phrases</div>
						{#each [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as wordCount}
							<div class="phrase-length-item" class:is-default={wordCount === aboutData.defaultPhraseLength}>
								<div class="phrase-length-header">
									<span class="phrase-length-label">{wordCount} words</span>
									{#if wordCount === aboutData.defaultPhraseLength}
										<span class="phrase-default-badge">default</span>
									{/if}
									<span class="phrase-crack-time">{GPU_CRACK_TIMES[wordCount]}</span>
								</div>
								<div class="phrase-length-value">{aboutData.allStorePhrases[wordCount]}</div>
							</div>
						{/each}
					</div>
				</details>
			{/if}
		{:else}
			<div class="info-card">
				<div class="icon-row">
					<div class="icon-circle">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
					</div>
					<div>
						<div class="detail-label">The verification phrase is generated from the store's cryptographic fingerprint. It will appear here once the store data has been processed.</div>
					</div>
				</div>
			</div>
		{/if}
	</FooterModal>
{/if}

<style>
	.store-footer {
		background: var(--color-bg-secondary);
		border-top: 1px solid var(--color-border);
		margin-top: var(--space-8);
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4);
	}

	.footer-columns {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-6);
	}

	.footer-col h4 {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-3);
	}

	.footer-col ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.footer-col button {
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		text-align: left;
		transition: color var(--transition-fast);
	}

	.footer-col button:hover {
		color: var(--color-text);
	}

	.footer-bottom {
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
		text-align: center;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.footer-link {
		color: var(--color-text-muted);
		text-decoration: none;
		transition: color var(--transition-fast);
	}

	.footer-link:hover {
		color: var(--color-text);
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.footer-columns {
			grid-template-columns: repeat(2, 1fr);
		}
	}


	/* ============ MODAL SHARED STYLES ============ */

	/* Base paragraph spacing */
	:global(.modal-body p) {
		margin-bottom: var(--space-3);
	}
	:global(.modal-body p:last-child) {
		margin-bottom: 0;
	}

	/* Section with top border separator */
	:global(.modal-body .modal-section) {
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}
	:global(.modal-body > :first-child) {
		border-top: none;
		margin-top: 0;
		padding-top: 0;
	}

	/* Uppercase xs label */
	:global(.modal-body .modal-section-title) {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	/* Rounded background box for grouping */
	:global(.modal-body .info-card) {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}

	/* Left border accent variant */
	:global(.modal-body .info-card--accent) {
		border-left: 3px solid var(--accent-color, var(--color-primary));
	}

	/* Flex row: icon circle + text */
	:global(.modal-body .icon-row) {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	/* Circle for icon */
	:global(.modal-body .icon-circle) {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background: var(--color-bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	:global(.modal-body .icon-circle--success) {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
	}

	:global(.modal-body .icon-circle--warning) {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		color: var(--color-warning);
	}

	/* Profile avatar in about modal */
	:global(.modal-body .profile-avatar) {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		object-fit: cover;
		flex-shrink: 0;
	}

	/* Small label + bold value */
	:global(.modal-body .detail-label) {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.5;
	}
	:global(.modal-body .detail-value) {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		line-height: 1.4;
	}

	/* Inline pill badges */
	:global(.modal-body .tag-pill) {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 500;
		background: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
	}
	:global(.modal-body .tag-pill--success) {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
	}
	:global(.modal-body .tag-pill--warning) {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		color: var(--color-warning);
	}

	/* Pill wrap for groups */
	:global(.modal-body .pill-wrap) {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	/* Numbered step list with CSS counter circles */
	:global(.modal-body .step-list) {
		counter-reset: step;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	:global(.modal-body .step-item) {
		counter-increment: step;
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}
	:global(.modal-body .step-item::before) {
		content: counter(step);
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: var(--color-primary-text);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-xs);
		font-weight: 700;
		flex-shrink: 0;
		margin-top: 2px;
	}
	:global(.modal-body .step-text) {
		flex: 1;
		min-width: 0;
	}

	/* Feature list with checkmark bullets */
	:global(.modal-body .feature-list) {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	:global(.modal-body .feature-item) {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}
	:global(.modal-body .feature-check) {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-top: 2px;
	}

	/* 2-column grid, collapses to 1 on mobile */
	:global(.modal-body .two-col) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
	:global(.modal-body .two-col.single) {
		grid-template-columns: 1fr;
	}
	@media (max-width: 480px) {
		:global(.modal-body .two-col) {
			grid-template-columns: 1fr;
		}
	}

	/* FAQ Q&A list */
	:global(.modal-body .faq-list) {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	:global(.modal-body .faq-item) {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}

	:global(.modal-body .faq-question) {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	:global(.modal-body .faq-q-icon) {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: 700;
	}

	:global(.modal-body .faq-answer) {
		padding-left: 32px;
	}

	/* Styled prose for freeform text */
	:global(.modal-body .modal-prose) {
		color: var(--color-text-secondary);
		line-height: 1.7;
	}
	:global(.modal-body .modal-prose p) {
		margin-bottom: var(--space-3);
	}
	:global(.modal-body .modal-prose p:last-child) {
		margin-bottom: 0;
	}

	/* Empty state styling */
	:global(.modal-body .empty-state) {
		text-align: center;
		padding: var(--space-6) var(--space-4);
		color: var(--color-text-muted);
	}
	:global(.modal-body .empty-state svg) {
		margin-bottom: var(--space-3);
		opacity: 0.4;
	}
	:global(.modal-body .empty-state p) {
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
	}
	:global(.modal-body .empty-state .empty-state-sub) {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	/* All phrase lengths expandable section */
	:global(.modal-body .all-phrases-section) {
		margin-top: var(--space-3);
	}
	:global(.modal-body .all-phrases-toggle) {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: var(--space-2) 0;
	}
	:global(.modal-body .all-phrases-toggle:hover) {
		color: var(--color-text);
	}
	:global(.modal-body .all-phrases-list) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	:global(.modal-body .phrase-length-item) {
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
		border-left: 3px solid transparent;
	}
	:global(.modal-body .phrase-length-item.is-default) {
		border-left-color: var(--color-success);
		background: color-mix(in srgb, var(--color-success) 5%, var(--color-bg-secondary));
	}
	:global(.modal-body .phrase-length-header) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}
	:global(.modal-body .phrase-length-label) {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	:global(.modal-body .phrase-default-badge) {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-success);
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
	}
	:global(.modal-body .phrase-crack-time) {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-left: auto;
	}
	:global(.modal-body .phrase-length-value) {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text);
		overflow-wrap: break-word;
		word-break: normal;
	}
</style>

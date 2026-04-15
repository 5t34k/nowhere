<script lang="ts">
	import type { FundraiserData, Tag } from '@nowhere/codec';
	import type { TipMethod } from '$lib/tips.js';
	import { parseContacts, platformByCode } from '$lib/contacts.js';
	import FooterModal from '$lib/renderer/store/FooterModal.svelte';

	interface Props {
		data: FundraiserData;
		tipMethods: TipMethod[];
		authorPhrase: string;
		campaignPhrase: string;
		signed: boolean;
		fingerprint: string;
		onshareqr?: () => void;
		onmobileshare?: () => void;
		canNativeShare?: boolean;
	}

	let { data, tipMethods, authorPhrase, campaignPhrase, signed, fingerprint, onshareqr, onmobileshare, canNativeShare = false }: Props = $props();

	let activeModal = $state<string | null>(null);

	function getTag(key: string): string {
		return data.tags.find((t: Tag) => t.key === key)?.value ?? '';
	}
	function hasTag(key: string): boolean {
		return data.tags.some((t: Tag) => t.key === key);
	}

	function open(key: string) {
		activeModal = key;
	}

	// Contact data
	const contactsRaw = $derived(getTag('j'));
	const contactEmail = $derived(getTag('I'));
	const nostrContact = $derived(hasTag('G') && signed);
	const contacts = $derived(contactsRaw ? parseContacts(contactsRaw) : []);

</script>

<footer class="fr-footer">
	<div class="fr-footer-content">
		<div class="fr-footer-columns">
			<div class="fr-footer-col">
				<h4>Campaign</h4>
				<ul>
					<li><button onclick={() => open('about')}>About this Campaign</button></li>
					<li><button onclick={() => open('contact')}>Contact the Creator</button></li>
					<li><button onclick={() => open('share')}>Share this Campaign</button></li>
					<li><button onclick={() => open('howToVerify')}>How to Verify</button></li>
				</ul>
			</div>

			<div class="fr-footer-col">
				<h4>Help</h4>
				<ul>
					<li><button onclick={() => open('donationMethods')}>Donation Methods</button></li>
					<li><button onclick={() => open('howDonationsWork')}>How Donations Work</button></li>
					<li><button onclick={() => open('donorSafety')}>Donor Safety</button></li>
					<li><button onclick={() => open('reportFraud')}>Report Fraud</button></li>
				</ul>
			</div>

			<div class="fr-footer-col">
				<h4>Nowhere</h4>
				<ul>
					<li><button onclick={() => open('whatIsNowhere')}>What is Nowhere?</button></li>
					<li><button onclick={() => open('howItWorks')}>How it Works</button></li>
					<li><button onclick={() => open('censorshipResistance')}>Censorship Resistance</button></li>
					<li><button onclick={() => open('openSource')}>Open Source</button></li>
				</ul>
			</div>

			<div class="fr-footer-col">
				<h4>Trust</h4>
				<ul>
					<li><button onclick={() => open('creatorVerification')}>Creator Verification</button></li>
					<li><button onclick={() => open('campaignIntegrity')}>Campaign Integrity</button></li>
					<li><button onclick={() => open('verificationPhrase')}>Verification Phrase</button></li>
					<li><button onclick={() => open('signingKeys')}>Signing Keys</button></li>
				</ul>
			</div>
		</div>

		<div class="fr-footer-bottom">
			<span>{data.name} &middot; Powered by <a href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer" class="fr-footer-link">Nowhere</a></span>
		</div>
	</div>
</footer>

<!-- ============ MODALS ============ -->

{#if activeModal === 'about'}
	<FooterModal title="About this Campaign" subtitle={data.description ? 'Read the full story above' : undefined} onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p><strong>{data.name}</strong> is a fundraiser campaign created with Nowhere, a protocol that encodes content entirely inside the URL. No servers, databases, or intermediaries.</p>
			<p>This campaign page was created by its author and encoded into a shareable link. No one can modify, censor, or take it down.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'contact'}
	<FooterModal title="Contact the Creator" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
		{/snippet}
		{#if nostrContact}
			<p style="margin-bottom: 0.75rem;">This creator can be contacted via <strong>Nostr</strong>.</p>
		{/if}
		{#if contactEmail}
			<p style="margin-bottom: 0.75rem;">Email: <a href="mailto:{contactEmail}">{contactEmail}</a></p>
		{/if}
		{#each contacts as entry}
			{@const platform = platformByCode.get(entry.code)}
			{#if platform}
				<p style="margin-bottom: 0.5rem;">{platform.name}: <strong>{entry.handle}</strong></p>
			{/if}
		{/each}
		{#if !nostrContact && !contactEmail && contacts.length === 0}
			<p>No contact information provided.</p>
		{/if}
	</FooterModal>

{:else if activeModal === 'share'}
	<FooterModal title="Share this Campaign" subtitle="Help spread the word" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>This campaign lives entirely in its URL. The link is the page. Share it anywhere and it will work instantly, with no account or app required.</p>
			<p>Copy the full URL from your browser's address bar and send it via messaging apps, email, or social media. You can also use your browser's share button or generate a QR code from the link.</p>
			<p>Every share is a direct copy of the campaign. It cannot be altered in transit.</p>
		</div>
		<div class="share-actions">
			{#if onshareqr}
				<button class="share-action-btn" onclick={() => { activeModal = null; onshareqr?.(); }}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
					Show QR code
				</button>
			{/if}
			{#if canNativeShare && onmobileshare}
				<button class="share-action-btn" onclick={() => { activeModal = null; onmobileshare?.(); }}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
					Share via...
				</button>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'howToVerify'}
	<FooterModal title="How to Verify" subtitle="Confirming this campaign is authentic" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>1. <strong>Check the signing status.</strong> A signed campaign means the creator used a private key to prove authorship. An unsigned campaign has no cryptographic proof of origin.</p>
			<p>2. <strong>Compare the verification phrase.</strong> The creator's verification phrase is derived from their public key. If you know the creator, ask them to confirm their phrase matches what is shown here.</p>
			<p>3. <strong>Check the campaign phrase.</strong> The campaign verification phrase is derived from the entire campaign contents. If anything has been tampered with, the phrase will not match what the creator originally published.</p>
			<p>4. <strong>Contact the creator directly.</strong> Use the contact details on this page to reach the creator through a channel you already trust.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'donationMethods'}
	<FooterModal title="Donation Methods" subtitle="Ways to support this campaign" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
		{/snippet}
		{#if tipMethods.length > 0}
			{#each tipMethods as method}
				<div style="margin-bottom: 0.75rem;">
					<p><strong>{method.label}</strong></p>
					<p style="font-size: 0.85rem; color: var(--color-text-secondary, #555); word-break: break-all;">{method.value}</p>
				</div>
			{/each}
		{:else}
			<p>No donation methods have been listed for this campaign. Contact the creator directly to ask how you can contribute.</p>
		{/if}
	</FooterModal>

{:else if activeModal === 'howDonationsWork'}
	<FooterModal title="How Donations Work" subtitle="Direct, no intermediary" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>Nowhere does not process, hold, or take a cut of any donations. When you donate, your payment goes directly to the creator using whichever payment method they have listed.</p>
			<p>Nowhere has no visibility into whether a donation was made or received. There is no escrow, no refund mechanism, and no dispute mechanism built into the system.</p>
			<p>Before donating, verify the creator's identity and only use payment methods you are comfortable with.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'donorSafety'}
	<FooterModal title="Donor Safety" subtitle="Protecting yourself before you give" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p><strong>Verify the creator.</strong> Check that the campaign is signed and that the verification phrase matches what the creator has published elsewhere.</p>
			<p><strong>Double-check payment addresses.</strong> Before sending, confirm that the payment address or handle belongs to the person you intend to pay. Once sent, payments cannot be reversed.</p>
			<p><strong>Understand the process.</strong> Donations are sent directly to the creator with no intermediary. There is no built-in refund or dispute mechanism.</p>
			<p><strong>Be cautious of urgency.</strong> Legitimate campaigns rarely pressure donors with artificial deadlines or threats.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'reportFraud'}
	<FooterModal title="Report Fraud" subtitle="What to do if something seems wrong" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>If you believe this campaign is fraudulent, we understand your concern. It is important to be transparent about what Nowhere can and cannot do.</p>
			<p><strong>Nowhere cannot remove this campaign.</strong> Nowhere has no servers and no ability to take down content. The campaign exists entirely in its URL, which anyone can copy and reshare. There is no central authority to report to.</p>
			<p>This is by design: the same property that protects legitimate creators from censorship also means fraudulent campaigns cannot be deplatformed.</p>
			<p><strong>What you can do:</strong> do not donate, warn others through your own channels, and if applicable, report the payment address to the relevant payment network or financial service.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'whatIsNowhere'}
	<FooterModal title="What is Nowhere?" subtitle="A protocol with no servers" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>Nowhere is a protocol that encodes everything inside the URL, including stores, messages, and fundraisers. There are no servers, no databases, and no accounts. Your campaign is compressed and stored in the link itself.</p>
			<p>When someone opens your link, the page is rendered directly in their browser. Nothing is fetched from a server. Nothing can be censored or taken down.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'howItWorks'}
	<FooterModal title="How it Works" subtitle="From link to page" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>1. The creator builds a fundraiser page and all data is encoded into a compact URL fragment.</p>
			<p>2. The link is shared through social media, messaging, email, or QR code.</p>
			<p>3. When opened, the browser decodes and renders the page. No server involved.</p>
			<p>4. Donations are sent directly to the creator via their listed payment methods.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'censorshipResistance'}
	<FooterModal title="Censorship Resistance" subtitle="Why this campaign cannot be taken down" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>Because this campaign exists entirely within its URL, there is no server to shut down, no account to ban, and no hosting provider to pressure. Anyone who has the link can open the campaign, at any time, forever.</p>
			<p>Nowhere has no ability to deplatform creators, freeze funds, or alter campaign content after publishing. The creator's message is permanent and unmodifiable by any third party.</p>
			<p>This makes Nowhere particularly suited to fundraising in situations where access to traditional platforms may be restricted or unreliable.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'openSource'}
	<FooterModal title="Open Source" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>Nowhere is fully open source. The codec, builder, and renderer are all publicly available for review, audit, and contribution.</p>
			<p>You can verify that the code does exactly what it claims — no hidden tracking, no backdoors, no data collection.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'creatorVerification'}
	<FooterModal title="Creator Verification" subtitle="How trust works on Nowhere" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
		{/snippet}
		<div class="modal-prose">
			{#if signed}
				<p>This campaign was <strong>cryptographically signed</strong> by its creator. The verification phrase next to the creator's name is derived from their public key. If it matches what you expect, the creator is who they claim to be.</p>
			{:else}
				<p>This campaign was <strong>not signed</strong>. The creator's identity cannot be cryptographically verified. Exercise caution.</p>
			{/if}
			<p>Verification phrases are computed locally in your browser. No network requests are made.</p>
		</div>
		{#if signed && authorPhrase}
			<div style="margin-top: 1rem; padding: 0.75rem; background: var(--color-bg-secondary, #f5f5f5); border-radius: 8px; font-family: monospace; font-size: 0.8rem; word-break: break-all;">
				Creator: {authorPhrase}
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'campaignIntegrity'}
	<FooterModal title="Campaign Integrity" subtitle="Cryptographic tamper detection" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>Every Nowhere fundraiser has a unique verification phrase derived from its contents. Any modification to the campaign name, story, goal, or settings would produce a completely different phrase.</p>
			{#if signed}
				<p>This campaign was signed by its creator. The signature proves that the person who controls the creator's private key authored this exact campaign. If the content were altered after signing, the signature would be invalid.</p>
			{:else}
				<p>This campaign was not signed. Without a signature, there is no cryptographic proof that the contents have not been modified since the campaign was first created.</p>
			{/if}
			<p>Together, the verification phrase and the creator's signature ensure that the page you see is exactly what the creator published.</p>
		</div>
		{#if campaignPhrase}
			<div style="margin-top: 1rem; padding: 0.75rem; background: var(--color-bg-secondary, #f5f5f5); border-radius: 8px; font-family: monospace; font-size: 0.8rem; word-break: break-all;">
				Campaign: {campaignPhrase}
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'verificationPhrase'}
	<FooterModal title="Verification Phrase" subtitle="Human-readable fingerprint" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>Verification phrases are human-readable representations of cryptographic fingerprints. They make it easy to compare identities and detect tampering. Just compare the words.</p>
			<p>All phrases are computed locally in your browser. No network requests, no relay queries, no privacy leaks.</p>
		</div>
		{#if authorPhrase}
			<div style="margin-top: 1rem; padding: 0.75rem; background: var(--color-bg-secondary, #f5f5f5); border-radius: 8px; font-family: monospace; font-size: 0.8rem; word-break: break-all;">
				<div style="margin-bottom: 0.5rem;"><strong>Creator:</strong> {authorPhrase}</div>
				{#if campaignPhrase}
					<div><strong>Campaign:</strong> {campaignPhrase}</div>
				{/if}
			</div>
		{/if}
	</FooterModal>

{:else if activeModal === 'signingKeys'}
	<FooterModal title="Signing Keys" subtitle="How authorship is proved" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
		{/snippet}
		<div class="modal-prose">
			<p>A signing key is a pair of cryptographic keys: a <strong>private key</strong> known only to the creator, and a <strong>public key</strong> that anyone can see. When a creator signs a campaign, they use their private key to produce a signature that can be independently verified against their public key.</p>
			<p>This means you can confirm that the campaign was published by whoever controls that private key, without trusting any server or third party to vouch for them.</p>
			{#if signed}
				<p>This campaign <strong>has been signed</strong>. The creator's public key is embedded in the campaign and their verification phrase is shown on this page.</p>
			{:else}
				<p>This campaign <strong>has not been signed</strong>. There is no cryptographic proof of who created it.</p>
			{/if}
		</div>
	</FooterModal>
{/if}

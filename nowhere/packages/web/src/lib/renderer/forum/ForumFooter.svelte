<script lang="ts">
	import type { ForumData, Tag } from '@nowhere/codec';
	import FooterModal from '$lib/renderer/store/FooterModal.svelte';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import QRCode from 'qrcode';

	const LN_ADDRESS = 'zap@5t34k.com';
	const SP_ADDRESS = 'sp1qqdz0n37nynjd0vgtu3mw9ed2lkvqxma8taxwueqlf59ps28tu0chuq4e8cnwww2earptym8sgap4zr7uhruzla7f9y2p06k5kn8xqcsj35zzuyjx';

	interface CreatorProfile {
		npubFull: string; npubTruncated: string; avatarSvg: string;
		name: string; picture: string; nip05: string; nip05Verified: boolean | null;
	}

	interface Props {
		data: ForumData;
		verificationPhrase: string;
		creatorSellerPhrase: string;
		creatorProfile: CreatorProfile;
		privacyMode: number;
		signed: boolean;
		saltEnabled: boolean;
		identityMode: number;
		wotPostDepth: number | null;
		wotReplyDepth: number | null;
		wotChatDepth: number | null;
	}

	let { data, verificationPhrase, creatorSellerPhrase, creatorProfile, privacyMode, signed, saltEnabled, identityMode, wotPostDepth, wotReplyDepth, wotChatDepth }: Props = $props();

	let activeModal = $state<string | null>(null);
	let creatorNpubCopied = $state(false);
	let copiedLn = $state(false);
	let copiedSp = $state(false);
	let lnQrDataUrl = $state('');
	let spQrDataUrl = $state('');

	async function copyCreatorNpub() {
		try {
			await navigator.clipboard.writeText(creatorProfile.npubFull);
			creatorNpubCopied = true;
			setTimeout(() => { creatorNpubCopied = false; }, 2000);
		} catch {}
	}

	async function copyLn() {
		try {
			await navigator.clipboard.writeText(LN_ADDRESS);
			copiedLn = true;
			setTimeout(() => { copiedLn = false; }, 1500);
		} catch {}
	}

	async function copySp() {
		try {
			await navigator.clipboard.writeText(SP_ADDRESS);
			copiedSp = true;
			setTimeout(() => { copiedSp = false; }, 1500);
		} catch {}
	}

	$effect(() => {
		if (activeModal === 'supportNowhere' && !spQrDataUrl) {
			const qrOpts = { margin: 1, width: 360, color: { dark: '#1a1a1a', light: '#ffffff' } };
			QRCode.toDataURL(`bitcoin:${SP_ADDRESS}`, qrOpts).then((url) => (spQrDataUrl = url)).catch(() => {});
			QRCode.toDataURL(`lightning:${LN_ADDRESS}`, qrOpts).then((url) => (lnQrDataUrl = url)).catch(() => {});
		}
	});

	function getTag(key: string): string {
		return data.tags.find((t: Tag) => t.key === key)?.value ?? '';
	}

	function open(key: string) {
		activeModal = key;
	}

	const topicsRaw = $derived(getTag('O'));
	const customTopics = $derived(topicsRaw ? topicsRaw.split('\\p').filter(Boolean) : []);
	const wotEnabled = $derived(wotPostDepth !== null || wotReplyDepth !== null || wotChatDepth !== null);

	const identityModeLabel = $derived(() => {
		if (identityMode === 0) return 'Nostr extension required';
		if (identityMode === 2) return 'Anonymous posting only';
		return 'Nostr extension or anonymous';
	});
</script>

<footer class="ff-footer">
	<div class="ff-footer-content">
		<div class="ff-footer-columns">
			<div class="ff-footer-col">
				<h4>Community</h4>
				<ul>
					<li><button onclick={() => open('aboutForum')}>About this Forum</button></li>
					<li><button onclick={() => open('howPosting')}>How Posting Works</button></li>
					<li><button onclick={() => open('forumSalt')}>Forum Salt</button></li>
					<li><button onclick={() => open('webOfTrust')}>Web of Trust</button></li>
				</ul>
			</div>

			<div class="ff-footer-col">
				<h4>Privacy</h4>
				<ul>
					<li><button onclick={() => open('postEncryption')}>Post Encryption</button></li>
					<li><button onclick={() => open('relayAnonymity')}>Relay Anonymity</button></li>
					<li><button onclick={() => open('invisibleByDefault')}>Invisible by Default</button></li>
					<li><button onclick={() => open('ephemeralChats')}>Ephemeral Chats</button></li>
				</ul>
			</div>

			<div class="ff-footer-col">
				<h4>Nowhere</h4>
				<ul>
					<li><button onclick={() => open('whatIsNowhere')}>What is Nowhere?</button></li>
					<li><button onclick={() => open('censorshipResistance')}>Censorship Resistance</button></li>
					<li><button onclick={() => open('openSource')}>Open Source</button></li>
					<li><button onclick={() => open('startYourOwn')}>Start Your Own Forum</button></li>
				</ul>
			</div>

			<div class="ff-footer-col">
				<h4>Trust</h4>
				<ul>
					<li><button onclick={() => open('forumVerification')}>Forum Verification</button></li>
					<li><button onclick={() => open('signingKeys')}>Signing Keys</button></li>
					<li><button onclick={() => open('relayStorage')}>Relay Storage</button></li>
					<li><button onclick={() => open('howItWorks')}>How it Works</button></li>
				</ul>
			</div>
		</div>

		<div class="ff-footer-support">
			<p>Nowhere is free and open. If this forum has been useful, you can <button class="ff-support-link" onclick={() => open('supportNowhere')}>support its development</button>.</p>
		</div>

		<div class="ff-footer-bottom">
			<span>{data.name} &middot; Hosted <a href="https://hostednowhere.com" class="ff-footer-link">nowhere</a>. Present everywhere.</span>
		</div>
	</div>
</footer>

<!-- ============ MODALS ============ -->

{#if activeModal === 'aboutForum'}
	<FooterModal title="About this Forum" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p><strong>{data.name}</strong> is a nowhere community forum. The forum's rules, topics, and settings are encoded entirely in its URL. No server stores them and no company controls them.</p>
			{#if data.description}
				<p>{data.description}</p>
			{/if}
			{#if customTopics.length > 0}
				<p><strong>Topics:</strong> {customTopics.join(', ')}</p>
			{/if}
			<p><strong>Identity:</strong> {identityModeLabel()}</p>
			{#if saltEnabled}
				<p><strong>Salt:</strong> This forum has salt enabled, which provides additional privacy protection for posts and participants.</p>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'howPosting'}
	<FooterModal title="How Posting Works" subtitle="From browser to relay" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>1. <strong>Choose your identity.</strong> Depending on the forum settings, you can post with a Nostr signing extension (which ties posts to your public key) or anonymously with an ephemeral session key.</p>
			<p>2. <strong>Write your post.</strong> Your content stays in your browser until you submit.</p>
			<p>3. <strong>Encrypted and published.</strong> Before leaving your browser, your post is encrypted using keys derived from the forum link. The encrypted data is then published to Nostr relays.</p>
			<p>4. <strong>Readable only to members.</strong> Anyone with the forum link can derive the same keys and decrypt the posts. Without the link, the posts on the relays are unreadable ciphertext.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'forumSalt'}
	<FooterModal title="Forum Salt" subtitle="Privacy and lifecycle control" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Salt is an additional string appended to the forum's URL fragment before keys are derived. Because all encryption keys are derived from the fragment, adding or changing the salt produces a completely different set of keys, and therefore a completely different forum.</p>
			<p>This means the same link, shared with the same people, becomes a fresh forum when a new salt is applied. Old posts encrypted under the previous salt are invisible. Old participants cannot access the new space unless they are given the updated link.</p>
			<p><strong>Uses for salt rotation:</strong></p>
			<p>Reset a forum that has been overrun or compromised without changing the base link.</p>
			<p>Add a layer of access control. Only those given the salted link can participate.</p>
			{#if !saltEnabled}
				<p>Salt is not currently enabled on this forum. The creator can enable it in the forum settings.</p>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'webOfTrust'}
	<FooterModal title="Web of Trust" subtitle="Community-driven moderation" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4"/><path d="M17.7 6.3a8 8 0 0 1 0 11.4"/><path d="M3.1 3.1a16 16 0 0 0 0 17.8"/><path d="M20.9 3.1a16 16 0 0 1 0 17.8"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			{#if wotEnabled}
				<p>This forum uses Web of Trust moderation. Instead of a central moderator, the forum uses the social graph of the creator's Nostr identity to decide who can post, reply, and chat.</p>
				{#if wotPostDepth !== null}
					<p><strong>Post access:</strong> Users must be within {wotPostDepth} {wotPostDepth === 1 ? 'degree' : 'degrees'} of the forum creator's follow graph to create posts.</p>
				{/if}
				{#if wotReplyDepth !== null}
					<p><strong>Reply access:</strong> Users must be within {wotReplyDepth} {wotReplyDepth === 1 ? 'degree' : 'degrees'} of the creator's follow graph to reply.</p>
				{/if}
				{#if wotChatDepth !== null}
					<p><strong>Chat access:</strong> Users must be within {wotChatDepth} {wotChatDepth === 1 ? 'degree' : 'degrees'} of the creator's follow graph to send chat messages or join voice calls.</p>
				{/if}
				<p>The trust graph is fetched from Nostr relays. No central authority decides who is included. It is determined entirely by the public follow lists of Nostr users.</p>
			{:else}
				<p>This forum does not use Web of Trust moderation. Anyone with the link can post and reply, subject to any other settings the creator has configured.</p>
				<p>Web of Trust uses the social graph of the forum creator's Nostr identity to restrict posting to trusted participants, without any central moderator or account system.</p>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'postEncryption'}
	<FooterModal title="Post Encryption" subtitle="What protects your words" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Every post and reply is encrypted inside your browser before it leaves your device. The encryption keys are derived entirely from the forum's URL fragment. No key is ever sent to a server or stored anywhere outside the link.</p>
			<p>The relays that store the posts receive only ciphertext. They cannot read the content of any post, identify the topic it belongs to, or determine which forum it came from. To them it is indistinguishable from any other encrypted Nostr event.</p>
			<p>Only someone with the forum link can derive the correct keys to decrypt and read the posts. Sharing the link is sharing access.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'relayAnonymity'}
	<FooterModal title="Relay Anonymity" subtitle="What the infrastructure cannot see" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Nostr relays store posts but have no ability to read them or identify their origin. Because posts are encrypted with keys derived from the forum link, which the relay never sees. The relay cannot determine which forum a post belongs to, what it says, or who wrote it.</p>
			<p>Even if two posts come from the same person, the relay cannot link them to the same author without the forum link. The author's identity within the forum is protected by the encryption layer.</p>
			<p>If someone uses a Nostr signing extension, their public key is included in the inner signature, but that signature is itself encrypted. The relay only ever sees the outer encrypted envelope.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'invisibleByDefault'}
	<FooterModal title="Invisible by Default" subtitle="A forum that doesn't announce itself" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>When this forum was created, no server was notified. No registration was made. Nowhere itself has no record that this forum exists. It was built in a browser, encoded into a URL, and shared privately.</p>
			<p>The relays do not know the content of what they are storing. They see encrypted events with no identifiable metadata connecting them to a community or creator.</p>
			<p>The forum exists only for those who have the link. It cannot be discovered, indexed, or stumbled upon. This makes it suitable for communities that value discretion, whether for privacy, security, or simply because they prefer to control who participates.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'ephemeralChats'}
	<FooterModal title="Ephemeral Chats" subtitle="Conversations that don't persist" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>The forum chat uses ephemeral Nostr events. These are messages that are not intended for permanent storage. Unlike posts and replies, chat messages are broadcast in real time and are not expected to persist on relays after the session ends.</p>
			<p>Chat messages are also encrypted, using the same key derivation mechanism as posts. A relay receiving a chat message sees only ciphertext with no link to the forum or its participants.</p>
			<p>The practical result: chat is for live conversation between currently connected participants. It is not an archive. If you close the forum and return later, previous chat messages will not be there.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'whatIsNowhere'}
	<FooterModal title="What is Nowhere?" subtitle="A protocol with no servers" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Nowhere is a protocol that encodes the configuration of every page entirely inside the URL.</p>
			<p>For forums, Nowhere provides the structure and the encryption layer. The posts themselves live on Nostr relays, a decentralised network of storage nodes, but they are encrypted and unreadable to anyone without the link.</p>
			<p>The result is a community space that no company owns, no authority can shut down, and no platform can deplatform.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'censorshipResistance'}
	<FooterModal title="Censorship Resistance" subtitle="Why this forum cannot be taken down" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>The forum's configuration (its name, rules, topics, and settings) exists only in the URL. There is no server to contact, no account to ban, and no hosting provider to pressure into removing it.</p>
			<p>The posts live on Nostr relays, which are independently operated and geographically distributed. Relays have no way to read the data, know what forum a post belongs to, or even know that a forum exists. All they see is encrypted events with no identifiable metadata.</p>
			<p>If a relay is ever targeted or compromised, the forum users can add a salt, giving the forum an entirely new cryptographic identity while keeping the same URL. Posts move to new relays under new keys, and the old data becomes orphaned and meaningless.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'openSource'}
	<FooterModal title="Open Source" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Nowhere is fully open source. The codec that encodes forum settings into URLs, the builder that creates them, and the renderer that displays them are all publicly available for review, audit, and contribution.</p>
			<p>You can verify that encryption works as described, that no hidden data is collected, and that the code behaves exactly as claimed. The code is the contract.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'startYourOwn'}
	<FooterModal title="Start Your Own Forum" subtitle="Free, instant, no sign-up" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Creating a Nowhere forum takes about a minute. You choose a name, set your topics and moderation rules, pick your relays, and the builder generates a link. That link is your forum. Share it and you're done.</p>
			<p>There is no account to create, no payment required, no approval process, and nothing to install. The forum exists the moment you generate the link and ceases to exist when people stop sharing it.</p>
			<p><a href="/create/forum">Create your forum now</a></p>
		</div>
	</FooterModal>

{:else if activeModal === 'forumVerification'}
	<FooterModal title="Forum Verification" subtitle="Proving the rules haven't changed" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			{#if signed}
				<p>This forum was <strong>cryptographically signed</strong> by its creator. The verification phrase shown in the forum header is the forum's unique fingerprint. You can use it to confirm you are on the correct forum.</p>
			{:else}
				<p>This forum was <strong>not signed</strong>. There is no cryptographic proof of who created it. Exercise caution, particularly if the forum claims to be run by a specific person or organisation.</p>
			{/if}
			<p>The forum's settings (its name, rules, topics, moderation depth, and relay list) are all encoded in the URL. Any change to those settings would produce a completely different URL and a different verification phrase. The phrase is your guarantee that the forum you joined is the one you were invited to.</p>
			{#if verificationPhrase}
				<div class="ff-modal-phrase">
					<span class="ff-modal-phrase-label">Forum phrase:</span> {verificationPhrase}
				</div>
			{/if}
			{#if signed && creatorProfile.npubTruncated}
				<div class="ff-creator-card">
					<div class="ff-creator-card-heading"><span class="ff-modal-phrase-label">Forum Creator:</span></div>
					<div class="ff-creator-card-top">
						{#if privacyMode === 0 && creatorProfile.picture}
							<img class="ff-creator-card-photo" src={creatorProfile.picture} alt="" width="44" height="44" />
						{:else if creatorProfile.avatarSvg}
							<span class="ff-creator-card-avatar">{@html sanitizeSvg(creatorProfile.avatarSvg)}</span>
						{/if}
						<div class="ff-creator-card-info">
							{#if privacyMode === 0 && creatorProfile.name}
								<div class="ff-creator-card-name">{creatorProfile.name}</div>
							{/if}
							{#if creatorSellerPhrase}
								<div class="ff-creator-card-phrase">@{creatorSellerPhrase}</div>
							{/if}
						</div>
					</div>
					{#if privacyMode === 0 && creatorProfile.nip05}
						<div class="ff-creator-card-nip05" class:nip05-verified={creatorProfile.nip05Verified === true} class:nip05-failed={creatorProfile.nip05Verified === false}>
							{creatorProfile.nip05.startsWith('_@') ? creatorProfile.nip05.slice(2) : creatorProfile.nip05}
							{#if creatorProfile.nip05Verified === true}
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							{/if}
						</div>
					{/if}
					<button class="ff-creator-card-npub" onclick={copyCreatorNpub} title="Click to copy">
					<span class="ff-creator-card-npub-text">{creatorProfile.npubTruncated}</span>
					<span class="ff-creator-card-npub-action">{creatorNpubCopied ? 'Copied!' : 'Copy'}</span>
				</button>
				</div>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'signingKeys'}
	<FooterModal title="Signing Keys" subtitle="How authorship is proved" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>A signing key is a pair of cryptographic keys: a <strong>private key</strong> known only to its holder, and a <strong>public key</strong> that anyone can see. When someone signs content with their private key, anyone with their public key can verify the signature without trusting any server to vouch for them.</p>
			<p>On this forum, signing keys appear in two places. The <strong>forum creator's key</strong> is used to sign the forum itself, proving authorship of its rules and settings. Individual <strong>poster keys</strong> are embedded in the encrypted inner content of posts, allowing forum members to verify that a post came from a consistent identity across sessions without revealing that identity to the relays.</p>
			{#if signed}
				<p>This forum <strong>has been signed</strong> by its creator.</p>
				{#if creatorProfile.npubTruncated}
					<div class="ff-creator-card">
						<div class="ff-creator-card-heading"><span class="ff-modal-phrase-label">Forum Creator:</span></div>
						<div class="ff-creator-card-top">
							{#if privacyMode === 0 && creatorProfile.picture}
								<img class="ff-creator-card-photo" src={creatorProfile.picture} alt="" width="44" height="44" />
							{:else if creatorProfile.avatarSvg}
								<span class="ff-creator-card-avatar">{@html sanitizeSvg(creatorProfile.avatarSvg)}</span>
							{/if}
							<div class="ff-creator-card-info">
								{#if privacyMode === 0 && creatorProfile.name}
									<div class="ff-creator-card-name">{creatorProfile.name}</div>
								{/if}
								{#if creatorSellerPhrase}
									<div class="ff-creator-card-phrase">@{creatorSellerPhrase}</div>
								{/if}
							</div>
						</div>
						{#if privacyMode === 0 && creatorProfile.nip05}
							<div class="ff-creator-card-nip05" class:nip05-verified={creatorProfile.nip05Verified === true} class:nip05-failed={creatorProfile.nip05Verified === false}>
								{creatorProfile.nip05.startsWith('_@') ? creatorProfile.nip05.slice(2) : creatorProfile.nip05}
								{#if creatorProfile.nip05Verified === true}
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								{/if}
							</div>
						{/if}
						<button class="ff-creator-card-npub" onclick={copyCreatorNpub} title="Click to copy">
							<span class="ff-creator-card-npub-text">{creatorProfile.npubTruncated}</span>
							<span class="ff-creator-card-npub-action">{creatorNpubCopied ? 'Copied!' : 'Copy'}</span>
						</button>
					</div>
				{/if}
			{:else}
				<p>This forum <strong>has not been signed</strong> by its creator.</p>
			{/if}
		</div>
	</FooterModal>

{:else if activeModal === 'relayStorage'}
	<FooterModal title="Relay Storage" subtitle="Where posts actually live" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Unlike the forum's configuration (which lives in the URL), posts and replies are stored on Nostr relays, independently operated servers that accept and serve encrypted events. Relays are not run by Nowhere.</p>
			<p>Posts are published to the relays configured by the forum creator. When you open the forum, your browser connects to those relays, retrieves the encrypted events, and decrypts them locally using keys derived from the forum link.</p>
			<p>If a relay goes offline, posts stored only on that relay may become unavailable. Posts that were also received by other relays will remain accessible. The forum's configuration in the URL is unaffected. Only the stored posts are at risk.</p>
			<p>Relays store encrypted data. They cannot read posts, identify which forum they belong to, or determine who wrote them.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'howItWorks'}
	<FooterModal title="How it Works" subtitle="The full technical picture" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>1. <strong>Forum configuration in the URL.</strong> The creator's choices (name, topics, moderation rules, relay list) are encoded and compressed into the URL fragment. This fragment never leaves the browser; it is not sent to any server.</p>
			<p>2. <strong>Key derivation.</strong> When the forum loads, cryptographic keys are derived deterministically from the URL fragment (and salt, if enabled). These keys are used to encrypt outgoing posts and decrypt incoming ones.</p>
			<p>3. <strong>Publishing.</strong> When a user posts, the content is encrypted in the browser and published as a Nostr event to the configured relays. The relay stores the ciphertext.</p>
			<p>4. <strong>Receiving.</strong> Other forum members' browsers subscribe to the same relays, receive the encrypted events, and decrypt them locally. The conversation appears in real time.</p>
			<p>5. <strong>No central point.</strong> Nowhere does not run the relays, does not store posts, and has no visibility into the forum's activity. Nowhere's role ends the moment the URL is generated.</p>
		</div>
	</FooterModal>

{:else if activeModal === 'supportNowhere'}
	<FooterModal title="Support Nowhere" subtitle="Keep it free and open" onclose={() => (activeModal = null)}>
		{#snippet headerIcon()}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
		{/snippet}
		<div class="ff-modal-prose">
			<p>Nowhere is free to use, has no ads, and collects no data. Building and maintaining the protocol takes real work. If you have found value here, as a forum creator, a participant, or both, consider sending a small contribution.</p>

			<div class="ff-support-grid">
				<div class="ff-support-section">
					<div class="ff-support-label">Silent Payment</div>
					<button class="ff-support-address" onclick={copySp} title="copy address">
						<span class="ff-support-address-text ff-support-sp">{SP_ADDRESS}</span>
						<span class="ff-support-address-action">{copiedSp ? 'copied' : 'copy'}</span>
					</button>
					{#if spQrDataUrl}
						<div class="ff-support-qr">
							<img src={spQrDataUrl} alt="silent payment address qr code" />
						</div>
					{/if}
				</div>

				<div class="ff-support-section">
					<div class="ff-support-label">Lightning</div>
					<button class="ff-support-address" onclick={copyLn} title="copy address">
						<span class="ff-support-address-text">{LN_ADDRESS}</span>
						<span class="ff-support-address-action">{copiedLn ? 'copied' : 'copy'}</span>
					</button>
					{#if lnQrDataUrl}
						<div class="ff-support-qr">
							<img src={lnQrDataUrl} alt="lightning address qr code" />
						</div>
					{/if}
				</div>
			</div>
		</div>
	</FooterModal>
{/if}

<style>
	.ff-footer {
		border-top: 1px solid var(--fm-border);
		margin-top: 3rem;
	}

	.ff-footer-content {
		max-width: 960px;
		margin: 0 auto;
		padding: 3rem 1.5rem 2rem;
	}

	.ff-footer-columns {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2rem;
	}

	.ff-footer-col h4 {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fm-text-muted);
		margin: 0 0 0.75rem;
	}

	.ff-footer-col ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ff-footer-col button {
		background: none;
		border: none;
		padding: 0;
		font-size: 0.8rem;
		color: var(--fm-text-secondary);
		cursor: pointer;
		text-align: left;
		line-height: 1.4;
	}

	.ff-footer-col button:hover {
		color: var(--fm-text);
	}

	.ff-footer-support {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--fm-border);
		text-align: center;
	}

	.ff-footer-support p {
		font-size: 0.8rem;
		color: var(--fm-text-muted);
		margin: 0;
	}

	.ff-support-link {
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		color: var(--fm-text-secondary);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.ff-support-link:hover {
		color: var(--fm-text);
	}

	.ff-footer-bottom {
		margin-top: 1rem;
		text-align: center;
		font-size: 0.75rem;
		color: var(--fm-text-muted);
	}

	.ff-footer-link {
		color: var(--fm-text-muted);
		text-decoration: none;
	}

	.ff-footer-link:hover {
		color: var(--fm-text);
		text-decoration: underline;
	}

	/* ─── Modal content ─── */
	.ff-modal-prose section {
		margin-bottom: 1.25rem;
	}

	.ff-modal-prose section:last-child {
		margin-bottom: 0;
	}

	.ff-modal-prose p {
		margin: 0 0 0.6rem;
		font-size: 0.9rem;
		line-height: 1.65;
		color: var(--color-text);
	}

	.ff-modal-prose p:last-child {
		margin-bottom: 0;
	}

	.ff-modal-prose a {
		color: var(--color-text-secondary);
	}

	.ff-modal-phrase {
		margin-top: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: var(--color-bg-secondary);
		border-radius: 6px;
		font-size: 0.8rem;
		font-family: monospace;
		line-height: 1.5;
		word-break: break-word;
	}

	.ff-modal-phrase-label {
		font-weight: 600;
		margin-right: 0.25rem;
		font-family: inherit;
	}

	/* ─── Support sections ─── */
	.ff-support-grid {
		margin-top: 1.25rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: auto auto auto;
		gap: 0.6rem 1.5rem;
	}

	.ff-support-section {
		min-width: 0;
		display: grid;
		grid-template-rows: subgrid;
		grid-row: span 3;
		gap: 0.6rem;
	}

	.ff-support-label {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fm-text-muted);
	}

	.ff-support-address {
		align-self: start;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		padding: 0.75rem 0.85rem;
		background: var(--color-bg-secondary);
		border: 1px solid var(--fm-border);
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		transition: border-color 0.15s;
	}

	.ff-support-address:hover {
		border-color: var(--fm-border-strong, var(--fm-text-muted));
	}

	.ff-support-address-text {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--color-text);
		word-break: break-all;
		line-height: 1.45;
	}

	.ff-support-sp {
		font-size: 0.7rem;
	}

	.ff-support-address-action {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--fm-text-muted);
		flex-shrink: 0;
	}

	.ff-support-qr {
		align-self: start;
		justify-self: center;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.65rem;
		background: #ffffff;
		border: 1px solid var(--fm-border);
		border-radius: 6px;
		width: 170px;
	}

	.ff-support-qr img {
		display: block;
		width: 100%;
		height: auto;
		image-rendering: pixelated;
	}

	@media (max-width: 640px) {
		.ff-support-grid {
			grid-template-columns: 1fr;
		}

		.ff-support-qr {
			margin-left: auto;
			margin-right: auto;
		}
	}

	/* ─── Creator card ─── */
	.ff-creator-card {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: var(--color-bg-secondary);
		border-radius: 6px;
		font-size: 0.8rem;
	}

	.ff-creator-card-heading {
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
	}

	.ff-creator-card-top {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}

	.ff-creator-card-photo {
		width: 44px;
		height: 44px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.ff-creator-card-avatar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
	}

	.ff-creator-card-avatar :global(svg) {
		border-radius: 8px;
	}

	.ff-creator-card-info {
		min-width: 0;
		flex: 1;
	}

	.ff-creator-card-name {
		font-weight: 600;
		color: var(--color-text);
		line-height: 1.3;
		margin-bottom: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ff-creator-card-phrase {
		color: var(--color-text-secondary);
		font-family: monospace;
		line-height: 1.4;
		word-break: break-word;
	}

	.ff-creator-card-nip05 {
		font-size: 0.75rem;
		color: var(--fm-link);
		margin-top: 4px;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.ff-creator-card-nip05.nip05-verified {
		color: var(--fm-success, #22c55e);
	}

	.ff-creator-card-nip05.nip05-failed {
		color: var(--fm-text-muted);
		text-decoration: line-through;
	}

	.ff-creator-card-npub {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		margin-top: 6px;
		padding: 6px 10px;
		border: 1px solid var(--fm-border);
		border-radius: 4px;
		background: var(--fm-code-bg);
		cursor: pointer;
		font-family: ui-monospace, 'Cascadia Code', monospace;
		transition: border-color 150ms;
	}

	.ff-creator-card-npub:hover {
		border-color: var(--fm-border-strong);
	}

	.ff-creator-card-npub-text {
		font-size: 11px;
		color: var(--fm-text-muted);
	}

	.ff-creator-card-npub-action {
		font-size: 10px;
		color: var(--fm-text-secondary);
		font-family: inherit;
	}

	/* ─── Responsive ─── */
	@media (max-width: 768px) {
		.ff-footer-columns {
			grid-template-columns: repeat(2, 1fr);
		}
	}

</style>

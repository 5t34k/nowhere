<script lang="ts">
	interface Props {
		authorPhrase: string;
		dropPhrase: string;
		signed: boolean;
		npub: string;
	}

	let { authorPhrase, dropPhrase, signed, npub }: Props = $props();

	let activeModal = $state<string | null>(null);
	let npubCopied = $state(false);

	async function copyNpub() {
		if (!npub) return;
		try { await navigator.clipboard.writeText(npub); } catch {}
		npubCopied = true;
		setTimeout(() => (npubCopied = false), 2000);
	}

	function open(key: string) { activeModal = key; }
	function close() { activeModal = null; }

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<footer class="drop-footer">
	<div class="drop-footer-links">
		<button onclick={() => open('whatIsNowhere')}>What is Nowhere</button>
		<span class="drop-footer-sep">&middot;</span>
		<button onclick={() => open('howItWorks')}>How it Works</button>
		<span class="drop-footer-sep">&middot;</span>
		<button onclick={() => open('censorshipResistance')}>Censorship Resistance</button>
		<span class="drop-footer-sep">&middot;</span>
		<button onclick={() => open('openSource')}>Open Source</button>
		<span class="drop-footer-sep">&middot;</span>
		<button onclick={() => open('privacy')}>Privacy</button>
		<span class="drop-footer-sep">&middot;</span>
		<button onclick={() => open('howToVerify')}>How to Verify</button>
		<span class="drop-footer-sep">&middot;</span>
		<a href="/create/drop" class="drop-footer-create">Create Drop</a>
	</div>
	<div class="drop-footer-tagline">
		Hosted <a href="https://hostednowhere.com" target="_blank" rel="noopener noreferrer">nowhere</a>. Present everywhere.
	</div>
</footer>

{#if activeModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="df-modal-backdrop" onclick={handleBackdrop}>
		<div class="df-modal" role="dialog">
			<div class="df-modal-header">
				<h2>
					{#if activeModal === 'whatIsNowhere'}What is Nowhere?
					{:else if activeModal === 'howItWorks'}How it Works
					{:else if activeModal === 'censorshipResistance'}Censorship Resistance
					{:else if activeModal === 'openSource'}Open Source
					{:else if activeModal === 'privacy'}Privacy
					{:else if activeModal === 'howToVerify'}How to Verify
					{/if}
				</h2>
				<button class="df-modal-close" onclick={close} aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<div class="df-modal-body">
				{#if activeModal === 'whatIsNowhere'}
					<p>Nowhere is a protocol that encodes content entirely inside the URL. There are no servers, no databases, and no accounts. A Drop is compressed and stored in the link itself.</p>
					<p>When someone opens the link, the page is rendered directly in their browser. Nothing is fetched from a server. Nothing can be censored or taken down.</p>

				{:else if activeModal === 'howItWorks'}
					<p>1. The author writes a Drop and all content is encoded into a compact URL fragment.</p>
					<p>2. The link is shared through messaging apps, email, social media, or QR code.</p>
					<p>3. When opened, the browser decodes and renders the Drop. No server is involved.</p>
					<p>4. The Drop can never be taken down. Anyone with the link will always be able to read and share it.</p>

				{:else if activeModal === 'censorshipResistance'}
					<p>Because this Drop exists entirely within its URL, there is no server to shut down, no account to ban, and no hosting provider to pressure. Anyone who has the link can open it — forever.</p>
					<p>Nowhere has no ability to alter or remove a Drop after it has been published. The author's content is permanent and unmodifiable by any third party.</p>

				{:else if activeModal === 'openSource'}
					<p>Nowhere is fully open source. The codec, builder, and renderer are all publicly available for review, audit, and contribution.</p>
					<p>You can verify that the code does exactly what it claims — no hidden tracking, no backdoors, no data collection.</p>

				{:else if activeModal === 'privacy'}
					<p>This drop was never uploaded to a server. The author encoded it directly into a link, and the content exists only inside the URL itself.</p>
					<p>When you opened this page, nothing was fetched from a server. Your browser decoded the drop entirely on your device. No request was made for this content because there is no content to request.</p>
					<p>Nobody knows you are reading this. There are no access logs, no analytics, no tracking pixels, and no IP addresses recorded. The same is true for every Nowhere page, whether it is a drop, a store, a message, or any other site type.</p>
					<p>The link is the file. Reading it leaves no trace.</p>

				{:else if activeModal === 'howToVerify'}
					<p>1. <strong>Check the signing status.</strong> A signed Drop means the author used a private key to prove authorship. An unsigned Drop has no cryptographic proof of origin.</p>
					<p>2. <strong>Compare the author phrase.</strong> The author's verification phrase is derived from their public key. If you know the author, ask them to confirm their phrase matches what is shown here.</p>
					<p>3. <strong>Check the drop phrase.</strong> The drop phrase is a fingerprint of the Drop's content. If anything has been changed, the phrase will not match what the author originally published.</p>
					{#if signed && authorPhrase || dropPhrase}
						<div class="df-modal-phrases">
							<div>
								<span class="df-phrase-label">Author</span>
								{#if signed && authorPhrase}
									<span class="df-phrase">{authorPhrase}</span>
								{:else}
									<span class="df-unsigned-note">Drop not signed</span>
								{/if}
							</div>
							{#if signed && npub}
								<div>
									<span class="df-phrase-label">Npub</span>
									<button class="df-npub" onclick={copyNpub} title={npub}>{npubCopied ? 'Copied!' : npub.slice(0, 12) + '...' + npub.slice(-4)}</button>
								</div>
							{/if}
							{#if dropPhrase}
								<div><span class="df-phrase-label">Drop</span><span class="df-phrase">{dropPhrase}</span></div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.drop-footer {
		border-top: 1px solid var(--drop-border);
		padding: 28px 24px 32px;
		text-align: center;
	}

	.drop-footer-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 6px 0;
		margin-bottom: 12px;
	}

	.drop-footer-links button,
	.drop-footer-create {
		background: none;
		border: none;
		padding: 0 6px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 11px;
		color: var(--drop-text-muted);
		cursor: pointer;
		text-decoration: none;
		transition: color 150ms ease;
	}

	.drop-footer-links button:hover,
	.drop-footer-create:hover {
		color: var(--drop-text-secondary);
	}

	.drop-footer-sep {
		font-size: 11px;
		color: var(--drop-border);
		user-select: none;
	}

	.drop-footer-tagline {
		font-size: 11px;
		color: var(--drop-text-muted);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.drop-footer-tagline a {
		color: var(--drop-text-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 150ms ease;
	}

	.drop-footer-tagline a:hover {
		color: var(--drop-text-secondary);
	}

	/* ─── Modal ─── */
	.df-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 200;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: df-fade-in 200ms ease;
	}

	.df-modal {
		background: var(--drop-bg);
		width: 100%;
		max-height: 80vh;
		border-radius: 12px 12px 0 0;
		display: flex;
		flex-direction: column;
		animation: df-slide-up 250ms ease;
		border-top: 1px solid var(--drop-border);
	}

	.df-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--drop-border);
		flex-shrink: 0;
	}

	.df-modal-header h2 {
		font-size: 15px;
		font-weight: 600;
		color: var(--drop-text);
		margin: 0;
	}

	.df-modal-close {
		background: none;
		border: none;
		color: var(--drop-text-muted);
		cursor: pointer;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: color 150ms ease;
		flex-shrink: 0;
	}

	.df-modal-close:hover {
		color: var(--drop-text);
	}

	.df-modal-body {
		padding: 20px;
		overflow-y: auto;
		font-size: 13px;
		line-height: 1.7;
		color: var(--drop-text);
	}

	.df-modal-body p {
		margin: 0 0 12px;
	}

	.df-modal-body p:last-child {
		margin-bottom: 0;
	}

	.df-modal-phrases {
		margin-top: 16px;
		padding: 12px 14px;
		background: var(--drop-box-bg);
		border: 1px solid var(--drop-border);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.df-modal-phrases > div {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}

	.df-phrase-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--drop-text-muted);
		flex-shrink: 0;
		width: 44px;
	}

	.df-phrase {
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
		font-size: 11px;
		color: var(--drop-text-secondary);
		word-break: break-all;
	}

	.df-unsigned-note {
		font-style: italic;
		color: var(--drop-text-muted);
		font-size: 11px;
	}

	.df-npub {
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
		font-size: 11px;
		color: var(--drop-text-muted);
		cursor: pointer;
		border: none;
		background: none;
		padding: 0;
		transition: color 200ms ease;
	}

	.df-npub:hover {
		color: var(--drop-text-secondary);
	}

	@keyframes df-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes df-slide-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}

	@media (min-width: 640px) {
		.df-modal-backdrop {
			align-items: center;
		}

		.df-modal {
			max-width: 560px;
			border-radius: 12px;
			max-height: 70vh;
			border: 1px solid var(--drop-border);
			animation: df-scale-in 200ms ease;
		}

		@keyframes df-scale-in {
			from { opacity: 0; transform: scale(0.96); }
			to { opacity: 1; transform: scale(1); }
		}
	}
</style>

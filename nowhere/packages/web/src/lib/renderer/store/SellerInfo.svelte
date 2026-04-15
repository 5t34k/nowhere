<script lang="ts">
	interface Props {
		storeDescription?: string;
		deliveryDays?: string;
		sellerPhrase?: string;
		storePhrase?: string;
		npub?: string;
		signed?: boolean;
	}

	let {
		storeDescription,
		deliveryDays,
		sellerPhrase,
		storePhrase,
		npub,
		signed
	}: Props = $props();

	let expanded = $state(false);
	let infoExpanded = $state(false);
	let copied = $state(false);

	const descriptionIntro = $derived(
		storeDescription ? storeDescription.split(/\n\n/)[0] : ''
	);

	const descriptionMore = $derived.by(() => {
		if (!storeDescription) return '';
		const idx = storeDescription.indexOf('\n\n');
		return idx >= 0 ? storeDescription.slice(idx + 2) : '';
	});

	const moreParagraphs = $derived(
		descriptionMore ? descriptionMore.split(/\n\n+/).filter((p: string) => p.trim()) : []
	);

	const hasMore = $derived(descriptionMore.length > 0);
	const hasDescription = $derived(!!storeDescription);
	const hasDelivery = $derived(!!deliveryDays);
	const showBadge = $derived(!!sellerPhrase || !!storePhrase);

	function copyNpub() {
		if (!npub) return;
		navigator.clipboard.writeText(npub);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

{#if showBadge || hasDescription || hasDelivery}
	<div class="seller-strip">
		<div class="seller-inner">
			{#if showBadge}
				<div class="verification-card-wrap" class:is-signed={signed} class:is-unsigned={!signed}>
					<button
						class="verification-header"
						onclick={() => (infoExpanded = !infoExpanded)}
						aria-expanded={infoExpanded}
					>
						<div class="verification-icon">
							{#if signed}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
									<path d="M9 12l2 2 4-4"/>
								</svg>
							{:else}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
								</svg>
							{/if}
						</div>
						<div class="verification-text">
							{#if signed}
								<span class="verification-status">Signed by seller</span>
								{#if sellerPhrase}<span class="verification-phrase">{sellerPhrase}</span>{/if}
							{:else}
								<span class="verification-status">Not signed</span>
							{/if}
						</div>
						<span class="verification-toggle">{infoExpanded ? '▴' : '▾'}</span>
					</button>

					<div class="verification-detail" class:is-expanded={infoExpanded}>
						<div class="verification-detail-inner">
							{#if signed}
								<p class="detail-explainer">This store was cryptographically signed by the private key holder. The seller phrase reliably identifies this seller.</p>

								{#if sellerPhrase}
									<div class="phrase-block">
										<div class="phrase-row">
											<span class="phrase-label">Seller phrase</span>
											<span class="phrase-value">{sellerPhrase}</span>
										</div>
										<p class="phrase-hint">Same for all stores from this seller. Compare with previous purchases to recognize them.</p>
									</div>
								{/if}
							{:else}
								<p class="detail-explainer detail-warning">This store is not signed. Without a signature there is no proof the key holder created this store. Ask the seller to sign their store URL.</p>
							{/if}

							{#if storePhrase}
								<div class="phrase-block">
									<div class="phrase-row">
										<span class="phrase-label">Store phrase</span>
										<span class="phrase-value">{storePhrase}</span>
									</div>
									<p class="phrase-hint">Unique to this store URL. Confirms the link hasn't been modified.</p>
								</div>
							{/if}

							{#if signed && npub}
								<div class="profile-detail">
									<span class="profile-label">npub</span>
									<div class="npub-row">
										<code class="npub-text">{npub}</code>
										<button class="copy-btn" onclick={copyNpub}>
											{copied ? 'Copied' : 'Copy'}
										</button>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
			{#if hasDescription}
				<div class="store-description-wrap">
					<p class="store-description">{descriptionIntro}</p>
					{#if hasMore}
						{#if expanded}
							{#each moreParagraphs as para}
								<p class="store-description">{para}</p>
							{/each}
						{/if}
						<button class="read-more" onclick={() => (expanded = !expanded)}>
							{expanded ? 'Show less' : 'Read more'}
						</button>
					{/if}
				</div>
			{/if}
			{#if hasDelivery}
				<p class="store-delivery">Delivery: ~{deliveryDays} days</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.seller-strip {
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
	}

	.seller-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* ── Verification card ─────────────────────────── */

	.verification-card-wrap {
		border-radius: var(--radius-sm);
		border-left: 3px solid transparent;
		overflow: hidden;
	}

	.verification-card-wrap.is-signed {
		border-left-color: var(--color-success);
		background: rgba(22, 163, 74, 0.04);
	}

	.verification-card-wrap.is-unsigned {
		border-left-color: var(--color-warning);
		background: rgba(245, 158, 11, 0.04);
	}

	/* ── Header button ─────────────────────────────── */

	.verification-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		background: none;
		border: none;
		font-family: inherit;
		text-align: left;
	}

	.verification-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
	}

	.is-signed .verification-icon {
		color: var(--color-success);
		background: rgba(22, 163, 74, 0.1);
	}

	.is-unsigned .verification-icon {
		color: var(--color-warning);
		background: rgba(245, 158, 11, 0.1);
	}

	.verification-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.verification-status {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.is-signed .verification-status {
		color: var(--color-success);
	}

	.is-unsigned .verification-status {
		color: var(--color-warning);
	}

	.verification-phrase {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
	}

	.verification-toggle {
		font-size: 10px;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	/* ── Expandable detail ─────────────────────────── */

	.verification-detail {
		max-height: 0;
		opacity: 0;
		overflow: hidden;
		transition: max-height 0.3s ease, opacity 0.3s ease;
	}

	.verification-detail.is-expanded {
		max-height: 600px;
		opacity: 1;
	}

	.verification-detail-inner {
		padding: 0 var(--space-3) var(--space-3);
		font-size: var(--text-xs);
	}

	.detail-explainer {
		line-height: 1.5;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.detail-warning {
		color: var(--color-warning);
	}

	.phrase-block {
		background: var(--color-bg);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-2);
	}

	.phrase-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.phrase-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.phrase-value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text);
		word-break: break-word;
	}

	.phrase-hint {
		font-size: 10px;
		color: var(--color-text-muted);
		margin: 4px 0 0;
		font-style: italic;
		line-height: 1.4;
	}

	.profile-detail {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.profile-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-muted);
		min-width: 44px;
		flex-shrink: 0;
	}

	.npub-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}

	.npub-text {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		word-break: break-all;
		color: var(--color-text);
	}

	.copy-btn {
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 1px 6px;
		font-size: 10px;
		cursor: pointer;
		flex-shrink: 0;
		color: var(--color-text-muted);
		transition: background var(--transition-fast);
	}

	.copy-btn:hover {
		background: var(--color-bg);
	}

	/* ── Store description & delivery ──────────────── */

	.store-description-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.store-description {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.read-more {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		align-self: flex-start;
	}

	.read-more:hover {
		color: var(--color-text);
	}

	.store-delivery {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
</style>

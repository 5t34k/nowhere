<script lang="ts">
	import type { StoreData, EventData, MessageData, FundraiserData, PetitionData, ForumData, DropData, ArtData, Tag } from '@nowhere/codec';
	import { computeFingerprint, computeFingerprintFromString, computeVerificationPhrase, computeAllVerificationPhrases, computeSellerFingerprint, GPU_CRACK_TIMES, serialize, serializeMessage, serializeFundraiser, serializePetition, serializeForum, serializeEvent, serializeDrop, serializeArt, base64urlToBytes, bytesToHex } from '@nowhere/codec';
	import HintIcon from './HintIcon.svelte';

	interface VerificationLabels {
		entityLabel: string;
		ownerLabel: string;
	}

	interface Props {
		storeData: StoreData | EventData | MessageData | FundraiserData | PetitionData | ForumData | DropData | ArtData | null;
		onTagUpdate?: (key: string, value: string) => void;
		labels?: VerificationLabels;
		showSharingSection?: boolean;
	}

	let { storeData, onTagUpdate, labels = { entityLabel: 'Store', ownerLabel: 'Seller' }, showSharingSection = true }: Props = $props();

	let storeFingerprint = $state('');
	let sellerFingerprint = $state('');
	let storePhrase = $state('');
	let sellerPhrase = $state('');
	let allStorePhrases = $state<Record<number, string>>({});
	let allSellerPhrases = $state<Record<number, string>>({});

	const initialWordCount = $derived.by(() => {
		if (!storeData) return 6;
		const vTag = storeData.tags.find((t: Tag) => t.key === 'V');
		const parsed = vTag?.value ? parseInt(vTag.value, 10) : 6;
		return isNaN(parsed) ? 6 : Math.max(6, Math.min(12, parsed));
	});
	let phraseWordCount = $state(6);
	let wordCountInitialized = $state(false);

	$effect(() => {
		if (!wordCountInitialized && initialWordCount) {
			phraseWordCount = initialWordCount;
			wordCountInitialized = true;
		}
	});

	const crackTime = $derived(GPU_CRACK_TIMES[phraseWordCount] || 'billions+ years');

	$effect(() => {
		const wc = phraseWordCount;
		if (storeData) {
			const siteType = 'siteType' in storeData ? storeData.siteType : undefined;
			const contentFingerprintPromise =
				siteType === 'message'    ? computeFingerprintFromString(serializeMessage(storeData as MessageData)) :
				siteType === 'fundraiser' ? computeFingerprintFromString(serializeFundraiser(storeData as FundraiserData)) :
				siteType === 'petition'   ? computeFingerprintFromString(serializePetition(storeData as PetitionData)) :
				siteType === 'discussion' ? computeFingerprintFromString(serializeForum(storeData as ForumData)) :
				siteType === 'event'      ? computeFingerprintFromString(serializeEvent(storeData as EventData)) :
				siteType === 'drop'       ? computeFingerprintFromString(serializeDrop(storeData as DropData)) :
				siteType === 'art'        ? computeFingerprintFromString(serializeArt(storeData as ArtData)) :
				computeFingerprint(storeData as StoreData);
			const hasPubkey = !!(storeData.pubkey && storeData.pubkey.length === 43);
			if (hasPubkey) {
				Promise.all([
					contentFingerprintPromise,
					computeSellerFingerprint(bytesToHex(base64urlToBytes(storeData.pubkey!)))
				]).then(([sfp, selfp]) => {
					storeFingerprint = sfp;
					sellerFingerprint = selfp;
					storePhrase = computeVerificationPhrase(sfp, wc);
					sellerPhrase = computeVerificationPhrase(selfp, wc);
					allStorePhrases = computeAllVerificationPhrases(sfp);
					allSellerPhrases = computeAllVerificationPhrases(selfp);
				});
			} else {
				contentFingerprintPromise.then((sfp) => {
					storeFingerprint = sfp;
					storePhrase = computeVerificationPhrase(sfp, wc);
					allStorePhrases = computeAllVerificationPhrases(sfp);
					sellerFingerprint = '';
					sellerPhrase = '';
					allSellerPhrases = {};
				});
			}
		} else {
			storeFingerprint = '';
			sellerFingerprint = '';
			storePhrase = '';
			sellerPhrase = '';
			allStorePhrases = {};
			allSellerPhrases = {};
		}
	});

	function handleWordCountChange(e: Event) {
		const val = parseInt((e.target as HTMLSelectElement).value, 10);
		phraseWordCount = Math.max(6, Math.min(12, val));
		onTagUpdate?.('V', String(phraseWordCount));
	}

	let sellerCopied = $state(false);

	async function copySellerPhrase() {
		if (!sellerPhrase) return;
		try {
			await navigator.clipboard.writeText(sellerPhrase);
			sellerCopied = true;
			setTimeout(() => (sellerCopied = false), 2000);
		} catch {
			// fallback
		}
	}
</script>

<div class="panel">
	<h3>Verification</h3>

	{#if !storeData}
		<div class="not-ready">
			<p>Complete the required fields to see verification info.</p>
		</div>
	{:else}
		<div class="verification-section">
			<div class="phrase-box">
				<div class="phrase-length-row">
					<label class="phrase-length-label" for="phrase-word-count">
						Default verification phrase display length
						<HintIcon tip="This only changes how many words are displayed by default. All phrase lengths can always be viewed in the footer or on this page." />
					</label>
					<div class="word-count-control">
						<select id="phrase-word-count" value={phraseWordCount} onchange={handleWordCountChange} class="word-count-select">
							{#each [6, 7, 8, 9, 10, 11, 12] as n}
								<option value={n}>{n} words</option>
							{/each}
						</select>
						<span class="crack-time">{crackTime}</span>
					</div>
				</div>
				{#if phraseWordCount > 8}
					<p class="phrase-warning phrase-warning--excessive">This level of security is likely unnecessary for most threat models, but won't hurt.</p>
				{/if}

				{#if sellerPhrase}
				<div class="phrase-display">
					<div class="phrase-display-inner">
						<div class="phrase-icon">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
						</div>
						<div>
							<div class="phrase-detail-label">{labels.ownerLabel} phrase ({phraseWordCount} words)</div>
							<div class="phrase-detail-value">{sellerPhrase}</div>
							<div class="phrase-detail-hint">Same across all your content. Share on your business card or social media so others can recognize you.</div>
						</div>
					</div>
				</div>
				{:else}
				<div class="phrase-display phrase-display--no-key">
					<div class="phrase-display-inner">
						<div class="phrase-icon">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
						</div>
						<div>
							<div class="phrase-detail-label">{labels.ownerLabel} phrase</div>
							<div class="phrase-detail-hint">Add a public key to generate your author phrase.</div>
						</div>
					</div>
				</div>
				{/if}

				<div class="phrase-display phrase-display--store">
					<div class="phrase-display-inner">
						<div class="phrase-icon phrase-icon--store">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						</div>
						<div>
							<div class="phrase-detail-label">{labels.entityLabel} phrase ({phraseWordCount} words)</div>
							<div class="phrase-detail-value">{storePhrase}</div>
							<div class="phrase-detail-hint">Unique to this {labels.entityLabel.toLowerCase()} URL. Confirms the link hasn't been modified.</div>
						</div>
					</div>
				</div>

				{#if Object.keys(allSellerPhrases).length > 0}
					<details class="all-phrases-section">
						<summary class="all-phrases-toggle">See all phrase lengths</summary>
						<div class="all-phrases-list">
							<div class="all-phrases-group-label">{labels.ownerLabel} phrases</div>
							{#each [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as wordCount}
								<div class="all-phrases-item" class:is-default={wordCount === phraseWordCount}>
									<div class="all-phrases-header">
										<span class="all-phrases-wc">{wordCount} words</span>
										{#if wordCount === phraseWordCount}
											<span class="all-phrases-badge">default</span>
										{/if}
										<span class="all-phrases-time">{GPU_CRACK_TIMES[wordCount]}</span>
									</div>
									<div class="all-phrases-value">{allSellerPhrases[wordCount]}</div>
								</div>
							{/each}

							<div class="all-phrases-group-label" style="margin-top: var(--space-3);">{labels.entityLabel} phrases</div>
							{#each [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as wordCount}
								<div class="all-phrases-item" class:is-default={wordCount === phraseWordCount}>
									<div class="all-phrases-header">
										<span class="all-phrases-wc">{wordCount} words</span>
										{#if wordCount === phraseWordCount}
											<span class="all-phrases-badge">default</span>
										{/if}
										<span class="all-phrases-time">{GPU_CRACK_TIMES[wordCount]}</span>
									</div>
									<div class="all-phrases-value">{allStorePhrases[wordCount]}</div>
								</div>
							{/each}
						</div>
					</details>
				{/if}
			</div>
		</div>

		{#if showSharingSection && sellerPhrase}
			<div class="instructions-section">
				<span class="section-label">Sharing Your Identity</span>
				<p class="instructions-text">
					Share your {labels.ownerLabel.toLowerCase()} phrase on your business card, social media, or website so others can verify your content:
				</p>
				<div class="bio-copy">
					<code>{sellerPhrase}</code>
					<button class="copy-btn-sm" onclick={copySellerPhrase}>
						{sellerCopied ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<p class="instructions-hint">
					Visitors will see this phrase when they view your content.
				</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.not-ready {
		padding: var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
	}

	.section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.verification-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.phrase-box {
		padding: var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.phrase-length-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.phrase-length-label {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.word-count-control {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.word-count-select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.crack-time {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.phrase-warning {
		font-size: var(--text-xs);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
	}

	.phrase-warning--weak {
		color: #d69e2e;
		background: rgba(214, 158, 46, 0.1);
	}

	.phrase-warning--excessive {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.phrase-display {
		padding: var(--space-3);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		border-left: 3px solid #6366f1;
	}

	.phrase-display--store {
		border-left-color: var(--color-success, #22c55e);
	}

	.phrase-display--no-key {
		border-left-color: var(--color-border);
		opacity: 0.6;
	}

	.phrase-display-inner {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.phrase-icon {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: color-mix(in srgb, #6366f1 15%, transparent);
		color: #6366f1;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.phrase-icon--store {
		background: color-mix(in srgb, var(--color-success, #22c55e) 15%, transparent);
		color: var(--color-success, #22c55e);
	}

	.phrase-detail-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.phrase-detail-value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		margin-top: 2px;
	}

	.phrase-detail-hint {
		font-size: 10px;
		color: var(--color-text-muted);
		margin-top: 4px;
		font-style: italic;
	}

	.all-phrases-section {
		margin-top: 0;
	}

	.all-phrases-toggle {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: var(--space-1) 0;
	}

	.all-phrases-toggle:hover {
		color: var(--color-text);
	}

	.all-phrases-group-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.all-phrases-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.all-phrases-item {
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		border-left: 3px solid transparent;
	}

	.all-phrases-item.is-default {
		border-left-color: var(--color-success, #22c55e);
		background: color-mix(in srgb, var(--color-success, #22c55e) 5%, var(--color-bg));
	}

	.all-phrases-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: 2px;
	}

	.all-phrases-wc {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.all-phrases-badge {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-success, #22c55e);
		background: color-mix(in srgb, var(--color-success, #22c55e) 15%, transparent);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
	}

	.all-phrases-time {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-left: auto;
	}

	.all-phrases-value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text);
		overflow-wrap: break-word;
		word-break: normal;
	}

	.instructions-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.instructions-text {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.bio-copy {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.bio-copy code {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		word-break: break-all;
	}

	.copy-btn-sm {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
		flex-shrink: 0;
		transition: all var(--transition-fast);
	}

	.copy-btn-sm:hover {
		background: var(--color-bg-tertiary);
	}

	.instructions-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>

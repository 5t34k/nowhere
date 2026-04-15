<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';
	import SvgImageInput from '../SvgImageInput.svelte';

	interface Props {
		image: string;
		tags: Tag[];
		onUpdateImage: (value: string) => void;
		onUpdateTags: (tags: Tag[]) => void;
	}

	let { image, tags, onUpdateImage, onUpdateTags }: Props = $props();

	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdateTags(newTags);
	}

	// Secondary images: pipe-separated in tag '2'
	const secondaryRaw = $derived(getTagValue('2'));
	const secondaryImages = $derived(
		secondaryRaw ? secondaryRaw.split('\\p').filter(Boolean) : []
	);

	let secondaryInput = $state('');

	function addSecondaryImage() {
		const url = secondaryInput.trim();
		if (!url) return;
		const escaped = url.replace(/\\/g, '\\\\').replace(/\|/g, '\\p');
		const current = getTagValue('2');
		setTagValue('2', current ? current + '\\p' + escaped : escaped);
		secondaryInput = '';
	}

	function removeSecondaryImage(index: number) {
		const parts = secondaryRaw ? secondaryRaw.split('\\p') : [];
		parts.splice(index, 1);
		setTagValue('2', parts.join('\\p'));
	}

	function handleSecondaryKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); addSecondaryImage(); }
	}

	const MAX_SECONDARY = 4;
	const canAddMore = $derived(secondaryImages.length < MAX_SECONDARY);
</script>

<div class="panel">
	<h3>Images</h3>

	<section class="field-group">
		<label for="ev-image">
			Primary Image
			<HintIcon tip="The main visual for your event. Used as a background or hero image depending on the style." />
		</label>
		<SvgImageInput value={image} onUpdate={onUpdateImage} placeholder="https://… or paste SVG" />
	</section>

	<section class="field-group">
		<label>
			Additional Images <span class="image-limit">(up to {MAX_SECONDARY})</span>
			<HintIcon tip="Shown in a carousel or gallery depending on the style. Good for showing the venue, past events, or supporting visuals." />
		</label>

		{#if secondaryImages.length > 0}
			<ul class="image-list">
				{#each secondaryImages as url, i}
					<li class="image-list-item">
						<img src={url} alt="Additional image {i + 1}" class="image-thumb" />
						<span class="image-url">{url}</span>
						<button class="remove-btn" onclick={() => removeSecondaryImage(i)} aria-label="Remove image">×</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if canAddMore}
			<div class="image-add-row">
				<input
					type="url"
					bind:value={secondaryInput}
					onkeydown={handleSecondaryKeydown}
					placeholder="https://... and press Enter"
					aria-label="Add image URL"
				/>
				<button class="add-btn" onclick={addSecondaryImage} disabled={!secondaryInput.trim()}>Add</button>
			</div>
		{:else}
			<p class="field-hint">Maximum {MAX_SECONDARY} additional images reached.</p>
		{/if}
	</section>
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

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.image-limit {
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.field-group input {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.field-group input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.image-preview {
		border-radius: var(--radius-sm);
		overflow: hidden;
		max-height: 200px;
	}

	.image-preview img {
		width: 100%;
		height: 200px;
		object-fit: cover;
		display: block;
	}

	.image-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.image-list-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.image-thumb {
		width: 40px;
		height: 40px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.image-url {
		flex: 1;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-btn {
		background: none;
		border: none;
		font-size: 1rem;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 0 2px;
		flex-shrink: 0;
	}

	.remove-btn:hover {
		color: var(--color-danger, #dc2626);
	}

	.image-add-row {
		display: flex;
		gap: var(--space-2);
	}

	.image-add-row input {
		flex: 1;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.image-add-row input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.add-btn {
		padding: var(--space-1) var(--space-3);
		background: var(--color-primary);
		color: var(--color-primary-text);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		white-space: nowrap;
	}

	.add-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.add-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>

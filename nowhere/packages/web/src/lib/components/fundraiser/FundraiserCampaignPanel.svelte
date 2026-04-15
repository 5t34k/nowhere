<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import NpubInput from '../NpubInput.svelte';
	import HintIcon from '../HintIcon.svelte';
	import SvgImageInput from '../SvgImageInput.svelte';
	import { isSvgString } from '$lib/utils/svg';

	interface Props {
		pubkey: string;
		name: string;
		image: string;
		tags: Tag[];
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, name, image, tags, onUpdate }: Props = $props();

	let forceSvgMode = $state(isSvgString(image));
	const isSvgMode = $derived(forceSvgMode || isSvgString(image));

	function switchToSvg() {
		forceSvgMode = true;
		onUpdate('image', '');
	}

	function switchToUrls() {
		forceSvgMode = false;
		onUpdate('image', '');
	}

	let localImages: string[] = $state([]);

	$effect(() => {
		localImages = image ? image.split(' ').filter(Boolean) : [''];
	});

	function updateImages(newImages: string[]) {
		localImages = newImages;
		const joined = newImages.filter(Boolean).join(' ');
		onUpdate('image', joined);
	}

	function setImage(i: number, value: string) {
		const updated = [...localImages];
		updated[i] = value;
		updateImages(updated);
	}

	function removeImage(i: number) {
		const updated = localImages.filter((_, idx) => idx !== i);
		if (updated.length === 0) updated.push('');
		updateImages(updated);
	}

	function addImage() {
		if (localImages.length >= 8) return;
		localImages = [...localImages, ''];
	}

	const creator = $derived(tags.find((t) => t.key === 'T')?.value ?? '');
	const currency = $derived(tags.find((t) => t.key === '$')?.value ?? 'USD');
	const goalRaw = $derived(tags.find((t) => t.key === 'g')?.value ?? '');
	const goalDisplay = $derived(goalRaw ? (parseInt(goalRaw, 10) / 100).toString() : '');
	const deadline = $derived(tags.find((t) => t.key === 'h')?.value ?? '');

	function setTagValue(key: string, value: string, defaultValue?: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value && value !== defaultValue) newTags.push({ key, value });
		onUpdate('tags', newTags);
	}

	function setCurrency(value: string) {
		setTagValue('$', value, 'USD');
	}

	function setGoal(value: string) {
		if (!value) {
			setTagValue('g', '');
			return;
		}
		const num = parseFloat(value);
		if (!isNaN(num) && num >= 0) {
			setTagValue('g', Math.round(num * 100).toString());
		}
	}

	function setDeadline(value: string) {
		setTagValue('h', value);
	}
</script>

<div class="panel">
	<h3>Campaign</h3>

	<section class="field-group">
		<label for="fr-pubkey">Public Key <HintIcon tip="Your Nostr public key (npub). Adds a verifiable organiser identity to your fundraiser." /></label>
		<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} required={false} />
	</section>

	<section class="field-group">
		<label for="fr-name">Campaign Name <span class="required">*</span></label>
		<input
			id="fr-name"
			type="text"
			value={name}
			onchange={(e) => onUpdate('name', e.currentTarget.value)}
			placeholder="Campaign name"
		/>
	</section>

	<section class="field-group">
		<label for="fr-creator">
			Campaign Creator
			<HintIcon tip="The name of the person or organization behind this campaign." />
		</label>
		<input
			id="fr-creator"
			type="text"
			value={creator}
			onchange={(e) => setTagValue('T', e.currentTarget.value)}
			placeholder="Your name or organization"
		/>
	</section>

	<section class="field-group">
		<label>
			Cover Images
			<HintIcon tip="Hero images displayed at the top of your fundraiser page. Use image URLs for a carousel, or paste/upload an SVG." />
		</label>
		{#if isSvgMode}
			<SvgImageInput value={image} onUpdate={(v) => onUpdate('image', v)} />
			<button class="mode-toggle" onclick={switchToUrls}>Use image URLs instead</button>
		{:else}
			<div class="image-list">
				{#each localImages as img, i}
					<div class="image-row">
						<input
							type="text"
							value={img}
							onchange={(e) => setImage(i, e.currentTarget.value)}
							placeholder="https://..."
						/>
						{#if localImages.length > 1}
							<button class="remove-img-btn" onclick={() => removeImage(i)} aria-label="Remove image" title="Remove">&times;</button>
						{/if}
					</div>
				{/each}
				{#if localImages.length < 8}
					<button class="add-img-btn" onclick={addImage}>+ Add image</button>
				{/if}
			</div>
			{#if localImages.filter(Boolean).length > 0}
				<div class="image-preview">
					<img src={localImages.find(Boolean)} alt="Cover preview" />
				</div>
			{/if}
			<button class="mode-toggle" onclick={switchToSvg}>Use SVG instead</button>
		{/if}
	</section>

	<section class="field-group">
		<label for="fr-currency">Currency <HintIcon tip="Currency for the fundraising goal amount." /></label>
		<select id="fr-currency" value={currency} onchange={(e) => setCurrency(e.currentTarget.value)}>
			<option value="USD">USD ($)</option>
			<option value="EUR">EUR (&euro;)</option>
			<option value="GBP">GBP (&pound;)</option>
			<option value="JPY">JPY (&yen;)</option>
			<option value="CAD">CAD ($)</option>
			<option value="AUD">AUD ($)</option>
			<option value="CHF">CHF</option>
			<option value="CNY">CNY (&yen;)</option>
			<option value="BRL">BRL (R$)</option>
			<option value="MXN">MXN ($)</option>
			<option value="sats">BTC (sats)</option>
		</select>
	</section>

	<section class="field-group">
		<label for="fr-goal">
			Goal Amount
			<HintIcon tip="Optional fundraising target. Leave empty for no goal." />
		</label>
		<input
			id="fr-goal"
			type="text"
			inputmode="decimal"
			value={goalDisplay}
			onchange={(e) => setGoal(e.currentTarget.value)}
			placeholder="5000"
		/>
	</section>

	<section class="field-group">
		<label for="fr-deadline">
			Deadline
			<HintIcon tip="Optional deadline date. Shown as a countdown on the page." />
		</label>
		<input
			id="fr-deadline"
			type="date"
			value={deadline}
			onchange={(e) => setDeadline(e.currentTarget.value)}
		/>
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
		gap: var(--space-1);
	}

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.required {
		color: var(--color-danger, #dc2626);
	}

	.field-group input,
	.field-group select {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.field-group input:focus,
	.field-group select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.image-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.image-row {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}

	.image-row input {
		flex: 1;
		min-width: 0;
	}

	.remove-img-btn {
		width: 28px;
		height: 28px;
		border: 1px solid var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.remove-img-btn:hover {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.add-img-btn {
		border: 1px dashed var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
		text-align: center;
	}

	.add-img-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.image-preview {
		padding: var(--space-2);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
	}

	.image-preview img {
		width: 100%;
		max-height: 200px;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}

	.mode-toggle {
		background: none;
		border: none;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		padding: 0;
		align-self: flex-start;
		font-family: inherit;
	}

	.mode-toggle:hover {
		color: var(--color-text-secondary);
	}
</style>

<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from './HintIcon.svelte';

	interface Props {
		index: number;
		name: string;
		price: string;
		description: string;
		image: string;
		tags: Tag[];
		weightUnit: string;
		collapseKey?: number;
		targetExpanded?: boolean;
		onUpdate: (field: string, value: unknown) => void;
		onRemove: () => void;
		onClone: () => void;
		onDragStart: (e: DragEvent) => void;
		onDragOver: (e: DragEvent) => void;
		onDragEnd: () => void;
		onDrop: (e: DragEvent) => void;
	}

	let { index, name, price, description, image, tags, weightUnit, collapseKey, targetExpanded, onUpdate, onRemove, onClone, onDragStart, onDragOver, onDragEnd, onDrop }: Props = $props();

	let expanded = $state(true);
	let lastCollapseKey = $state(-1);

	$effect(() => {
		if (collapseKey !== undefined && collapseKey !== lastCollapseKey) {
			lastCollapseKey = collapseKey;
			expanded = targetExpanded ?? true;
		}
	});
	let optionsOpen = $state(false);
	let checkoutOpen = $state(false);

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

	// Item-level tags
	const isDigital = $derived(tags.some((t) => t.key === 'd'));
	const isFeatured = $derived(tags.some((t) => t.key === 'f'));
	const maxQty = $derived(tags.find((t) => t.key === 'q')?.value ?? '');
	const category = $derived(tags.find((t) => t.key === 'g')?.value ?? '');
	const variantsRaw = $derived(tags.find((t) => t.key === 'v')?.value ?? '');
	const variantsDisplay = $derived(variantsRaw.replace(/\./g, ', '));
	const weight = $derived(tags.find((t) => t.key === 'W')?.value ?? '');

	function toggleTag(key: string) {
		const has = tags.some((t) => t.key === key);
		const newTags = has ? tags.filter((t) => t.key !== key) : [...tags, { key }];
		onUpdate('tags', newTags);
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate('tags', newTags);
	}

	function handleVariantsInput(value: string) {
		setTagValue('v', value.replace(/,\s*/g, '.'));
	}

	// Checkout field override helpers - same pattern as TagsPanel
	function getCheckoutFieldState(lower: string, upper: string): 'default' | 'optional' | 'required' {
		if (tags.some((t) => t.key === upper)) return 'required';
		if (tags.some((t) => t.key === lower)) return 'optional';
		return 'default';
	}

	function setCheckoutField(lower: string, upper: string, state: string) {
		const newTags = tags.filter((t) => t.key !== lower && t.key !== upper);
		if (state === 'required') newTags.push({ key: upper });
		else if (state === 'optional') newTags.push({ key: lower });
		onUpdate('tags', newTags);
	}

	const customTextField = $derived(tags.find((t) => t.key === 't')?.value ?? '');
</script>

<div
	class="item-editor"
	ondragover={onDragOver}
	ondrop={onDrop}
>
	<div
		class="item-header"
		draggable="true"
		role="button"
		tabindex="0"
		ondragstart={onDragStart}
		ondragend={onDragEnd}
		onclick={() => (expanded = !expanded)}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expanded = !expanded; } }}
	>
		<div class="header-left">
			<span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">&#9776;</span>
			<span class="item-label">Item {index + 1}{name ? ` - ${name}` : ''}</span>
		</div>
		<div class="item-actions">
			<button class="icon-btn" onclick={(e) => { e.stopPropagation(); onClone(); }} aria-label="Clone item" title="Clone">&#10697;</button>
			<button class="icon-btn icon-btn--danger" onclick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Delete item" title="Delete">&#10005;</button>
			<span class="chevron" class:open={expanded}>&#9660;</span>
		</div>
	</div>

	{#if expanded}
		<div class="item-body">
			<div class="field">
				<label for="item-name-{index}">Name <span class="required">*</span></label>
				<input id="item-name-{index}" type="text" value={name} onchange={(e) => onUpdate('name', e.currentTarget.value)} required />
			</div>

			<div class="field">
				<label for="item-price-{index}">Price <span class="required">*</span></label>
				<input id="item-price-{index}" type="number" step="0.01" min="0" value={price} onchange={(e) => onUpdate('price', e.currentTarget.value)} required />
			</div>

			<div class="field">
				<label for="item-desc-{index}">Description</label>
				<input id="item-desc-{index}" type="text" value={description} onchange={(e) => onUpdate('description', e.currentTarget.value)} />
			</div>

			<div class="field">
				<label>Images (emoji or URL)</label>
				<div class="image-list">
					{#each localImages as img, i}
						<div class="image-row">
							<input
								type="text"
								value={img}
								onchange={(e) => setImage(i, e.currentTarget.value)}
								placeholder="e.g. https://... or an emoji"
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
				<span class="field-hint">First image shown in grid. All shown in product detail.</span>
			</div>

			<div class="tags-section">
				<button class="section-toggle" onclick={() => (optionsOpen = !optionsOpen)}>
					<span class="section-label">Item Options</span>
					<span class="section-chevron" class:open={optionsOpen}>&#9660;</span>
				</button>
				{#if optionsOpen}
					<div class="tag-toggles">
						<label class="tag-toggle">
							<input type="checkbox" checked={isDigital} onchange={() => toggleTag('d')} />
							Digital item <HintIcon tip="Digital items skip shipping address collection at checkout." />
						</label>
						<label class="tag-toggle">
							<input type="checkbox" checked={isFeatured} onchange={() => toggleTag('f')} />
							Featured <HintIcon tip="Featured items are shown larger and first in the product grid." />
						</label>
					</div>

					<div class="tag-fields">
						<div class="field-sm">
							<label for="item-cat-{index}">Category <HintIcon tip="Optional grouping label. Same category = same section in the store." /></label>
							<input id="item-cat-{index}" type="text" value={category} onchange={(e) => setTagValue('g', e.currentTarget.value)} placeholder="e.g. clothing" />
						</div>
						<div class="field-sm">
							<label for="item-qty-{index}">Max Qty <HintIcon tip="Per-order quantity limit. 0 or empty means unlimited." /></label>
							<input id="item-qty-{index}" type="number" min="1" value={maxQty} onchange={(e) => setTagValue('q', e.currentTarget.value)} />
						</div>
						<div class="field-sm">
							<label for="item-var-{index}">Variants <HintIcon tip="Product options like size or color. Buyer picks one at checkout." /></label>
							<input id="item-var-{index}" type="text" value={variantsDisplay} onchange={(e) => handleVariantsInput(e.currentTarget.value)} placeholder="S, M, L, XL" />
							<span class="field-hint">Separate with commas</span>
						</div>
						<div class="field-sm">
							<label for="item-wt-{index}">Weight ({weightUnit}) <HintIcon tip="Weight per unit. Multiplied by quantity for shipping surcharge." /></label>
							<input id="item-wt-{index}" type="number" min="0" value={weight} onchange={(e) => setTagValue('W', e.currentTarget.value)} />
						</div>
					</div>
				{/if}
			</div>

			<div class="tags-section">
				<button class="section-toggle" onclick={() => (checkoutOpen = !checkoutOpen)}>
					<span class="section-label">Checkout Overrides <HintIcon tip="Per-item overrides. 'Default' uses the store-level setting from Checkout Options." /></span>
					<span class="section-chevron" class:open={checkoutOpen}>&#9660;</span>
				</button>
				{#if checkoutOpen}
					<p class="section-hint">Override store-level checkout fields for this item. 'Default' inherits the store setting.</p>

					<div class="checkout-grid">
						{#each [
							{ label: 'Email', lower: 'e', upper: 'E' },
							{ label: 'Name', lower: 'n', upper: 'N' },
							{ label: 'Address', lower: 'a', upper: 'A' },
							{ label: 'Phone', lower: 'p', upper: 'P' },
							{ label: 'Nostr npub', lower: 'z', upper: 'Z' }
						] as field}
							<div class="checkout-field">
								<span class="checkout-label">{field.label}</span>
								<select
									value={getCheckoutFieldState(field.lower, field.upper)}
									onchange={(e) => setCheckoutField(field.lower, field.upper, e.currentTarget.value)}
								>
									<option value="default">Default</option>
									<option value="optional">Optional</option>
									<option value="required">Required</option>
								</select>
							</div>
						{/each}
					</div>

					<div class="field-sm" style="margin-top: var(--space-2)">
						<label for="item-custom-text-{index}">Custom Text Field <HintIcon tip="Adds a free-text input at checkout for this item. Use for personalization, special requests, etc." /></label>
						<input
							id="item-custom-text-{index}"
							type="text"
							value={customTextField}
							onchange={(e) => setTagValue('t', e.currentTarget.value)}
							placeholder="e.g. Engraving text"
						/>
						<span class="field-hint">Adds a text input on checkout for this item</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.item-editor {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.item-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-secondary);
		font-weight: 600;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		user-select: none;
	}

	.item-header:hover {
		background: var(--color-bg-tertiary);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.drag-handle {
		cursor: grab;
		font-size: var(--text-base);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.item-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.icon-btn {
		width: 28px;
		height: 28px;
		border: none;
		background: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn:hover {
		background: var(--color-bg);
	}

	.icon-btn--danger:hover {
		color: var(--color-error);
	}

	.chevron {
		font-size: 10px;
		transition: transform var(--transition-fast);
		margin-left: var(--space-2);
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.item-body {
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.required {
		color: var(--color-danger, #dc2626);
	}

	input[type='text'],
	input[type='number'] {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.tags-section {
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.section-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.section-chevron {
		font-size: 8px;
		color: var(--color-text-muted);
		transition: transform var(--transition-fast);
	}

	.section-chevron.open {
		transform: rotate(180deg);
	}

	.tag-toggles {
		display: flex;
		gap: var(--space-4);
		margin-top: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.tag-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--color-text);
	}

	.tag-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	.field-sm {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.field-sm label {
		font-size: 11px;
	}

	.field-sm input {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.field-hint {
		font-size: 10px;
		color: var(--color-text-muted);
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

	.checkout-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-1) var(--space-2);
		margin-top: var(--space-2);
	}

	.checkout-field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.checkout-label {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.checkout-field select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		background: var(--color-bg);
	}

	.section-hint {
		font-size: 10px;
		color: var(--color-text-muted);
		margin-top: var(--space-1);
	}
</style>

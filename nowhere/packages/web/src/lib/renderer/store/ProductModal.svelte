<script lang="ts">
	import type { Item, Tag } from '@nowhere/codec';
	import { formatCurrency } from '@nowhere/codec';
	import ImageDisplay from './ImageDisplay.svelte';
	import ImageCarousel from './ImageCarousel.svelte';
	import ImageGallery from './ImageGallery.svelte';

	interface Props {
		item: Item;
		currency: string;
		storeTags?: Tag[];
		stockLevel?: number;
		storeClosed?: boolean;
		onclose: () => void;
		onadd: (item: Item, qty: number) => void;
	}

	let { item, currency, storeTags = [], stockLevel, storeClosed, onclose, onadd }: Props = $props();

	let quantity = $state(1);
	let added = $state(false);

	const images = $derived(item.image?.split(' ').filter(Boolean) ?? []);
	let carouselIndex = $state(0);
	let galleryOpen = $state(false);

	$effect(() => {
		// Reset carousel and added state when item changes
		void item;
		carouselIndex = 0;
		galleryOpen = false;
		added = false;
	});

	const maxQty = $derived.by(() => {
		const qTag = item.tags.find((t: Tag) => t.key === 'q');
		return qTag?.value ? parseInt(qTag.value, 10) : 99;
	});

	const isDigital = $derived(item.tags.some((t: Tag) => t.key === 'd'));
	const isDiscontinued = $derived(stockLevel === 0);
	const isOutOfStock = $derived(isDiscontinued || stockLevel === 1 || item.tags.some((t: Tag) => t.key === 'o'));
	const isNameYourPrice = $derived(item.tags.some((t: Tag) => t.key === 'y'));
	const hasVariants = $derived.by(() => {
		const vTag = item.tags.find((t: Tag) => t.key === 'v');
		return vTag?.value ? vTag.value.split('.') : null;
	});
	const deliveryDays = $derived.by(() => {
		const dTag = item.tags.find((t: Tag) => t.key === 'D');
		if (dTag?.value) return dTag.value;
		const storeTag = storeTags.find((t: Tag) => t.key === 'D');
		return storeTag?.value ?? null;
	});

	let selectedVariant = $state('');

	const lineTotal = $derived(formatCurrency(item.price * quantity, currency));

	function handleAdd() {
		if (added || isOutOfStock) return;
		onadd(item, quantity);
		added = true;
		setTimeout(() => {
			added = false;
			onclose();
		}, 800);
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (galleryOpen) {
				// Gallery handles its own Escape
				return;
			}
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdrop}>
	<div class="modal" role="dialog" aria-label={item.name}>
		<button class="close-btn" onclick={onclose} aria-label="Close">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>

		<div class="modal-content">
			<div class="modal-image">
				{#if images.length > 0}
					<ImageCarousel
						{images}
						name={item.name}
						activeIndex={carouselIndex}
						onchange={(i) => (carouselIndex = i)}
						ontap={() => (galleryOpen = true)}
					/>
				{:else}
					<ImageDisplay image={item.image} name={item.name} size="lg" />
				{/if}
			</div>

			<div class="modal-details">
				<h2 class="modal-name">{item.name}</h2>

				<div class="modal-price">
					{#if isNameYourPrice}
						<span class="nyp">Name your price</span>
					{:else}
						{formatCurrency(item.price, currency)}
					{/if}
				</div>

				{#if item.description}
					<p class="modal-desc">{item.description}</p>
				{/if}

				{#if hasVariants}
					<div class="variant-select">
						<label for="variant">Option</label>
						<select id="variant" bind:value={selectedVariant}>
							<option value="">Select...</option>
							{#each hasVariants as variant}
								<option value={variant}>{variant}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if deliveryDays}
					<p class="delivery">Delivery: ~{deliveryDays} days</p>
				{/if}

				{#if !isOutOfStock && !storeClosed}
					<div class="qty-row">
						<span class="qty-label">Quantity</span>
						<div class="qty-control">
							<button onclick={() => (quantity = Math.max(1, quantity - 1))} aria-label="Decrease quantity">-</button>
							<span class="qty-value">{quantity}</span>
							<button onclick={() => (quantity = Math.min(maxQty, quantity + 1))} aria-label="Increase quantity">+</button>
						</div>
					</div>
				{/if}

				<button class="btn-add" class:added onclick={handleAdd} disabled={isOutOfStock || storeClosed}>
					{storeClosed
						? 'Store Closed'
						: isDiscontinued
							? 'Discontinued'
							: isOutOfStock
								? 'Sold Out'
								: added ? 'Added' : `Add to Cart - ${lineTotal}`}
				</button>
			</div>
		</div>
	</div>
</div>

{#if galleryOpen && images.length > 0}
	<ImageGallery
		{images}
		name={item.name}
		startIndex={carouselIndex}
		onclose={() => (galleryOpen = false)}
		onchange={(i) => (carouselIndex = i)}
	/>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.modal {
		background: var(--color-bg);
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		position: relative;
	}

	.close-btn {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		background: var(--color-bg);
		border: none;
		border-radius: var(--radius-full);
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
		box-shadow: var(--shadow-sm);
	}

	.close-btn:hover {
		background: var(--color-bg-secondary);
	}

	.modal-content {
		display: flex;
		flex-direction: column;
	}

	.modal-image {
		width: 100%;
	}

	.modal-image :global(.image-display) {
		border-radius: 0;
		aspect-ratio: 4/3;
	}

	.modal-image :global(.carousel) {
		aspect-ratio: 4/3;
	}

	.modal-details {
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.modal-name {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.modal-price {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.nyp {
		font-style: italic;
		font-weight: 400;
		color: var(--color-text-secondary);
	}

	.modal-desc {
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.variant-select {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.variant-select label {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.variant-select select {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.delivery {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.qty-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.qty-label {
		font-weight: 500;
	}

	.qty-control {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.qty-control button {
		width: 36px;
		height: 36px;
		border: none;
		background: none;
		font-size: var(--text-lg);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.qty-control button:hover {
		background: var(--color-bg-secondary);
	}

	.qty-value {
		min-width: 2rem;
		text-align: center;
		font-weight: 600;
	}

	.btn-add {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: var(--text-base);
		font-weight: 600;
		transition: background 300ms ease, color 300ms ease;
	}

	.btn-add.added {
		background: #9ca3af;
		pointer-events: none;
	}

	.btn-add:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (min-width: 768px) {
		.modal-backdrop {
			align-items: center;
		}

		.modal {
			max-width: 860px;
			border-radius: var(--radius-lg);
			max-height: 85vh;
		}

		.modal-content {
			flex-direction: row;
		}

		.modal-image {
			width: 50%;
			flex-shrink: 0;
		}

		.modal-image :global(.image-display) {
			border-radius: var(--radius-lg) 0 0 var(--radius-lg);
			height: 100%;
			aspect-ratio: auto;
		}

		.modal-image :global(.carousel) {
			height: 100%;
			aspect-ratio: unset;
			border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		}

		.modal-details {
			width: 50%;
			padding: var(--space-6);
			gap: var(--space-4);
		}
	}
</style>

<script lang="ts">
	import type { Item, Tag } from '@nowhere/codec';
	import { formatCurrency } from '@nowhere/codec';
	import ImageDisplay from './ImageDisplay.svelte';

	interface Props {
		item: Item;
		currency: string;
		stockLevel?: number;
		storeClosed?: boolean;
		onselect: (item: Item) => void;
		onadd: (item: Item, qty?: number) => void;
	}

	let { item, currency, stockLevel, storeClosed, onselect, onadd }: Props = $props();

	let added = $state(false);
	let addedTimer: ReturnType<typeof setTimeout>;
	let quantity = $state(1);

	const isDigital = $derived(item.tags.some((t: Tag) => t.key === 'd'));
	const isDiscontinued = $derived(stockLevel === 0);
	const isOutOfStock = $derived(isDiscontinued || stockLevel === 1 || item.tags.some((t: Tag) => t.key === 'o'));
	const isLowStock = $derived(stockLevel === 2);
	const isFeatured = $derived(item.tags.some((t: Tag) => t.key === 'f'));
	const isNameYourPrice = $derived(item.tags.some((t: Tag) => t.key === 'y'));
	const isContactToOrder = $derived(item.tags.some((t: Tag) => t.key === 'C'));

	const maxQty = $derived.by(() => {
		const qTag = item.tags.find((t: Tag) => t.key === 'q');
		return qTag?.value ? parseInt(qTag.value, 10) : 99;
	});

	const lineTotal = $derived(formatCurrency(item.price * quantity, currency));

	const descIntro = $derived(
		item.description ? item.description.split(/\n/)[0] : ''
	);
	const descHasMore = $derived(!!item.description);

	function handleAdd(e: MouseEvent) {
		e.stopPropagation();
		if (!isOutOfStock && !added) {
			onadd(item, isFeatured ? quantity : undefined);
			added = true;
			clearTimeout(addedTimer);
			addedTimer = setTimeout(() => (added = false), 1400);
		}
	}

	function handleQty(e: MouseEvent, delta: number) {
		e.stopPropagation();
		quantity = Math.max(1, Math.min(maxQty, quantity + delta));
	}
</script>

<div
	class="product-card"
	class:featured={isFeatured}
	role="button"
	tabindex="0"
	onclick={() => onselect(item)}
	onkeydown={(e) => e.key === 'Enter' && onselect(item)}
>
	<ImageDisplay image={item.image} name={item.name} />

	<div class="card-body">
		<h3 class="card-name">{item.name}</h3>

		<div class="card-price">
			{#if isNameYourPrice}
				<span class="nyp">Name your price</span>
			{:else}
				{formatCurrency(item.price, currency)}
			{/if}
		</div>

		{#if isFeatured && descIntro}
			<div class="card-desc-wrap">
				<p class="card-desc">{descIntro}</p>
				{#if descHasMore}
					<button class="read-more" onclick={(e) => { e.stopPropagation(); onselect(item); }}>Read more</button>
				{/if}
			</div>
		{/if}

		{#if isDigital || isOutOfStock || isLowStock}
			<div class="card-badges">
				{#if isDigital}
					<span class="badge">Digital</span>
				{/if}
				{#if isDiscontinued}
					<span class="badge badge--out">Discontinued</span>
				{:else if isOutOfStock}
					<span class="badge badge--out">Sold out</span>
				{:else if isLowStock}
					<span class="badge badge--low">Low Stock</span>
				{/if}
			</div>
		{/if}

		{#if storeClosed}
			<button class="btn-add" disabled>Store Closed</button>
		{:else if isContactToOrder}
			<button class="btn-add" disabled>Contact to Order</button>
		{:else if isOutOfStock}
			<button class="btn-add" disabled>{isDiscontinued ? 'Discontinued' : 'Sold Out'}</button>
		{:else}
			<div class="card-actions">
				{#if isFeatured}
					<div class="qty-row">
						<span class="qty-label">Quantity</span>
						<div class="qty-control">
							<button onclick={(e) => handleQty(e, -1)} aria-label="Decrease quantity">-</button>
							<span class="qty-value">{quantity}</span>
							<button onclick={(e) => handleQty(e, 1)} aria-label="Increase quantity">+</button>
						</div>
					</div>
				{/if}
				<button class="btn-add" class:added onclick={handleAdd}>
					{added ? 'Added' : isFeatured ? `Add to Cart - ${lineTotal}` : 'Add to Cart'}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.product-card {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--color-border);
		overflow: hidden;
		cursor: pointer;
		transition: box-shadow var(--transition-fast), transform var(--transition-fast);
		display: flex;
		flex-direction: column;
	}

	.product-card:hover,
	.product-card:focus-visible {
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	.product-card:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.product-card.featured {
		grid-column: span 2;
		flex-direction: row;
		border-color: var(--color-primary);
	}

	.product-card.featured :global(.image-display) {
		width: 50%;
		flex-shrink: 0;
		aspect-ratio: auto;
		height: 100%;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.product-card.featured .card-body {
		justify-content: center;
		padding: var(--space-4);
		gap: var(--space-3);
	}

	.product-card.featured .card-name {
		font-size: var(--text-lg);
		white-space: normal;
	}

	.product-card.featured .card-price {
		font-size: var(--text-xl);
	}

	.card-desc-wrap {
		min-height: 0;
	}

	.card-desc {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.read-more {
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-sm);
		color: var(--color-primary);
		cursor: pointer;
		font-weight: 500;
		margin-top: var(--space-1);
	}

	.read-more:hover {
		text-decoration: underline;
	}

	.card-actions {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.qty-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.qty-label {
		font-weight: 500;
		font-size: var(--text-sm);
	}

	.qty-control {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.qty-control button {
		width: 32px;
		height: 32px;
		border: none;
		background: none;
		font-size: var(--text-base);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.qty-control button:hover {
		background: var(--color-bg-secondary);
	}

	.qty-value {
		min-width: 1.5rem;
		text-align: center;
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.card-body {
		padding: var(--space-3) var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		flex: 1;
	}

	.card-name {
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-price {
		font-size: var(--text-base);
		font-weight: 700;
	}

	.nyp {
		font-style: italic;
		font-weight: 400;
		color: var(--color-text-secondary);
	}

	.card-badges {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}

	.badge {
		font-size: var(--text-xs);
		padding: 2px 6px;
		border-radius: var(--radius-full);
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
	}

	.badge--out {
		background: var(--color-error);
		color: white;
	}

	.badge--low {
		background: var(--color-warning);
		color: #1a1a1a;
	}

	.btn-add {
		margin-top: auto;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: var(--text-sm);
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
</style>

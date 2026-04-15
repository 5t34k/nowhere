<script lang="ts">
	import type { Item, Tag } from '@nowhere/codec';
	import ProductCard from './ProductCard.svelte';

	interface Props {
		items: Item[];
		currency: string;
		stockLevels?: Record<string, number>;
		storeClosed?: boolean;
		onselect: (item: Item) => void;
		onadd: (item: Item, qty?: number) => void;
	}

	let { items, currency, stockLevels, storeClosed, onselect, onadd }: Props = $props();

	// Extract categories from items
	const categories = $derived.by(() => {
		const cats = new Set<string>();
		for (const item of items) {
			const catTag = item.tags.find((t: Tag) => t.key === 'g');
			if (catTag?.value) cats.add(catTag.value);
		}
		return Array.from(cats);
	});

	let activeCategory = $state<string | null>(null);
	let sortBy = $state<'default' | 'price-asc' | 'price-desc' | 'name'>('default');

	const filteredItems = $derived.by(() => {
		let result = [...items];
		if (activeCategory) {
			result = result.filter((item) =>
				item.tags.some((t: Tag) => t.key === 'g' && t.value === activeCategory)
			);
		}

		switch (sortBy) {
			case 'price-asc':
				return [...result].sort((a, b) => a.price - b.price);
			case 'price-desc':
				return [...result].sort((a, b) => b.price - a.price);
			case 'name':
				return [...result].sort((a, b) => a.name.localeCompare(b.name));
			default:
				return [...result].sort((a, b) => {
					const af = a.tags.some((t: Tag) => t.key === 'f') ? 0 : 1;
					const bf = b.tags.some((t: Tag) => t.key === 'f') ? 0 : 1;
					return af - bf;
				});
		}
	});

	const isSingleItem = $derived(items.length === 1);
</script>

<section class="product-grid-section">
	{#if categories.length > 0 || items.length > 3}
		<div class="controls">
			{#if categories.length > 0}
				<div class="categories" role="tablist">
					<button
						class="cat-pill"
						class:active={!activeCategory}
						onclick={() => (activeCategory = null)}
						role="tab"
						aria-selected={!activeCategory}
					>All</button>
					{#each categories as cat}
						<button
							class="cat-pill"
							class:active={activeCategory === cat}
							onclick={() => (activeCategory = activeCategory === cat ? null : cat)}
							role="tab"
							aria-selected={activeCategory === cat}
						>{cat}</button>
					{/each}
				</div>
			{/if}

			{#if items.length > 3}
				<select class="sort-select" bind:value={sortBy} aria-label="Sort products">
					<option value="default">Default order</option>
					<option value="price-asc">Price: Low to High</option>
					<option value="price-desc">Price: High to Low</option>
					<option value="name">Name</option>
				</select>
			{/if}
		</div>
	{/if}

	<div class="grid" class:single={isSingleItem}>
		{#each filteredItems as item (item.name)}
			{@const idx = items.indexOf(item)}
			<ProductCard {item} {currency} stockLevel={stockLevels?.[String(idx)]} {storeClosed} {onselect} {onadd} />
		{/each}
	</div>
</section>

<style>
	.product-grid-section {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-4);
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
	}

	.categories {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.cat-pill {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		background: var(--color-bg);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
		text-transform: capitalize;
	}

	.cat-pill:hover {
		border-color: var(--color-text-muted);
	}

	.cat-pill.active {
		background: var(--color-primary);
		color: var(--color-primary-text);
		border-color: var(--color-primary);
	}

	.sort-select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-4);
	}

	.grid.single {
		grid-template-columns: 1fr;
		max-width: 320px;
		margin: 0 auto;
	}

	@media (min-width: 480px) {
		.grid:not(.single) {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 768px) {
		.grid:not(.single) {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.grid:not(.single) {
			grid-template-columns: repeat(4, 1fr);
		}
	}
</style>

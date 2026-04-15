<script lang="ts">
	import type { CartItem } from '$lib/renderer/stores/cart.js';
	import type { Tag } from '@nowhere/codec';
	import { formatCurrency } from '@nowhere/codec';

	interface Props {
		cartItem: CartItem;
		currency: string;
		unavailable?: boolean;
		onUpdateQty: (qty: number) => void;
		onRemove: () => void;
	}

	let { cartItem, currency, unavailable = false, onUpdateQty, onRemove }: Props = $props();

	const maxQty = $derived.by(() => {
		const qTag = cartItem.item.tags.find((t: Tag) => t.key === 'q');
		return qTag?.value ? parseInt(qTag.value, 10) : 99;
	});

	const lineTotal = $derived(formatCurrency(cartItem.item.price * cartItem.qty, currency));
</script>

<div class="cart-item" class:unavailable>
	<div class="item-icon">
		{#if cartItem.item.image && !cartItem.item.image.startsWith('http')}
			<span class="emoji">{cartItem.item.image}</span>
		{:else}
			<span class="letter">{cartItem.item.name.charAt(0).toUpperCase()}</span>
		{/if}
	</div>

	<div class="item-details">
		<div class="item-name">{cartItem.item.name}</div>
		{#if cartItem.selectedVariant}
			<div class="item-variant">{cartItem.selectedVariant}</div>
		{/if}
		{#if unavailable}
			<div class="unavailable-label">Unavailable — please remove</div>
		{:else}
			<div class="item-qty-row">
				<div class="qty-control">
					<button onclick={() => onUpdateQty(cartItem.qty - 1)} disabled={cartItem.qty <= 1} aria-label="Decrease">-</button>
					<span class="qty">{cartItem.qty}</span>
					<button onclick={() => onUpdateQty(cartItem.qty + 1)} disabled={cartItem.qty >= maxQty} aria-label="Increase">+</button>
				</div>
				<span class="line-total">{lineTotal}</span>
			</div>
		{/if}
	</div>

	<button class="remove-btn" onclick={onRemove} aria-label="Remove {cartItem.item.name}">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
		</svg>
	</button>
</div>

<style>
	.cart-item {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3);
		border-bottom: 1px solid var(--color-border);
		align-items: flex-start;
	}

	.item-icon {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.emoji {
		font-size: 1.25rem;
	}

	.letter {
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.item-details {
		flex: 1;
		min-width: 0;
	}

	.item-name {
		font-weight: 600;
		font-size: var(--text-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-variant {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.item-qty-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--space-1);
	}

	.qty-control {
		display: flex;
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.qty-control button {
		width: 28px;
		height: 28px;
		border: none;
		background: none;
		font-size: var(--text-sm);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.qty-control button:hover:not(:disabled) {
		background: var(--color-bg-secondary);
	}

	.qty-control button:disabled {
		opacity: 0.3;
	}

	.qty {
		min-width: 1.5rem;
		text-align: center;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.line-total {
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.remove-btn {
		background: none;
		border: none;
		padding: var(--space-1);
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.remove-btn:hover {
		color: var(--color-error);
		background: var(--color-bg-secondary);
	}

	.cart-item.unavailable {
		opacity: 0.6;
	}

	.unavailable-label {
		font-size: var(--text-xs);
		color: #e53e3e;
		font-weight: 500;
		margin-top: var(--space-1);
	}
</style>

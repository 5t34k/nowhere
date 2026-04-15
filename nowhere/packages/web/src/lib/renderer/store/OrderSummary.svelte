<script lang="ts">
	import { formatCurrency } from '@nowhere/codec';
	import type { CartItem } from '$lib/renderer/stores/cart.js';

	interface Props {
		items: CartItem[];
		currency: string;
		shippingCurrency?: string;
		subtotal: number;
		discount?: { amount: number; label: string };
		shipping: number;
		total: number;
	}

	let { items, currency, shippingCurrency, subtotal, discount, shipping, total }: Props = $props();

	const shipCurrency = $derived(shippingCurrency || currency);

	let expanded = $state(false);
</script>

<div class="order-summary">
	<button class="summary-toggle" onclick={() => (expanded = !expanded)}>
		<span>{items.length} item{items.length !== 1 ? 's' : ''} - {formatCurrency(total, currency)}</span>
		<svg class="chevron" class:open={expanded} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="6 9 12 15 18 9"/>
		</svg>
	</button>

	{#if expanded}
		<div class="summary-details">
			{#each items as ci}
				<div class="summary-item">
					<span class="item-name">{ci.item.name} x{ci.qty}</span>
					<span>{formatCurrency(ci.item.price * ci.qty, currency)}</span>
				</div>
			{/each}

			<div class="summary-divider"></div>

			<div class="summary-row">
				<span>Subtotal</span>
				<span>{formatCurrency(subtotal, currency)}</span>
			</div>
			{#if discount && discount.amount > 0}
				<div class="summary-row discount-row">
					<span>{discount.label}</span>
					<span>-{formatCurrency(discount.amount, currency)}</span>
				</div>
			{/if}
			{#if shipping > 0}
				<div class="summary-row">
					<span>Shipping{shipCurrency !== currency ? ` (${shipCurrency})` : ''}</span>
					<span>{formatCurrency(shipping, shipCurrency)}</span>
				</div>
			{/if}
			<div class="summary-row summary-row--total">
				<span>Total</span>
				<span>{formatCurrency(total, currency)}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.order-summary {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg-secondary);
	}

	.summary-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border: none;
		background: none;
		font-weight: 600;
	}

	.chevron {
		transition: transform var(--transition-fast);
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.summary-details {
		padding: 0 var(--space-4) var(--space-4);
	}

	.summary-item {
		display: flex;
		justify-content: space-between;
		padding: var(--space-1) 0;
		font-size: var(--text-sm);
	}

	.item-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-right: var(--space-2);
	}

	.summary-divider {
		border-top: 1px solid var(--color-border);
		margin: var(--space-2) 0;
	}

	.summary-row {
		display: flex;
		justify-content: space-between;
		padding: var(--space-1) 0;
		font-size: var(--text-sm);
	}

	.discount-row {
		color: var(--color-success, #22c55e);
	}

	.summary-row--total {
		font-weight: 700;
		font-size: var(--text-base);
	}
</style>

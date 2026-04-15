<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { formatCurrency } from '@nowhere/codec';
	import type { Tag } from '@nowhere/codec';
	import { cart, cartSubtotal, computeDiscount } from '$lib/renderer/stores/cart.js';
	import CartItemComponent from './CartItem.svelte';

	import type { CartItem } from '$lib/renderer/stores/cart.js';

	interface Props {
		open: boolean;
		currency: string;
		storeTags: Tag[];
		storeClosed?: boolean;
		inventoryGate?: 'ok' | 'pending' | 'missing' | 'error';
		onRetryInventory?: () => void;
		hasUnavailable?: boolean;
		isItemUnavailable?: (ci: CartItem) => boolean;
		onClose: () => void;
		onCheckout: () => void;
	}

	let {
		open,
		currency,
		storeTags,
		storeClosed,
		inventoryGate = 'ok',
		onRetryInventory,
		hasUnavailable,
		isItemUnavailable,
		onClose,
		onCheckout
	}: Props = $props();

	const discount = $derived(computeDiscount($cart, storeTags));
	const total = $derived($cartSubtotal - discount.amount);

	const minimumOrder = $derived.by(() => {
		const mTag = storeTags.find((t: Tag) => t.key === 'm');
		if (!mTag?.value) return 0;
		return parseInt(mTag.value, 10) / 100;
	});
	const belowMinimum = $derived(minimumOrder > 0 && ($cartSubtotal - discount.amount) < minimumOrder);

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="drawer-backdrop" transition:fade={{ duration: 250 }} onclick={handleBackdrop}>
		<div class="drawer" transition:fly={{ x: 400, duration: 300 }} role="dialog" aria-label="Shopping cart">
			<div class="drawer-header">
				<h2>Your Cart ({$cart.length})</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close cart">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>

			<div class="drawer-body">
				{#if $cart.length === 0}
					<p class="empty">Your cart is empty.</p>
				{:else}
					{#each $cart as cartItem, i (cartItem.item.name + (cartItem.selectedVariant || ''))}
						<CartItemComponent
							{cartItem}
							{currency}
							unavailable={isItemUnavailable?.(cartItem) ?? false}
							onUpdateQty={(qty) => cart.updateQuantity(i, qty)}
							onRemove={() => cart.removeItem(i)}
						/>
					{/each}
				{/if}
			</div>

			{#if $cart.length > 0}
				<div class="drawer-footer">
					<div class="totals">
						<div class="total-row">
							<span>Subtotal</span>
							<span>{formatCurrency($cartSubtotal, currency)}</span>
						</div>
						{#if discount.amount > 0}
							<div class="total-row discount-row">
								<span>{discount.label}</span>
								<span>-{formatCurrency(discount.amount, currency)}</span>
							</div>
						{/if}
						<div class="total-row total-row--final">
							<span>Total</span>
							<span>{formatCurrency(total, currency)}</span>
						</div>
					</div>

					{#if storeClosed}
						<p class="minimum-warning">This store is currently closed.</p>
					{:else if inventoryGate === 'pending'}
						<p class="minimum-warning">Checking inventory…</p>
					{:else if inventoryGate === 'missing' || inventoryGate === 'error'}
						<p class="minimum-warning">
							Inventory could not be loaded for this store. Please try again later, or contact the seller if the problem persists.
							{#if onRetryInventory}
								<button type="button" class="retry-link" onclick={onRetryInventory}>Retry</button>
							{/if}
						</p>
					{:else if belowMinimum}
						<p class="minimum-warning">Minimum order: {formatCurrency(minimumOrder, currency)}</p>
					{/if}
					{#if hasUnavailable}
						<p class="minimum-warning">Some items are no longer available.</p>
					{/if}
					<button class="checkout-btn" onclick={onCheckout} disabled={belowMinimum || storeClosed || hasUnavailable || inventoryGate !== 'ok'}>Checkout</button>
					<button class="continue-btn" onclick={onClose}>Continue Shopping</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 200;
		display: flex;
		justify-content: flex-end;
	}

	.drawer {
		width: 100%;
		max-width: 400px;
		background: var(--color-bg);
		height: 100%;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-lg);
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border);
	}

	.drawer-header h2 {
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.close-btn {
		background: none;
		border: none;
		padding: var(--space-1);
		color: var(--color-text);
		border-radius: var(--radius-sm);
	}

	.close-btn:hover {
		background: var(--color-bg-secondary);
	}

	.drawer-body {
		flex: 1;
		overflow-y: auto;
	}

	.empty {
		padding: var(--space-8);
		text-align: center;
		color: var(--color-text-muted);
	}

	.drawer-footer {
		border-top: 1px solid var(--color-border);
		padding: var(--space-4);
	}

	.totals {
		margin-bottom: var(--space-4);
	}

	.total-row {
		display: flex;
		justify-content: space-between;
		padding: var(--space-1) 0;
		font-size: var(--text-sm);
	}

	.total-row--final {
		font-weight: 700;
		font-size: var(--text-base);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-2);
		margin-top: var(--space-1);
	}

	.checkout-btn {
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: var(--text-base);
		font-weight: 600;
		margin-bottom: var(--space-2);
		transition: background var(--transition-fast);
	}

	.checkout-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.checkout-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.discount-row {
		color: var(--color-success, #22c55e);
	}

	.minimum-warning {
		font-size: var(--text-sm);
		color: #e53e3e;
		text-align: center;
		margin-bottom: var(--space-2);
	}

	.retry-link {
		background: none;
		border: none;
		padding: 0;
		margin-left: 0.25rem;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.continue-btn {
		width: 100%;
		padding: var(--space-2);
		border: none;
		background: none;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.continue-btn:hover {
		color: var(--color-text);
	}
</style>

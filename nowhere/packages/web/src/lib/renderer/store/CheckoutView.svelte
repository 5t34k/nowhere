<script lang="ts">
	import type { StoreData, Tag } from '@nowhere/codec';
	import { cart, cartSubtotal, computeShipping, computeDiscount, getShippingCurrency } from '$lib/renderer/stores/cart.js';
	import { getAvailablePaymentMethods } from '$lib/payment-methods.js';
	import { convertFiat } from '$lib/renderer/payment/exchange-rate.js';
	import CheckoutForm, { type AvailableMethod } from './CheckoutForm.svelte';
	import OrderSummary from './OrderSummary.svelte';

	interface Props {
		store: StoreData;
		currency: string;
		onBack: () => void;
		onSubmit: (formData: Record<string, string>) => void;
		lowSettings?: { warn?: boolean; fields?: string; refund?: boolean } | null;
		stockLevels?: Record<string, number>;
	}

	let { store, currency, onBack, onSubmit, lowSettings = null, stockLevels = {} }: Props = $props();

	let buyerCountry = $state('');
	let noticeStep = $state(1);
	const discount = $derived(computeDiscount($cart, store.tags));
	const shipping = $derived(computeShipping($cart, store.tags, buyerCountry || undefined));
	const total = $derived($cartSubtotal - discount.amount + shipping);
	const shippingCurrency = $derived(getShippingCurrency(store.tags) || currency);

	const rawMethods = $derived(getAvailablePaymentMethods(store.tags));

	let availableMethods = $state<AvailableMethod[]>([]);
	let selectedMethodId = $state('');

	// Compute available methods with limit checks
	$effect(() => {
		const methods = rawMethods;
		const orderTotal = total;
		const storeCurrency = currency;

		checkMethodLimits(methods, orderTotal, storeCurrency);
	});

	async function checkMethodLimits(
		methods: ReturnType<typeof getAvailablePaymentMethods>,
		orderTotal: number,
		storeCurrency: string
	) {
		// Show methods immediately before async limit checks
		const initial: AvailableMethod[] = methods.map((am) => ({
			method: am.method,
			address: am.address,
			useNostr: am.useNostr
		}));
		availableMethods = initial;

		if (!selectedMethodId || !initial.find((m) => m.method.id === selectedMethodId)) {
			const bitcoin = initial.find((m) => m.method.id === 'bitcoin');
			const first = initial[0];
			selectedMethodId = bitcoin?.method.id ?? first?.method.id ?? '';
		}

		// Now do async limit checks and update with annotations
		const results: AvailableMethod[] = [];

		for (const am of methods) {
			const entry: AvailableMethod = {
				method: am.method,
				address: am.address,
				useNostr: am.useNostr
			};

			if (orderTotal > 0) {
				try {
					// Check max transaction limit
					if (am.method.maxTransaction > 0) {
						const { convertedAmount } = await convertFiat(
							orderTotal,
							storeCurrency,
							am.method.maxTransactionCurrency
						);
						if (convertedAmount > am.method.maxTransaction) {
							entry.disabled = true;
							entry.disabledReason = `Exceeds ${am.method.maxTransaction} ${am.method.maxTransactionCurrency} limit`;
						}
					}

					// Check min transaction - warn but don't disable
					if (am.method.minTransaction > 0 && !entry.disabled) {
						const { convertedAmount } = await convertFiat(
							orderTotal,
							storeCurrency,
							am.method.minTransactionCurrency
						);
						if (convertedAmount < am.method.minTransaction) {
							entry.belowMinimumWarning = `Minimum ${am.method.minTransaction} ${am.method.minTransactionCurrency} - you will be charged the minimum`;
						}
					}
				} catch {
					// If conversion fails, don't disable or warn
				}
			}

			results.push(entry);
		}

		availableMethods = results;

		// Re-check selection in case a method got disabled
		if (!selectedMethodId || !results.find((m) => m.method.id === selectedMethodId && !m.disabled)) {
			const bitcoin = results.find((m) => m.method.id === 'bitcoin' && !m.disabled);
			const first = results.find((m) => !m.disabled);
			selectedMethodId = bitcoin?.method.id ?? first?.method.id ?? '';
		}
	}
</script>

<div class="checkout-view">
	<button class="back-btn" onclick={onBack}>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
		</svg>
		Back to store
	</button>

	<div class="checkout-layout">
		<div class="checkout-form-col">
			<CheckoutForm
				storeTags={store.tags}
				cartItems={$cart}
				{availableMethods}
				{selectedMethodId}
				{lowSettings}
				{stockLevels}
				onSelectMethod={(id) => (selectedMethodId = id)}
				{onSubmit}
				onCountryChange={(country) => (buyerCountry = country)}
			/>
		</div>

		<div class="checkout-summary-col">
			<div class="summary-sticky">
				<OrderSummary items={$cart} {currency} {shippingCurrency} subtotal={$cartSubtotal} {discount} {shipping} {total} />
			</div>
		</div>
	</div>
</div>

{#if noticeStep === 1}
	<div class="buyer-notice-overlay" role="dialog" aria-modal="true" aria-label="Before you pay">
		<div class="buyer-notice-dialog">
			<div class="buyer-notice-header">
				<div class="buyer-notice-eyebrow">Nowhere · Early release</div>
				<h2 class="buyer-notice-title">Before you pay</h2>
			</div>
			<div class="buyer-notice-body">
				<p class="buyer-notice-lede">
					Nowhere is new and has not yet been tested with live orders. Your order is sent through public relays, and there is a chance it may not reach the seller even after you pay.
				</p>
				<p>
					If something goes wrong your only route is to contact the seller themselves. Save their contact details before you pay so you can follow up directly, and only spend what you would be comfortable losing if the order never arrives.
				</p>
				<p>
					Once you have paid, download and save your receipt. You will need it if you have to contact the seller and will be able to use it as proof of your order.
				</p>
			</div>
			<div class="buyer-notice-actions">
				<button class="buyer-notice-btn" onclick={() => (noticeStep = 2)}>I understand, continue</button>
			</div>
		</div>
	</div>
{:else if noticeStep === 2}
	<div class="buyer-notice-overlay" role="dialog" aria-modal="true" aria-label="Are you sure">
		<div class="buyer-notice-dialog">
			<div class="buyer-notice-header">
				<div class="buyer-notice-eyebrow buyer-notice-eyebrow-danger">Nowhere · Beta</div>
				<h2 class="buyer-notice-title">Are you sure</h2>
			</div>
			<div class="buyer-notice-body">
				<p class="buyer-notice-lede">
					Nowhere store is in beta. Use only with small amounts and for testing.
				</p>
				<p>
					<strong>Only spend what you can afford to lose.</strong> Treat every order as if the money may not come back.
				</p>
				<p>
					<strong>Only shop from sellers you trust.</strong> There is no platform standing behind the seller and no dispute system to fall back on.
				</p>
				<p>
					<strong>Download your receipt after paying.</strong> It is the only proof you will have if you need to follow up with the seller.
				</p>
			</div>
			<div class="buyer-notice-actions">
				<button class="buyer-notice-btn buyer-notice-btn-danger" onclick={() => (noticeStep = 0)}>I understand, continue</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.checkout-view {
		max-width: 1000px;
		margin: 0 auto;
		padding: var(--space-4);
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		padding: var(--space-2) 0;
		margin-bottom: var(--space-4);
	}

	.back-btn:hover {
		color: var(--color-text);
	}

	.buyer-notice-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 15, 0.72);
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		overflow-y: auto;
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}

	.buyer-notice-dialog {
		background: #ffffff;
		border-radius: 12px;
		max-width: 620px;
		width: 100%;
		max-height: calc(100vh - 3rem);
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.04);
		overflow: hidden;
	}

	.buyer-notice-header {
		padding: 2rem 2rem 1.25rem;
		border-bottom: 1px solid #ececec;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0) 100%);
		position: relative;
	}

	.buyer-notice-header::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: #000000;
	}

	.buyer-notice-eyebrow {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #000000;
		margin-bottom: 0.5rem;
	}

	.buyer-notice-title {
		font-size: 1.625rem;
		font-weight: 700;
		line-height: 1.2;
		color: #1a1a1a;
		letter-spacing: -0.01em;
	}

	.buyer-notice-body {
		padding: 1.5rem 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.buyer-notice-body p {
		font-size: 0.9375rem;
		line-height: 1.6;
		color: #2a2a2a;
		margin-bottom: 1rem;
	}

	.buyer-notice-body p.buyer-notice-lede {
		font-size: 1rem;
		color: #1a1a1a;
		font-weight: 500;
	}

	.buyer-notice-body p:last-child {
		margin-bottom: 0;
	}

	.buyer-notice-actions {
		padding: 1.25rem 2rem 1.5rem;
		border-top: 1px solid #ececec;
		background: #fafafa;
		display: flex;
		justify-content: flex-end;
	}

	.buyer-notice-btn {
		background: #000000;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		padding: 0.75rem 1.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.buyer-notice-btn:hover {
		background: #2a2a2a;
	}

	.buyer-notice-btn:focus-visible {
		outline: 2px solid #000000;
		outline-offset: 2px;
	}

	.buyer-notice-btn-danger {
		background: #c8102e;
	}

	.buyer-notice-btn-danger:hover {
		background: #a60e27;
	}

	.buyer-notice-btn-danger:focus-visible {
		outline-color: #c8102e;
	}

	.buyer-notice-eyebrow-danger {
		color: #c8102e;
	}

	@media (max-width: 560px) {
		.buyer-notice-overlay {
			padding: 0;
			align-items: stretch;
		}
		.buyer-notice-dialog {
			max-height: 100vh;
			border-radius: 0;
		}
		.buyer-notice-header {
			padding: 1.5rem 1.25rem 1rem;
		}
		.buyer-notice-title {
			font-size: 1.375rem;
		}
		.buyer-notice-body {
			padding: 1.25rem 1.25rem;
		}
		.buyer-notice-actions {
			padding: 1rem 1.25rem 1.25rem;
		}
		.buyer-notice-btn {
			width: 100%;
		}
	}

	.checkout-layout {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.checkout-form-col {
		flex: 1;
	}

	.checkout-summary-col {
		order: -1;
	}

	@media (min-width: 768px) {
		.checkout-layout {
			flex-direction: row;
		}

		.checkout-form-col {
			flex: 3;
		}

		.checkout-summary-col {
			flex: 2;
			order: 1;
		}

		.summary-sticky {
			position: sticky;
			top: 80px;
		}
	}
</style>

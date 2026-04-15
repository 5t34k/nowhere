<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import { PAYMENT_METHODS, type PaymentMethodConfig } from '$lib/payment-methods.js';
	import type { PaymentMethodState } from '$lib/stores/builder-state.js';
	import { serializeCustomPayments, type CustomPaymentMethod } from '$lib/custom-payments.js';
	import HintIcon from './HintIcon.svelte';

	const CUSTOM_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'BRL', 'MXN'];

	interface Props {
		pubkey: string;
		paymentMethods: Record<string, PaymentMethodState>;
		customPaymentMethods: CustomPaymentMethod[];
		tags: Tag[];
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, paymentMethods, customPaymentMethods, tags, onUpdate }: Props = $props();

	let errors = $state<Record<string, string>>({});

	function toggleMethod(method: PaymentMethodConfig) {
		const current = paymentMethods[method.id];
		const updated = {
			...paymentMethods,
			[method.id]: { ...current, enabled: !current.enabled }
		};
		onUpdate('paymentMethods', updated);
		if (current.enabled) {
			errors = { ...errors, [method.id]: '' };
		}
		syncTags(updated, customPaymentMethods);
	}

	function handleAddressInput(method: PaymentMethodConfig, value: string) {
		const updated = {
			...paymentMethods,
			[method.id]: { ...paymentMethods[method.id], address: value }
		};
		onUpdate('paymentMethods', updated);

		const err = value ? method.validateAddress(value) : '';
		errors = { ...errors, [method.id]: err ?? '' };

		syncTags(updated, customPaymentMethods);
	}

	function syncTags(methods: Record<string, PaymentMethodState>, customs: CustomPaymentMethod[]) {
		const paymentTagKeys = [...PAYMENT_METHODS.map((m) => m.tagKey), '5'];
		let newTags = tags.filter((t) => !paymentTagKeys.includes(t.key));

		for (const method of PAYMENT_METHODS) {
			const state = methods[method.id];
			if (!state?.enabled) continue;

			if (state.address && !method.validateAddress(state.address)) {
				newTags.push({ key: method.tagKey, value: state.address } as Tag);
			}
		}

		const serialized = serializeCustomPayments(customs);
		if (serialized) {
			newTags.push({ key: '5', value: serialized } as Tag);
		}

		onUpdate('tags', newTags);
	}

	// Custom payment method management
	function addCustomMethod() {
		const updated = [...customPaymentMethods, { label: '', currency: 'USD', address: '', showQr: false }];
		onUpdate('customPaymentMethods', updated);
		syncTags(paymentMethods, updated);
	}

	function updateCustomAt(index: number, changes: Partial<CustomPaymentMethod>) {
		const updated = customPaymentMethods.map((m, i) =>
			i === index ? { ...m, ...changes } : m
		);
		onUpdate('customPaymentMethods', updated);
		syncTags(paymentMethods, updated);
	}

	function removeCustomAt(index: number) {
		const updated = customPaymentMethods.filter((_, i) => i !== index);
		onUpdate('customPaymentMethods', updated);
		syncTags(paymentMethods, updated);
	}
</script>

<div class="panel">
	<h3>Payment Methods</h3>

	{#each PAYMENT_METHODS as method}
		{@const state = paymentMethods[method.id]}
		{@const isEnabled = state?.enabled ?? false}
		{@const error = errors[method.id] ?? ''}

		<div class="method-section">
			<button type="button" class="method-header" onclick={() => toggleMethod(method)}>
				<span
					class="toggle-track"
					class:active={isEnabled}
					style:--toggle-color={method.color}
				>
					<span class="toggle-thumb"></span>
				</span>
				<span class="method-name">{method.name}</span>
			</button>

			{#if isEnabled}
				<div class="method-body">
					{#if method.id === 'bitcoin'}
						<div class="ln-warning">
							<strong>Important:</strong> Not all Lightning wallets display the message attached to payments. If your wallet doesn't show messages, you won't see order details and orders will be lost. It is your responsibility to use a wallet that supports this. Do a test order on your own store before sharing the link.
						</div>
					{/if}

					<div class="field">
						<label for="{method.id}-address">{method.addressLabel}</label>
						<input
							id="{method.id}-address"
							type="text"
							value={state?.address ?? ''}
							onchange={(e) => handleAddressInput(method, e.currentTarget.value)}
							placeholder={method.addressPlaceholder}
							class:error={error !== ''}
						/>
						{#if error}
							<span class="field-error">{error}</span>
						{:else if state?.address}
							<span class="hint">This address will be encoded into your store URL.</span>
						{:else}
							<span class="hint">Enter {method.addressLabel.toLowerCase()} to receive payments.</span>
						{/if}
					</div>

					<div class="method-info">
						<span class="info-text">{method.description}</span>
						{#if method.currencies.length > 0}
							<span class="info-text">Currencies: {method.currencies.join(', ')}</span>
						{/if}
						{#if method.minTransaction > 0}
							<span class="info-text">Min: {method.minTransaction} {method.minTransactionCurrency} per transaction</span>
						{/if}
						{#if method.maxTransaction > 0}
							<span class="info-text">Max: {method.maxTransaction} {method.maxTransactionCurrency} per transaction</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/each}

	<div class="custom-section">
		<h3>Other Payment Methods</h3>

		{#if customPaymentMethods.length > 0}
			<div class="custom-warning">
				<strong>Important:</strong> The payment service you use must support adding a note or comment to the transaction. When a buyer places an order, they are given an Order ID that must be included in the payment description. Without this, you will have no way to match payments to orders and orders will be lost. Do a test order on your own store before sharing the link.
			</div>
		{/if}

		{#each customPaymentMethods as method, i}
			<div class="custom-row">
				<select
					class="custom-currency"
					value={method.currency}
					onchange={(e) => updateCustomAt(i, { currency: e.currentTarget.value })}
				>
					{#each CUSTOM_CURRENCIES as cur}
						<option value={cur}>{cur}</option>
					{/each}
				</select>
				<input
					type="text"
					value={method.label}
					onchange={(e) => updateCustomAt(i, { label: e.currentTarget.value })}
					placeholder="Service name"
					class="custom-name"
				/>
				<input
					type="text"
					value={method.address}
					onchange={(e) => updateCustomAt(i, { address: e.currentTarget.value })}
					placeholder="Address, username or ID"
					class="custom-handle"
				/>
				<label class="custom-qr-toggle" title="Show QR code for this address at checkout">
					<input type="checkbox" checked={method.showQr ?? false} onchange={() => updateCustomAt(i, { showQr: !method.showQr })} />
					QR
				</label>
				<button class="custom-remove" onclick={() => removeCustomAt(i)} aria-label="Remove payment method">&times;</button>
			</div>
		{/each}

		<button class="add-method" onclick={addCustomMethod}>+ Add payment method</button>
		<span class="custom-hint">
			e.g. PayPal, Wise, Zelle, bank transfer — enter the service name, your handle, and the currency you accept.
		</span>
	</div>
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

	.method-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.method-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
	}

	.method-name {
		font-size: var(--text-base);
		font-weight: 600;
	}

	.method-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-left: var(--space-1);
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
	}

	.toggle-track {
		position: relative;
		display: inline-block;
		width: 36px;
		height: 20px;
		background: var(--color-border);
		border-radius: 10px;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.toggle-track.active {
		background: var(--toggle-color, var(--color-primary));
	}

	.toggle-track.sub-toggle.active {
		background: #9544dc;
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		background: white;
		border-radius: 50%;
		transition: transform var(--transition-fast);
	}

	.toggle-track.active .toggle-thumb {
		transform: translateX(16px);
	}

	.toggle-label {
		font-size: var(--text-sm);
		color: var(--color-text);
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

	input[type='text'] {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	input:disabled {
		background: var(--color-bg-secondary);
		color: var(--color-text-muted);
		cursor: not-allowed;
	}

	input.error {
		border-color: var(--color-error);
	}

	.hint {
		font-size: 11px;
		color: var(--color-text-muted);
	}

	.field-error {
		font-size: 11px;
		color: var(--color-error);
	}

	.ln-warning {
		font-size: 12px;
		line-height: 1.45;
		color: var(--color-warning, #92400e);
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
	}

	.ln-warning strong {
		font-weight: 600;
	}

	.method-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.info-text {
		font-size: 11px;
		color: var(--color-text-muted);
	}

	.custom-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.custom-section h3 {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.custom-warning {
		font-size: 12px;
		line-height: 1.45;
		color: var(--color-warning, #92400e);
		background: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
	}

	.custom-warning strong {
		font-weight: 600;
	}

	.custom-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
	}

	.custom-currency {
		width: 72px;
		flex-shrink: 0;
		padding: var(--space-1) var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		background: var(--color-bg);
	}

	.custom-currency:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.custom-name {
		width: 110px;
		flex-shrink: 0;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.custom-name:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.custom-handle {
		flex: 1;
		min-width: 120px;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.custom-handle:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.custom-qr-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		cursor: pointer;
	}

	.custom-remove {
		border: none;
		background: none;
		padding: 0;
		font-size: 13px;
		color: var(--color-text-muted);
		cursor: pointer;
		line-height: 1;
	}

	.custom-remove:hover {
		color: var(--color-error);
	}

	.add-method {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		text-align: left;
	}

	.add-method:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.custom-hint {
		font-size: 10px;
		color: var(--color-text-muted);
	}
</style>

<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import { resolveTags } from '@nowhere/codec';
	import type { CartItem } from '$lib/renderer/stores/cart.js';
	import type { PaymentMethodConfig } from '$lib/payment-methods.js';
	import FormField from './FormField.svelte';

	export interface AvailableMethod {
		method: PaymentMethodConfig;
		address: string;
		useNostr?: boolean;
		disabled?: boolean;
		disabledReason?: string;
		belowMinimumWarning?: string;
	}

	interface Props {
		storeTags: Tag[];
		cartItems: CartItem[];
		availableMethods: AvailableMethod[];
		selectedMethodId: string;
		onSelectMethod: (id: string) => void;
		onSubmit: (formData: Record<string, string>) => void;
		onCountryChange?: (country: string) => void;
		lowSettings?: { warn?: boolean; fields?: string; refund?: boolean } | null;
		stockLevels?: Record<string, number>;
	}

	let { storeTags, cartItems, availableMethods, selectedMethodId, onSelectMethod, onSubmit, onCountryChange, lowSettings = null, stockLevels = {} }: Props = $props();

	// Resolve all tags from store + cart items to determine required fields
	const resolvedTags = $derived.by(() => {
		let tags = [...storeTags];
		for (const ci of cartItems) {
			tags = resolveTags(tags, ci.item.tags);
		}
		return tags;
	});

	const needsName = $derived(resolvedTags.some((t) => t.key === 'N' || t.key === 'n'));
	const nameRequired = $derived(resolvedTags.some((t) => t.key === 'N'));
	const needsEmail = $derived(resolvedTags.some((t) => t.key === 'E' || t.key === 'e'));
	const emailRequired = $derived(resolvedTags.some((t) => t.key === 'E'));
	const needsAddress = $derived(resolvedTags.some((t) => t.key === 'A' || t.key === 'a'));
	const addressRequired = $derived(resolvedTags.some((t) => t.key === 'A'));
	const needsPhone = $derived(resolvedTags.some((t) => t.key === 'P' || t.key === 'p'));
	const phoneRequired = $derived(resolvedTags.some((t) => t.key === 'P'));
	const needsNostr = $derived(resolvedTags.some((t) => t.key === 'Z' || t.key === 'z'));
	const nostrRequired = $derived(resolvedTags.some((t) => t.key === 'Z'));

	// Low-stock overrides: fields become required (and visible) when cart has a low-stock item
	const hasLowStockItem = $derived(
		cartItems.some((ci) => (stockLevels[String(ci.itemIndex)] ?? 3) === 2)
	);
	const lowStockActive = $derived(hasLowStockItem && lowSettings != null);
	const lowFields = $derived(
		lowSettings?.fields?.split(',').map((s) => s.trim()) ?? []
	);

	const effectiveNeedsName     = $derived(needsName    || (lowStockActive && lowFields.includes('name')));
	const effectiveNameRequired  = $derived(nameRequired || (lowStockActive && lowFields.includes('name')));
	const effectiveNeedsEmail    = $derived(needsEmail    || (lowStockActive && lowFields.includes('email')));
	const effectiveEmailRequired = $derived(emailRequired || (lowStockActive && lowFields.includes('email')));
	const effectiveNeedsPhone    = $derived(needsPhone    || (lowStockActive && lowFields.includes('phone')));
	const effectivePhoneRequired = $derived(phoneRequired || (lowStockActive && lowFields.includes('phone')));
	const effectiveNeedsAddress    = $derived(needsAddress    || (lowStockActive && lowFields.includes('address')));
	const effectiveAddressRequired = $derived(addressRequired || (lowStockActive && lowFields.includes('address')));
	const effectiveNeedsNostr    = $derived(needsNostr    || (lowStockActive && lowFields.includes('nostr')));
	const effectiveNostrRequired = $derived(nostrRequired || (lowStockActive && lowFields.includes('nostr')));
	const notesRequired = $derived(lowStockActive && lowFields.includes('notes'));

	const needsRefund = $derived(lowStockActive && (lowSettings?.refund ?? false));
	const refundLabel = $derived(
		'Refund address' +
		(availableMethods.find((m) => m.method.id === selectedMethodId)?.method.name
			? ` — ${availableMethods.find((m) => m.method.id === selectedMethodId)!.method.name}`
			: '')
	);

	const customTextFields = $derived.by(() => {
		const fields: { label: string; from: string }[] = [];
		for (const ci of cartItems) {
			const tTag = ci.item.tags.find((t: Tag) => t.key === 't');
			if (tTag) {
				fields.push({ label: tTag.value || 'Custom text', from: ci.item.name });
			}
		}
		return fields;
	});

	// Allowed/excluded countries
	const allowedCountries = $derived.by(() => {
		const cTag = resolvedTags.find((t) => t.key === 'c');
		return cTag?.value?.split('.') ?? null;
	});
	const excludedCountries = $derived.by(() => {
		const xTag = resolvedTags.find((t) => t.key === 'x');
		return xTag?.value?.split('.') ?? null;
	});

	let formValues = $state<Record<string, string>>({
		name: '',
		email: '',
		phone: '',
		nostr: '',
		street: '',
		city: '',
		state: '',
		postal: '',
		country: '',
		notes: '',
		refundAddress: ''
	});

	const selectedMethodWarning = $derived(
		availableMethods.find((m) => m.method.id === selectedMethodId)?.belowMinimumWarning ?? ''
	);

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		onSubmit({ ...formValues, _paymentMethod: selectedMethodId });
	}

	function updateField(field: string) {
		return (value: string) => {
			formValues = { ...formValues, [field]: value };
			if (field === 'country') onCountryChange?.(value);
		};
	}
</script>

<form class="checkout-form" onsubmit={handleSubmit}>
	{#if availableMethods.length > 1}
		<div class="method-selector">
			<h2 class="form-title">Payment Method</h2>
			<div class="method-cards">
				{#each availableMethods as am}
					{@const isSelected = am.method.id === selectedMethodId}
					<button
						type="button"
						class="method-card"
						class:selected={isSelected}
						class:disabled={am.disabled}
						style:--method-color={am.method.color}
						onclick={() => !am.disabled && onSelectMethod(am.method.id)}
						disabled={am.disabled}
					>
						<span class="method-dot" style:background={am.disabled ? 'var(--color-text-muted)' : am.method.color}></span>
						<span class="method-card-name">{am.method.name}</span>
						{#if am.disabled && am.disabledReason}
							<span class="method-disabled-reason">{am.disabledReason}</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if selectedMethodWarning}
		<p class="min-warning">{selectedMethodWarning}</p>
	{/if}

	<h2 class="form-title">Contact Information</h2>

	{#if effectiveNeedsName}
		<FormField label="Name" name="name" required={effectiveNameRequired} value={formValues.name}
			onchange={updateField('name')} />
	{/if}

	{#if effectiveNeedsEmail}
		<FormField label="Email" name="email" type="email" required={effectiveEmailRequired} value={formValues.email}
			onchange={updateField('email')} />
	{/if}

	{#if effectiveNeedsPhone}
		<FormField label="Phone" name="phone" type="tel" required={effectivePhoneRequired} value={formValues.phone}
			onchange={updateField('phone')} />
	{/if}

	{#if effectiveNeedsNostr}
		<FormField label="Nostr npub" name="nostr" required={effectiveNostrRequired} value={formValues.nostr}
			placeholder="npub1..." onchange={updateField('nostr')} />
	{/if}

	{#if needsRefund}
		<FormField label={refundLabel} name="refundAddress" required={true} value={formValues.refundAddress}
			placeholder="Enter an address to receive a refund if we cannot fulfil your order"
			onchange={updateField('refundAddress')} />
	{/if}

	{#if effectiveNeedsAddress}
		<div class="address-section">
			<h3>Shipping Address</h3>
			<FormField label="Street" name="street" required={effectiveAddressRequired} value={formValues.street}
				onchange={updateField('street')} />
			<FormField label="City" name="city" required={effectiveAddressRequired} value={formValues.city}
				onchange={updateField('city')} />
			<div class="row-2">
				<FormField label="State / Province" name="state" value={formValues.state}
					onchange={updateField('state')} />
				<FormField label="Postal Code" name="postal" value={formValues.postal}
					onchange={updateField('postal')} />
			</div>
			{#if allowedCountries}
				<FormField label="Country" name="country" required={effectiveAddressRequired}
					value={formValues.country} options={allowedCountries}
					onchange={updateField('country')} />
			{:else}
				<FormField label="Country" name="country" required={effectiveAddressRequired}
					value={formValues.country} onchange={updateField('country')} />
			{/if}
		</div>
	{/if}

	{#each customTextFields as field, i}
		<FormField label="{field.label} ({field.from})" name="custom_{i}" value={formValues[`custom_${i}`] ?? ''}
			onchange={updateField(`custom_${i}`)} />
	{/each}

	<FormField label="Order Notes" name="notes" type="textarea" required={notesRequired} value={formValues.notes}
		placeholder="Optional notes for the seller" onchange={updateField('notes')} />

	<button class="submit-btn" type="submit">Place Order</button>

	<p class="disclaimer">This is a peer-to-peer transaction. Payments are final.</p>
</form>

<style>
	.checkout-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.form-title {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.address-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.address-section h3 {
		font-size: var(--text-base);
		font-weight: 600;
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.row-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.submit-btn {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: var(--text-base);
		font-weight: 600;
		margin-top: var(--space-2);
		transition: background var(--transition-fast);
	}

	.submit-btn:hover {
		background: var(--color-primary-hover);
	}

	.disclaimer {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-align: center;
	}

	.method-selector {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--color-border);
	}

	.method-cards {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.method-card {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		cursor: pointer;
		transition: all var(--transition-fast);
		flex: 1;
		min-width: 120px;
		position: relative;
	}

	.method-card:hover:not(:disabled) {
		border-color: var(--method-color, var(--color-primary));
	}

	.method-card.selected {
		border-color: var(--method-color, var(--color-primary));
		background: color-mix(in srgb, var(--method-color, var(--color-primary)) 5%, var(--color-bg));
	}

	.method-card.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.method-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.method-card-name {
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.method-disabled-reason {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		position: absolute;
		bottom: -2px;
		left: var(--space-4);
		right: var(--space-4);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.min-warning {
		font-size: var(--text-sm);
		color: var(--color-warning);
		padding: var(--space-2) var(--space-3);
		background: rgba(245, 158, 11, 0.1);
		border-radius: var(--radius-sm);
	}
</style>

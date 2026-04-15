<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import NpubInput from './NpubInput.svelte';
	import HintIcon from './HintIcon.svelte';
	import SvgImageInput from './SvgImageInput.svelte';
	import RelayAdvancedSection from './RelayAdvancedSection.svelte';

	interface Props {
		pubkey: string;
		name: string;
		description: string;
		image: string;
		tags: Tag[];
		onUpdate: (field: string, value: unknown) => void;
		onGenerateKeypair?: () => void;
	}

	let { pubkey, name, description, image, tags, onUpdate, onGenerateKeypair }: Props = $props();

	const currency = $derived(tags.find((t) => t.key === '$')?.value ?? 'USD');
	const weightUnit = $derived(tags.find((t) => t.key === 'w')?.value ?? 'g');
	const storeDescription = $derived(tags.find((t) => t.key === 'b')?.value ?? '');
	const showBreakTip = $derived(storeDescription.length > 120 && !storeDescription.includes('\n\n'));
	function setTagValue(key: string, value: string, defaultValue?: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value && value !== defaultValue) newTags.push({ key, value });
		onUpdate('tags', newTags);
	}

	function setCurrency(value: string) {
		setTagValue('$', value, 'USD');
	}

	function setWeightUnit(value: string) {
		setTagValue('w', value, 'g');
	}

	function setDescription(value: string) {
		setTagValue('b', value);
	}


</script>

<div class="panel">
	<h3>Store Settings</h3>

	<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} onGenerate={onGenerateKeypair} />

	<div class="field">
		<label for="store-name">Store Name <span class="required">*</span> <HintIcon tip="Displayed as the main heading on your store page." /></label>
		<input id="store-name" type="text" value={name} onchange={(e) => onUpdate('name', e.currentTarget.value)} required />
	</div>

	<div class="field">
		<label for="store-subtitle">Subtitle <HintIcon tip="A short tagline shown below your store name." /></label>
		<input id="store-subtitle" type="text" value={description} onchange={(e) => onUpdate('description', e.currentTarget.value)} placeholder="Short tagline shown on the store banner" />
	</div>

	<div class="field">
		<label for="store-desc">Description <HintIcon tip="Shown in the seller info section. Text before a blank line is always visible; text after is behind 'Read more'." /></label>
		<textarea id="store-desc" rows="3" value={storeDescription} onchange={(e) => setDescription(e.currentTarget.value)} placeholder="Fresh produce from local farms.&#10;&#10;We source directly from growers within 50 miles..." class:warn={showBreakTip}></textarea>
		{#if showBreakTip}
			<span class="field-tip">Tip: Add a blank line to split into an intro and a "Read more" section.</span>
		{/if}
	</div>

	<div class="field">
		<label for="store-img">Store Image <HintIcon tip="Displayed in the store header. Use an emoji, image URL, or paste/upload an SVG." /></label>
		<SvgImageInput value={image} onUpdate={(v) => onUpdate('image', v)} allowEmoji={true} placeholder="e.g. 🏪, https://…, or paste SVG" />
	</div>

	<div class="field">
		<label for="store-currency">Currency <HintIcon tip="Sets the currency for product prices, shipping, and order totals." /></label>
		<select id="store-currency" value={currency} onchange={(e) => setCurrency(e.currentTarget.value)}>
			<option value="USD">USD ($)</option>
			<option value="EUR">EUR (€)</option>
			<option value="GBP">GBP (£)</option>
			<option value="JPY">JPY (¥)</option>
			<option value="CAD">CAD ($)</option>
			<option value="AUD">AUD ($)</option>
			<option value="CHF">CHF</option>
			<option value="CNY">CNY (¥)</option>
			<option value="BRL">BRL (R$)</option>
			<option value="MXN">MXN ($)</option>
			<option value="sats">BTC (sats)</option>
		</select>
	</div>

	<div class="field">
		<label for="store-weight-unit">Weight Unit <HintIcon tip="Unit used for item weights and shipping surcharge calculations." /></label>
		<select id="store-weight-unit" value={weightUnit} onchange={(e) => setWeightUnit(e.currentTarget.value)}>
			<option value="g">Grams (g)</option>
			<option value="kg">Kilograms (kg)</option>
			<option value="lb">Pounds (lb)</option>
			<option value="oz">Ounces (oz)</option>
		</select>
	</div>

	<RelayAdvancedSection
		{tags}
		onUpdate={(newTags) => onUpdate('tags', newTags)}
		primaryLabel="Inventory relays"
		secondaryLabel="Order relays"
		showSecondary={true}
	/>
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
	textarea,
	select {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	input:focus,
	textarea:focus,
	select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	textarea {
		resize: vertical;
	}

	textarea.warn {
		border-color: var(--color-warning, #f59e0b);
	}

	.field-tip {
		font-size: var(--text-xs);
		color: var(--color-warning, #f59e0b);
	}


</style>

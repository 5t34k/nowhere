<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from './HintIcon.svelte';

	interface Props {
		tags: Tag[];
		weightUnit: string;
		storeCurrency: string;
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, weightUnit, storeCurrency, onUpdate }: Props = $props();

	// Helper to get tag value
	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function hasTag(key: string): boolean {
		return tags.some((t) => t.key === key);
	}

	// Toggle a boolean tag
	function toggleTag(key: string) {
		const has = tags.some((t) => t.key === key);
		const newTags = has ? tags.filter((t) => t.key !== key) : [...tags, { key }];
		onUpdate(newTags);
	}

	// Set a tag with a value (remove if empty)
	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate(newTags);
	}

	// Remove a tag entirely
	function removeTag(key: string) {
		onUpdate(tags.filter((t) => t.key !== key));
	}

	// Cents <-> display dollars conversion
	function centsToDisplay(centsStr: string): string {
		if (!centsStr) return '';
		const cents = parseInt(centsStr, 10);
		if (isNaN(cents)) return centsStr;
		return (cents / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
	}

	function displayToCents(displayVal: string): string {
		if (!displayVal) return '';
		const num = parseFloat(displayVal);
		if (isNaN(num)) return '';
		return String(Math.round(num * 100));
	}

	// Checkout field helpers - uppercase = required, lowercase = optional
	function getCheckoutFieldState(lower: string, upper: string): 'off' | 'optional' | 'required' {
		if (tags.some((t) => t.key === upper)) return 'required';
		if (tags.some((t) => t.key === lower)) return 'optional';
		return 'off';
	}

	function setCheckoutField(lower: string, upper: string, state: string) {
		const newTags = tags.filter((t) => t.key !== lower && t.key !== upper);
		if (state === 'required') newTags.push({ key: upper });
		else if (state === 'optional') newTags.push({ key: lower });
		onUpdate(newTags);
	}

	// Free shipping mode: 'none' | 'always' | 'threshold'
	const freeShippingTag = $derived(tags.find((t) => t.key === 'F'));
	const freeShippingMode = $derived.by(() => {
		if (!freeShippingTag) return 'none';
		if (freeShippingTag.value) return 'threshold';
		return 'always';
	});
	const freeShippingThresholdDisplay = $derived(centsToDisplay(freeShippingTag?.value ?? ''));
	const freeShippingInternational = $derived(hasTag('J'));

	function setFreeShippingMode(mode: string) {
		let newTags = tags.filter((t) => t.key !== 'F' && t.key !== 'J');
		if (mode === 'always') {
			newTags.push({ key: 'F' });
		} else if (mode === 'threshold') {
			newTags.push({ key: 'F', value: '0' });
		}
		onUpdate(newTags);
	}

	function setFreeShippingThreshold(displayVal: string) {
		const newTags = tags.filter((t) => t.key !== 'F');
		const cents = displayToCents(displayVal);
		newTags.push({ key: 'F', value: cents || '0' });
		onUpdate(newTags);
	}

	// Shipping currency - temporarily locked to store currency; selector hidden.
	// Clear any pre-existing `K` tag so downstream code falls back to storeCurrency.
	const shippingCurrencyLabel = $derived(storeCurrency);
	$effect(() => {
		if (hasTag('K')) removeTag('K');
	});

	// Derived tag states - display as dollars
	const storeCountry = $derived(getTagValue('L'));
	const domesticBaseDisplay = $derived(centsToDisplay(getTagValue('s')));
	const intlBaseDisplay = $derived(centsToDisplay(getTagValue('S')));
	const domesticWeight = $derived(centsToDisplay(getTagValue('h')));
	const intlWeight = $derived(centsToDisplay(getTagValue('H')));
	const minOrderDisplay = $derived(centsToDisplay(getTagValue('m')));
	const buyDiscount = $derived(getTagValue('B'));
	const maxDiscountDisplay = $derived(centsToDisplay(getTagValue('X')));
	const deliveryTime = $derived(getTagValue('D'));

	// Country restrictions - stored with dots, displayed with commas
	const allowedCountriesRaw = $derived(getTagValue('c'));
	const excludedCountriesRaw = $derived(getTagValue('x'));
	const allowedCountriesDisplay = $derived(allowedCountriesRaw.replace(/\./g, ', '));
	const excludedCountriesDisplay = $derived(excludedCountriesRaw.replace(/\./g, ', '));
	const hasAllowedCountries = $derived(allowedCountriesRaw.length > 0);

	function handleCountryInput(key: string, value: string) {
		setTagValue(key, value.replace(/,\s*/g, '.'));
	}

	// Country dropdown support
	const COUNTRIES = [
		{ code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' },
		{ code: 'GB', name: 'United Kingdom' }, { code: 'AU', name: 'Australia' },
		{ code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' },
		{ code: 'JP', name: 'Japan' }, { code: 'CN', name: 'China' },
		{ code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' },
		{ code: 'IN', name: 'India' }, { code: 'KR', name: 'South Korea' },
		{ code: 'IT', name: 'Italy' }, { code: 'ES', name: 'Spain' },
		{ code: 'NL', name: 'Netherlands' }, { code: 'CH', name: 'Switzerland' },
		{ code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' },
		{ code: 'DK', name: 'Denmark' }, { code: 'FI', name: 'Finland' },
		{ code: 'AT', name: 'Austria' }, { code: 'BE', name: 'Belgium' },
		{ code: 'PT', name: 'Portugal' }, { code: 'IE', name: 'Ireland' },
		{ code: 'NZ', name: 'New Zealand' }, { code: 'SG', name: 'Singapore' },
		{ code: 'HK', name: 'Hong Kong' }, { code: 'TW', name: 'Taiwan' },
		{ code: 'PL', name: 'Poland' }, { code: 'CZ', name: 'Czech Republic' },
		{ code: 'ZA', name: 'South Africa' }, { code: 'AR', name: 'Argentina' },
		{ code: 'CL', name: 'Chile' }, { code: 'CO', name: 'Colombia' },
		{ code: 'TH', name: 'Thailand' }, { code: 'PH', name: 'Philippines' },
		{ code: 'MY', name: 'Malaysia' }, { code: 'ID', name: 'Indonesia' },
		{ code: 'VN', name: 'Vietnam' }, { code: 'IL', name: 'Israel' },
		{ code: 'AE', name: 'UAE' }, { code: 'SA', name: 'Saudi Arabia' },
		{ code: 'TR', name: 'Turkey' }, { code: 'RU', name: 'Russia' },
		{ code: 'UA', name: 'Ukraine' }, { code: 'RO', name: 'Romania' },
		{ code: 'GR', name: 'Greece' }, { code: 'HR', name: 'Croatia' },
		{ code: 'KP', name: 'North Korea' }, { code: 'IR', name: 'Iran' },
		{ code: 'CU', name: 'Cuba' }, { code: 'SY', name: 'Syria' }
	].sort((a, b) => a.name.localeCompare(b.name));

	function getCountryList(raw: string): string[] {
		if (!raw) return [];
		return raw.split('.').filter(Boolean);
	}

	function addCountry(key: string, code: string) {
		const raw = getTagValue(key);
		const list = getCountryList(raw);
		if (!list.includes(code)) {
			list.push(code);
			setTagValue(key, list.join('.'));
		}
	}

	function removeCountry(key: string, code: string) {
		const raw = getTagValue(key);
		const list = getCountryList(raw).filter((c) => c !== code);
		setTagValue(key, list.join('.'));
	}

	const allowedCountryList = $derived(getCountryList(allowedCountriesRaw));
	const excludedCountryList = $derived(getCountryList(excludedCountriesRaw));

	const emailState = $derived(getCheckoutFieldState('e', 'E'));
	const addressState = $derived(getCheckoutFieldState('a', 'A'));
	const phoneState = $derived(getCheckoutFieldState('p', 'P'));
	const nameState = $derived(getCheckoutFieldState('n', 'N'));
	const nostrState = $derived(getCheckoutFieldState('z', 'Z'));

	// Show paid shipping fields when mode is 'none' or 'threshold'
	const showShippingRates = $derived(freeShippingMode !== 'always');

</script>

<div class="panel">
	<h3>Checkout Options</h3>

	<section class="tag-section">
		<h4>Checkout Fields <HintIcon tip="Store-wide defaults. Can be overridden per item in the Items panel." /></h4>
		<p class="section-hint">Which fields to collect from buyers.</p>

		<div class="checkout-grid">
			{#each [
				{ label: 'Email', lower: 'e', upper: 'E', state: emailState },
				{ label: 'Name', lower: 'n', upper: 'N', state: nameState },
				{ label: 'Address', lower: 'a', upper: 'A', state: addressState },
				{ label: 'Phone', lower: 'p', upper: 'P', state: phoneState },
				{ label: 'Nostr npub', lower: 'z', upper: 'Z', state: nostrState }
			] as field}
				<div class="checkout-field">
					<span class="field-label">{field.label}</span>
					<select value={field.state} onchange={(e) => setCheckoutField(field.lower, field.upper, e.currentTarget.value)}>
						<option value="off">Off</option>
						<option value="optional">Optional</option>
						<option value="required">Required</option>
					</select>
				</div>
			{/each}
		</div>
	</section>

	<section class="tag-section">
		<h4>Shipping</h4>

		<div class="field-sm">
			<label for="free-shipping-mode">Free Shipping <HintIcon tip="'Always' waives all shipping fees. 'Free over' makes it free above a certain order amount." /></label>
			<select id="free-shipping-mode" value={freeShippingMode} onchange={(e) => setFreeShippingMode(e.currentTarget.value)}>
				<option value="none">No free shipping</option>
				<option value="always">Always free shipping</option>
				<option value="threshold">Free over amount</option>
			</select>
		</div>

		{#if freeShippingMode === 'threshold'}
			<div class="threshold-fields">
				<div class="field-sm">
					<label for="free-threshold">Free shipping when order exceeds ({storeCurrency}) <HintIcon tip="Orders above this amount qualify for free shipping." /></label>
					<input id="free-threshold" type="number" min="0" step="0.01" value={freeShippingThresholdDisplay} onchange={(e) => setFreeShippingThreshold(e.currentTarget.value)} placeholder="e.g. 50" />
				</div>
				<label class="tag-toggle">
					<input type="checkbox" checked={freeShippingInternational} onchange={() => toggleTag('J')} />
					Also applies to international orders <HintIcon tip="Extend the free shipping policy to international orders too." />
				</label>
			</div>
		{/if}

		{#if showShippingRates}
			<div class="shipping-grid">
				<div class="field-sm">
					<label for="tag-country">Store Country <HintIcon tip="Orders to this country use domestic shipping rates." /></label>
					<select id="tag-country" value={storeCountry} onchange={(e) => setTagValue('L', e.currentTarget.value)}>
						<option value="">Select country</option>
						{#each COUNTRIES as c}
							<option value={c.code}>{c.name}</option>
						{/each}
					</select>
				</div>
				<div class="field-sm">
					<label for="tag-dom-base">Domestic Flat Rate ({shippingCurrencyLabel}) <HintIcon tip="Fixed shipping fee for domestic orders, before any weight surcharges." /></label>
					<input id="tag-dom-base" type="number" min="0" step="0.01" value={domesticBaseDisplay} onchange={(e) => setTagValue('s', displayToCents(e.currentTarget.value))} placeholder="e.g. 5" />
					<span class="field-hint">Base shipping cost for domestic orders</span>
				</div>
				<div class="field-sm">
					<label for="tag-intl-base">International Flat Rate ({shippingCurrencyLabel}) <HintIcon tip="Fixed shipping fee for international orders, before any weight surcharges." /></label>
					<input id="tag-intl-base" type="number" min="0" step="0.01" value={intlBaseDisplay} onchange={(e) => setTagValue('S', displayToCents(e.currentTarget.value))} placeholder="e.g. 15" />
					<span class="field-hint">Base shipping cost for international orders</span>
				</div>
				<div class="field-sm">
					<label for="tag-dom-wt">Domestic per-{weightUnit} surcharge <HintIcon tip="Added per unit of weight on top of the domestic flat rate." /></label>
					<input id="tag-dom-wt" type="number" min="0" step="0.01" value={domesticWeight} onchange={(e) => setTagValue('h', displayToCents(e.currentTarget.value))} />
					<span class="field-hint">Extra cost added per {weightUnit} of item weight for domestic</span>
				</div>
				<div class="field-sm">
					<label for="tag-intl-wt">International per-{weightUnit} surcharge <HintIcon tip="Added per unit of weight on top of the international flat rate." /></label>
					<input id="tag-intl-wt" type="number" min="0" step="0.01" value={intlWeight} onchange={(e) => setTagValue('H', displayToCents(e.currentTarget.value))} />
					<span class="field-hint">Extra cost added per {weightUnit} of item weight for intl</span>
				</div>
			</div>
		{/if}
	</section>

	<section class="tag-section">
		<h4>Pricing & Display</h4>

		<div class="shipping-grid">
			<div class="field-sm">
				<label for="tag-min-order">Minimum Order ({storeCurrency}) <HintIcon tip="Buyers must reach this order total before they can check out." /></label>
				<input id="tag-min-order" type="number" min="0" step="0.01" value={minOrderDisplay} onchange={(e) => setTagValue('m', displayToCents(e.currentTarget.value))} placeholder="e.g. 10" />
			</div>
			<div class="field-sm">
				<label for="tag-discount">Buy-X Discount <HintIcon tip="Quantity-based discount. Enter as qty:percent (e.g. 2:10 for 10% off 2+)." /></label>
				<input id="tag-discount" type="text" value={buyDiscount} onchange={(e) => setTagValue('B', e.currentTarget.value)} placeholder="2:10 = buy 2, 10% off" />
			</div>
			<div class="field-sm">
				<label for="tag-max-discount">Max Discount ({storeCurrency}) <HintIcon tip="Caps the total discount amount so it never exceeds this value." /></label>
				<input id="tag-max-discount" type="number" min="0" step="0.01" value={maxDiscountDisplay} onchange={(e) => setTagValue('X', displayToCents(e.currentTarget.value))} placeholder="e.g. 50" />
			</div>
			<div class="field-sm">
				<label for="tag-delivery">Delivery (days) <HintIcon tip="Estimated delivery time shown to buyers on the store page." /></label>
				<input id="tag-delivery" type="text" value={deliveryTime} onchange={(e) => setTagValue('D', e.currentTarget.value)} placeholder="3-5" />
			</div>
		</div>
	</section>

	<section class="tag-section">
		<h4>Country Restrictions</h4>

		<div class="country-section">
			<label class="field-label-sm">Allowed Countries <HintIcon tip="Only buyers from these countries can place an order. Leave empty to allow all." /></label>
			<div class="country-tags">
				{#each allowedCountryList as code}
					<span class="country-tag">
						{code}
						<button class="tag-remove" onclick={() => removeCountry('c', code)} aria-label="Remove {code}">×</button>
					</span>
				{/each}
			</div>
			<div class="country-controls">
				<input type="text" value={allowedCountriesDisplay} onchange={(e) => handleCountryInput('c', e.currentTarget.value)} placeholder="Type codes: US, CA, GB" class="country-input" />
				<select class="country-select" value="" onchange={(e) => { if (e.currentTarget.value) { addCountry('c', e.currentTarget.value); e.currentTarget.value = ''; } }}>
					<option value="">+ Add country</option>
					{#each COUNTRIES as c}
						<option value={c.code} disabled={allowedCountryList.includes(c.code)}>{c.code} - {c.name}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="country-section" class:disabled-field={hasAllowedCountries}>
			<label class="field-label-sm">Excluded Countries <HintIcon tip="Buyers from these countries cannot place an order." /></label>
			{#if hasAllowedCountries}
				<span class="field-hint">Not needed when allowed countries are set</span>
			{:else}
				<div class="country-tags">
					{#each excludedCountryList as code}
						<span class="country-tag">
							{code}
							<button class="tag-remove" onclick={() => removeCountry('x', code)} aria-label="Remove {code}">×</button>
						</span>
					{/each}
				</div>
				<div class="country-controls">
					<input type="text" value={excludedCountriesDisplay} onchange={(e) => handleCountryInput('x', e.currentTarget.value)} placeholder="Type codes: KP, IR" class="country-input" disabled={hasAllowedCountries} />
					<select class="country-select" value="" disabled={hasAllowedCountries} onchange={(e) => { if (e.currentTarget.value) { addCountry('x', e.currentTarget.value); e.currentTarget.value = ''; } }}>
						<option value="">+ Add country</option>
						{#each COUNTRIES as c}
							<option value={c.code} disabled={excludedCountryList.includes(c.code)}>{c.code} - {c.name}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>
	</section>

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

	h4 {
		font-size: var(--text-sm);
		font-weight: 600;
		margin-bottom: var(--space-2);
	}

	.tag-section {
		padding: var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.section-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-bottom: var(--space-1);
	}

	.checkout-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.checkout-field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.checkout-field select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		min-width: 100px;
	}

	.tag-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text);
	}

	.threshold-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-left: var(--space-2);
	}

	.shipping-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
		gap: var(--space-2);
	}

	.field-sm {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.field-sm label, .field-label-sm {
		font-size: 11px;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.field-sm input,
	.field-sm select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.field-sm input:focus,
	.field-sm select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: 10px;
		color: var(--color-text-muted);
	}

	.disabled-field {
		opacity: 0.5;
	}

	.country-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.country-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.country-tag {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 1px 6px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 500;
	}

	.tag-remove {
		border: none;
		background: none;
		padding: 0;
		font-size: 13px;
		color: var(--color-text-muted);
		cursor: pointer;
		line-height: 1;
	}

	.tag-remove:hover {
		color: var(--color-error);
	}

	.country-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.country-input {
		flex: 1 1 8rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.country-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.country-select {
		flex: 1 1 8rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

</style>

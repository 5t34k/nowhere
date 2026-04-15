<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	// Checkout field helpers (same pattern as store TagsPanel)
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

	function hasTag(key: string): boolean {
		return tags.some((t) => t.key === key);
	}

	function toggleTag(key: string) {
		const newTags = hasTag(key)
			? tags.filter((t) => t.key !== key)
			: [...tags, { key }];
		onUpdate(newTags);
	}

	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate(newTags);
	}

	const emailState = $derived(getCheckoutFieldState('e', 'E'));
	const nameState = $derived(getCheckoutFieldState('n', 'N'));
	const addressState = $derived(getCheckoutFieldState('a', 'A'));
	const fullAddressState = $derived(getCheckoutFieldState('b', 'B'));
	const phoneState = $derived(getCheckoutFieldState('p', 'P'));
	const nostrState = $derived(getCheckoutFieldState('z', 'Z'));
	const orgState = $derived(getCheckoutFieldState('u', 'U'));

	const commentEnabled = $derived(hasTag('R'));
	const hasCountryRestriction = $derived(!!getTagValue('c'));

	// Country support
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
		{ code: 'GR', name: 'Greece' }, { code: 'HR', name: 'Croatia' }
	].sort((a, b) => a.name.localeCompare(b.name));

	function getCountryList(raw: string): string[] {
		if (!raw) return [];
		return raw.split('.').filter(Boolean);
	}

	function addCountry(code: string) {
		const raw = getTagValue('c');
		const list = getCountryList(raw);
		if (!list.includes(code)) {
			setTagValue('c', [...list, code].join('.'));
		}
	}

	function removeCountry(code: string) {
		const raw = getTagValue('c');
		const list = getCountryList(raw).filter((c) => c !== code);
		setTagValue('c', list.join('.'));
	}

	const allowedCountryList = $derived(getCountryList(getTagValue('c')));
</script>

<div class="panel">
	<h3>Signer Fields</h3>

	<section class="field-group">
		<label>
			Required Information
			<HintIcon tip="What information signers must or may provide. Required fields must be filled; optional fields are shown but not enforced." />
		</label>
		<div class="checkout-grid">
			{#each [
				{ label: 'Name', lower: 'n', upper: 'N', state: nameState },
				{ label: 'Email', lower: 'e', upper: 'E', state: emailState },
				{ label: 'Location', lower: 'a', upper: 'A', state: addressState },
				{ label: 'Full Address', lower: 'b', upper: 'B', state: fullAddressState },
				{ label: 'Phone', lower: 'p', upper: 'P', state: phoneState },
				{ label: 'Nostr npub', lower: 'z', upper: 'Z', state: nostrState },
				{ label: 'Organisation', lower: 'u', upper: 'U', state: orgState }
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

	<section class="field-group">
		<label class="toggle-row">
			<input type="checkbox" checked={commentEnabled} onchange={() => toggleTag('R')} />
			<span>Allow signer comments</span>
			<HintIcon tip="Show a comment field where signers can add a personal message." />
		</label>
	</section>

	<section class="field-group">
		<label>
			Country Restriction			<HintIcon tip="Only allow signatures from selected countries. Leave empty to allow all." />
		</label>
		{#if allowedCountryList.length > 0}
			<div class="country-tags">
				{#each allowedCountryList as code}
					<span class="country-tag">
						{code}
						<button class="tag-remove" onclick={() => removeCountry(code)} aria-label="Remove {code}">&times;</button>
					</span>
				{/each}
			</div>
		{/if}
		<div class="country-controls">
			<select class="country-select" value="" onchange={(e) => { if (e.currentTarget.value) { addCountry(e.currentTarget.value); e.currentTarget.value = ''; } }}>
				<option value="">+ Add country</option>
				{#each COUNTRIES as c}
					<option value={c.code} disabled={allowedCountryList.includes(c.code)}>{c.code} - {c.name}</option>
				{/each}
			</select>
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

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
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

	.checkout-field .field-label {
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

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.toggle-row input[type="checkbox"] {
		margin: 0;
	}

	.country-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.country-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
	}

	.tag-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		padding: 0;
		line-height: 1;
	}

	.tag-remove:hover {
		color: var(--color-error);
	}

	.country-controls {
		display: flex;
		gap: var(--space-2);
	}

	.country-select {
		flex: 1;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		background: var(--color-bg);
	}
</style>

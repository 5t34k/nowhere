<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import { RETURN_PHRASES, WARRANTY_PHRASES } from '@nowhere/codec';
	import HintIcon from './HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate(newTags);
	}

	// Store Policies
	const returnsPolicy = $derived(getTagValue('r'));
	const warrantyPolicy = $derived(getTagValue('Y'));
	const faqText = $derived(getTagValue('Q'));

	const RETURN_GROUPS: { label: string; phrases: string[] }[] = [
		{ label: 'No Returns', phrases: RETURN_PHRASES.slice(0, 3) },
		{ label: 'Digital / Custom', phrases: RETURN_PHRASES.slice(3, 6) },
		{ label: 'Defective Only', phrases: RETURN_PHRASES.slice(6, 9) },
		{ label: '7-Day', phrases: RETURN_PHRASES.slice(9, 11) },
		{ label: '14-Day', phrases: RETURN_PHRASES.slice(11, 14) },
		{ label: '30-Day', phrases: RETURN_PHRASES.slice(14, 18) },
		{ label: 'Exchange Only', phrases: RETURN_PHRASES.slice(18, 20) },
		{ label: 'Store Credit', phrases: RETURN_PHRASES.slice(20, 22) },
		{ label: 'Contact Seller', phrases: RETURN_PHRASES.slice(22, 24) },
	];

	const WARRANTY_GROUPS: { label: string; phrases: string[] }[] = [
		{ label: 'No Warranty', phrases: WARRANTY_PHRASES.slice(0, 2) },
		{ label: '30-Day', phrases: WARRANTY_PHRASES.slice(2, 4) },
		{ label: '90-Day', phrases: WARRANTY_PHRASES.slice(4, 7) },
		{ label: '1-Year', phrases: WARRANTY_PHRASES.slice(7, 11) },
		{ label: '2-Year', phrases: WARRANTY_PHRASES.slice(11, 13) },
		{ label: 'Lifetime', phrases: WARRANTY_PHRASES.slice(13, 16) },
		{ label: 'Satisfaction Guarantee', phrases: WARRANTY_PHRASES.slice(16, 18) },
	];

	function findMatchingPreset(value: string, phrases: string[]): string {
		if (!value) return '';
		const exact = phrases.find((p) => p === value);
		if (exact) return exact;
		const prefix = phrases.find((p) => value.startsWith(p + '\n\n'));
		return prefix ?? '';
	}

	const returnsPreset = $derived(findMatchingPreset(returnsPolicy, RETURN_PHRASES));
	const warrantyPreset = $derived(findMatchingPreset(warrantyPolicy, WARRANTY_PHRASES));

	function selectPreset(tagKey: string, phrase: string) {
		if (phrase) {
			setTagValue(tagKey, phrase);
		} else {
			setTagValue(tagKey, '');
		}
	}

	function truncate(text: string, max: number): string {
		return text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
	}

</script>

<div class="panel">
	<h3>Store Policies</h3>

	<section class="tag-section">
		<h4>Returns & Refunds</h4>
		<p class="section-hint">Shown in the store footer. Leave empty to show default text.</p>

		<div class="field-sm">
			<label for="returns-preset">Preset <HintIcon tip="Keeping a preset as-is saves URL characters. You can add extra text after it, but editing the preset text itself loses the character savings." /></label>
			<select id="returns-preset" value={returnsPreset} onchange={(e) => selectPreset('r', e.currentTarget.value)}>
				<option value="">Write your own...</option>
				{#each RETURN_GROUPS as group}
					<optgroup label={group.label}>
						{#each group.phrases as phrase}
							<option value={phrase}>{truncate(phrase, 80)}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
			<textarea id="tag-returns" rows="3" value={returnsPolicy} onchange={(e) => setTagValue('r', e.currentTarget.value)} placeholder="Describe your return and refund policy..."></textarea>
		</div>
	</section>

	<section class="tag-section">
		<h4>Warranty</h4>

		<div class="field-sm">
			<label for="warranty-preset">Preset <HintIcon tip="Keeping a preset as-is saves URL characters. You can add extra text after it, but editing the preset text itself loses the character savings." /></label>
			<select id="warranty-preset" value={warrantyPreset} onchange={(e) => selectPreset('Y', e.currentTarget.value)}>
				<option value="">Write your own...</option>
				{#each WARRANTY_GROUPS as group}
					<optgroup label={group.label}>
						{#each group.phrases as phrase}
							<option value={phrase}>{truncate(phrase, 80)}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
			<textarea id="tag-warranty" rows="3" value={warrantyPolicy} onchange={(e) => setTagValue('Y', e.currentTarget.value)} placeholder="Describe your warranty policy..."></textarea>
		</div>
	</section>

	<section class="tag-section">
		<h4>FAQ</h4>

		<div class="field-sm">
			<label for="tag-faq">Questions & Answers <HintIcon tip="Use Q: and A: prefixes to format as a styled Q&A list. Without this format, text displays as plain paragraphs." /></label>
			<textarea id="tag-faq" rows="4" value={faqText} onchange={(e) => setTagValue('Q', e.currentTarget.value)} placeholder="Q: What is your shipping policy?&#10;A: We ship within 3-5 business days.&#10;&#10;Q: Do you accept returns?&#10;A: Yes, within 30 days of purchase."></textarea>
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

	.field-sm {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.field-sm label {
		font-size: 11px;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.field-sm select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.field-sm select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-sm textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-family: inherit;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}

	.field-sm textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

</style>

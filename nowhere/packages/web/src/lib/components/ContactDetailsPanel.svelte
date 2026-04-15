<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import { CONTACT_PLATFORMS, CUSTOM_CODE, platformByCode, parseContacts, serializeContacts } from '$lib/contacts.js';
	import HintIcon from './HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function hasTag(key: string): boolean {
		return tags.some((t) => t.key === key);
	}

	function toggleTag(key: string) {
		const has = tags.some((t) => t.key === key);
		const newTags = has ? tags.filter((t) => t.key !== key) : [...tags, { key }];
		onUpdate(newTags);
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate(newTags);
	}

	function removeTag(key: string) {
		onUpdate(tags.filter((t) => t.key !== key));
	}

	const nostrContact = $derived(hasTag('G'));
	const contactEmail = $derived(getTagValue('I'));
	let contactEmailError = $state('');

	function validateEmail(value: string) {
		if (!value) {
			contactEmailError = '';
			return;
		}
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		contactEmailError = emailRegex.test(value) ? '' : 'Please enter a valid email address';
	}

	const contactMethods = $derived(parseContacts(getTagValue('j')));

	const availablePlatforms = $derived(
		CONTACT_PLATFORMS.filter((p) => !contactMethods.some((c) => c.code === p.code))
	);

	function addContactMethod(code: string) {
		if (!code) return;
		const entry = code === CUSTOM_CODE
			? { code, handle: '', customName: '' }
			: { code, handle: '' };
		const updated = [...contactMethods, entry];
		setTagValue('j', serializeContacts(updated));
	}

	function updateContactAt(index: number, changes: { handle?: string; customName?: string }) {
		const updated = contactMethods.map((c, i) =>
			i === index ? { ...c, ...changes } : c
		);
		setTagValue('j', serializeContacts(updated));
	}

	function removeContactAt(index: number) {
		const updated = contactMethods.filter((_, i) => i !== index);
		const serialized = serializeContacts(updated);
		if (serialized) {
			setTagValue('j', serialized);
		} else {
			removeTag('j');
		}
	}
</script>

<div class="panel">
	<h3>Contact Details</h3>

	<section class="tag-section">
		<label class="tag-toggle">
			<input type="checkbox" checked={nostrContact} onchange={() => toggleTag('G')} />
			Suggest Nostr as a contact option <HintIcon tip="Shows a link to your Nostr profile in the store's contact section." />
		</label>
		<span class="field-hint">Customers will see your Nostr profile in the Contact section</span>
	</section>

	<section class="tag-section">
		<h4>Contact Email</h4>
		<div class="field-sm">
			<label for="tag-contact-email">Email Address <HintIcon tip="Email address shown as a contact option in the store footer." /></label>
			<input id="tag-contact-email" type="email" value={contactEmail} onchange={(e) => setTagValue('I', e.currentTarget.value)} onblur={(e) => validateEmail(e.currentTarget.value)} placeholder="you@example.com" />
			<span class="field-hint">Shown in the store footer contact section</span>
			{#if contactEmailError}
				<span class="field-error">{contactEmailError}</span>
			{/if}
		</div>
	</section>

	<section class="tag-section">
		<h4>Additional Contact Methods</h4>
		<span class="field-hint">Add other ways customers can reach you</span>

		{#each contactMethods as entry, i}
			{@const platform = platformByCode.get(entry.code)}
			{#if entry.code === CUSTOM_CODE}
				<div class="contact-row contact-row--custom">
					<input
						type="text"
						value={entry.customName ?? ''}
						onchange={(e) => updateContactAt(i, { customName: e.currentTarget.value })}
						placeholder="App name"
						class="contact-name"
					/>
					<input
						type="text"
						value={entry.handle}
						onchange={(e) => updateContactAt(i, { handle: e.currentTarget.value })}
						placeholder="Username or ID"
						class="contact-handle"
					/>
					<button class="tag-remove" onclick={() => removeContactAt(i)} aria-label="Remove custom contact">&times;</button>
				</div>
			{:else if platform}
				<div class="contact-row">
					<span class="contact-platform">{platform.name}</span>
					<input
						type="text"
						value={entry.handle}
						onchange={(e) => updateContactAt(i, { handle: e.currentTarget.value })}
						placeholder={platform.placeholder}
						class="contact-handle"
					/>
					<button class="tag-remove" onclick={() => removeContactAt(i)} aria-label="Remove {platform.name}">&times;</button>
				</div>
			{/if}
		{/each}

		<select class="contact-add" value="" onchange={(e) => { addContactMethod(e.currentTarget.value); e.currentTarget.value = ''; }}>
			<option value="">+ Add contact method</option>
			{#each availablePlatforms as p}
				<option value={p.code}>{p.name}</option>
			{/each}
			<option value={CUSTOM_CODE}>Custom</option>
		</select>
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

	.field-sm input {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.field-sm input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: 10px;
		color: var(--color-text-muted);
	}

	.field-error {
		font-size: 10px;
		color: var(--color-error);
	}

	.tag-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text);
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

	.contact-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.contact-platform {
		font-size: 11px;
		font-weight: 500;
		min-width: 110px;
		flex-shrink: 0;
	}

	.contact-name {
		width: 110px;
		flex-shrink: 0;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.contact-name:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.contact-handle {
		flex: 1;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.contact-handle:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.contact-add {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		width: 100%;
	}
</style>

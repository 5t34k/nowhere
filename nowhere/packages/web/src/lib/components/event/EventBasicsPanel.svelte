<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import NpubInput from '../NpubInput.svelte';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		pubkey: string;
		name: string;
		description: string;
		tags: Tag[];
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, name, description, tags, onUpdate }: Props = $props();

	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate('tags', newTags);
	}

	const organiser = $derived(getTagValue('o'));
</script>

<div class="panel">
	<h3>Basics</h3>

	<section class="field-group">
		<label for="ev-pubkey">Public Key <HintIcon tip="Your Nostr public key (npub). Adds a verifiable organiser identity to your event." /></label>
		<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} required={false} />
	</section>

	<section class="field-group">
		<label for="ev-name">Event Name <span class="required">*</span></label>
		<input
			id="ev-name"
			type="text"
			value={name}
			onchange={(e) => onUpdate('name', e.currentTarget.value)}
			placeholder="The name of your event"
		/>
	</section>

	<section class="field-group">
		<label for="ev-desc">
			Tagline			<HintIcon tip="A short subtitle shown beneath the event name. One punchy line." />
		</label>
		<input
			id="ev-desc"
			type="text"
			value={description}
			onchange={(e) => onUpdate('description', e.currentTarget.value)}
			placeholder="One line that captures what this is"
		/>
	</section>

	<section class="field-group">
		<label for="ev-organiser">
			Organiser			<HintIcon tip="The name of the person or organisation hosting the event." />
		</label>
		<input
			id="ev-organiser"
			type="text"
			value={organiser}
			onchange={(e) => setTagValue('o', e.currentTarget.value)}
			placeholder="Your name or organisation"
		/>
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

	.required {
		color: var(--color-danger, #dc2626);
	}

	.field-group input {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.field-group input:focus {
		outline: none;
		border-color: var(--color-primary);
	}
</style>

<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		description: string;
		tags: Tag[];
		onUpdate: (field: string, value: unknown) => void;
		onTagUpdate: (tags: Tag[]) => void;
	}

	let { description, tags, onUpdate, onTagUpdate }: Props = $props();

	const title = $derived(tags.find((t) => t.key === 't')?.value ?? '');

	function setTitle(value: string) {
		const newTags = tags.filter((t) => t.key !== 't');
		if (value) newTags.push({ key: 't', value });
		onTagUpdate(newTags);
	}
</script>

<div class="panel">
	<h3>Content</h3>

	<section class="field-group">
		<label for="msg-title">
			Title
			<HintIcon tip="A headline displayed above your message body." />
		</label>
		<input
			id="msg-title"
			type="text"
			value={title}
			onchange={(e) => setTitle(e.currentTarget.value)}
			placeholder="Your message title"
		/>
	</section>

	<section class="field-group">
		<label for="msg-body">
			Message Body
			<HintIcon tip="Supports Markdown: **bold**, *italic*, [links](url), # headings, > quotes, - lists, `code`" />
		</label>
		<textarea
			id="msg-body"
			value={description}
			onchange={(e) => onUpdate('description', e.currentTarget.value)}
			placeholder="Write your message here...&#10;&#10;Supports **Markdown** formatting."
			rows="12"
		></textarea>
		<span class="field-hint">
			Formatting: **bold**, *italic*, # heading, > quote, - list, `code`, [link](url)
		</span>
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

	.field-group input,
	.field-group textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.field-group input:focus,
	.field-group textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	textarea {
		resize: vertical;
		min-height: 200px;
		line-height: 1.6;
	}

	.field-hint {
		font-size: 10px;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}
</style>

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

	const tagline = $derived(tags.find((t) => t.key === 't')?.value ?? '');
	const budget = $derived(tags.find((t) => t.key === 'b')?.value ?? '');
	const faq = $derived(tags.find((t) => t.key === 'Q')?.value ?? '');

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onTagUpdate(newTags);
	}
</script>

<div class="panel">
	<h3>Story</h3>

	<section class="field-group">
		<label for="fr-tagline">
			Tagline			<HintIcon tip="A short subtitle shown beneath the campaign name." />
		</label>
		<input
			id="fr-tagline"
			type="text"
			value={tagline}
			onchange={(e) => setTagValue('t', e.currentTarget.value)}
			placeholder="Tagline"
		/>
	</section>

	<section class="field-group">
		<label for="fr-story">
			The Story
			<HintIcon tip="The main body of your fundraiser. Supports Markdown: **bold**, *italic*, [links](url), # headings" />
		</label>
		<textarea
			id="fr-story"
			value={description}
			onchange={(e) => onUpdate('description', e.currentTarget.value)}
			placeholder="Tell your story here...&#10;&#10;Why does this campaign matter? What will the funds achieve?"
			rows="10"
		></textarea>
		<span class="field-hint">
			Formatting: **bold**, *italic*, # heading, > quote, - list, [link](url)
		</span>
	</section>

	<section class="field-group">
		<label for="fr-budget">
			What the Money is For			<HintIcon tip="A breakdown of how funds will be used. Supports Markdown." />
		</label>
		<textarea
			id="fr-budget"
			value={budget}
			onchange={(e) => setTagValue('b', e.currentTarget.value)}
			placeholder="- Materials: $2,000&#10;- Labor: $1,500&#10;- Permits: $500"
			rows="5"
		></textarea>
	</section>

	<section class="field-group">
		<label for="fr-faq">
			FAQ			<HintIcon tip="Use Q: and A: prefixes for question-answer pairs." />
		</label>
		<textarea
			id="fr-faq"
			value={faq}
			onchange={(e) => setTagValue('Q', e.currentTarget.value)}
			placeholder="Q: Where do the funds go?&#10;A: All funds go directly to the project.&#10;&#10;Q: How can I help otherwise?&#10;A: Share this page with friends!"
			rows="6"
		></textarea>
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
		min-height: 100px;
		line-height: 1.6;
	}

	.field-hint {
		font-size: 10px;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}
</style>

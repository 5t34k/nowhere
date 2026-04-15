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
	const additionalContext = $derived(tags.find((t) => t.key === 'b')?.value ?? '');

	// Decision makers: tag D stores "name|title;name|title"
	interface DecisionMaker {
		name: string;
		title: string;
	}

	// Local editable list — allows empty rows while the user is typing
	let localMakers = $state<DecisionMaker[]>([]);
	// Track what we last wrote to tags so we can distinguish external tag changes
	let lastSerialized = $state('');

	// Sync from tags when they change externally
	$effect(() => {
		const raw = tags.find((t) => t.key === 'D')?.value ?? '';
		if (raw !== lastSerialized) {
			localMakers = raw
				? raw.split(';').filter(Boolean).map((entry) => {
						const [name, title] = entry.split('|');
						return { name: name || '', title: title || '' };
					})
				: [];
			lastSerialized = raw;
		}
	});

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onTagUpdate(newTags);
	}

	function persistMakers(makers: DecisionMaker[]) {
		const serialized = makers
			.filter((m) => m.name || m.title)
			.map((m) => `${m.name}|${m.title}`)
			.join(';');
		lastSerialized = serialized;
		setTagValue('D', serialized);
	}

	function setMakerField(index: number, field: 'name' | 'title', value: string) {
		localMakers[index] = { ...localMakers[index], [field]: value };
		persistMakers(localMakers);
	}

	function addDecisionMaker() {
		localMakers = [...localMakers, { name: '', title: '' }];
		// Don't persist yet — the empty row has no content to save
	}

	function removeDecisionMaker(index: number) {
		localMakers = localMakers.filter((_, i) => i !== index);
		persistMakers(localMakers);
	}
</script>

<div class="panel">
	<h3>Statement</h3>

	<section class="field-group">
		<label for="pt-tagline">
			Tagline			<HintIcon tip="A short subtitle shown beneath the petition title." />
		</label>
		<input
			id="pt-tagline"
			type="text"
			value={tagline}
			onchange={(e) => setTagValue('t', e.currentTarget.value)}
			placeholder="Protecting our community's future"
		/>
	</section>

	<section class="field-group">
		<label for="pt-statement">
			The Statement
			<HintIcon tip="The main body of your petition. Supports Markdown: **bold**, *italic*, [links](url), # headings" />
		</label>
		<textarea
			id="pt-statement"
			value={description}
			onchange={(e) => onUpdate('description', e.currentTarget.value)}
			placeholder="We, the undersigned, call upon...&#10;&#10;State your position clearly and concisely."
			rows="10"
		></textarea>
		<span class="field-hint">
			Formatting: **bold**, *italic*, # heading, > quote, - list, [link](url)
		</span>
	</section>

	<section class="field-group">
		<label>
			Decision Makers			<HintIcon tip="The people or bodies this petition is addressed to. Displayed as 'To:' addressees." />
		</label>
		<div class="dm-list">
			{#each localMakers as dm, i}
				<div class="dm-row">
					<input
						type="text"
						value={dm.name}
						onchange={(e) => setMakerField(i, 'name', e.currentTarget.value)}
						placeholder="Name"
						class="dm-name"
					/>
					<input
						type="text"
						value={dm.title}
						onchange={(e) => setMakerField(i, 'title', e.currentTarget.value)}
						placeholder="Title / Role"
						class="dm-title"
					/>
					<button class="remove-dm-btn" onclick={() => removeDecisionMaker(i)} aria-label="Remove">&times;</button>
				</div>
			{/each}
			<button class="add-dm-btn" onclick={addDecisionMaker}>+ Add decision maker</button>
		</div>
	</section>

	<section class="field-group">
		<label for="pt-context">
			Additional Context			<HintIcon tip="Supporting information, background, or evidence. Supports Markdown." />
		</label>
		<textarea
			id="pt-context"
			value={additionalContext}
			onchange={(e) => setTagValue('b', e.currentTarget.value)}
			placeholder="Background information, evidence, or further reading..."
			rows="5"
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

	.dm-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.dm-row {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}

	.dm-name {
		flex: 1;
		min-width: 0;
	}

	.dm-title {
		flex: 1;
		min-width: 0;
	}

	.remove-dm-btn {
		width: 28px;
		height: 28px;
		border: 1px solid var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.remove-dm-btn:hover {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.add-dm-btn {
		border: 1px dashed var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
		text-align: center;
	}

	.add-dm-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
</style>

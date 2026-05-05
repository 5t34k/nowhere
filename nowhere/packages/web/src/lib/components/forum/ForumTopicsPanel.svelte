<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	let localTopics = $state<string[]>([]);
	let lastTagValue = '';

	// Sync from tag → local state, but skip when we just wrote the tag ourselves
	const topicsTag = $derived(tags.find(t => t.key === 'O'));
	$effect(() => {
		const tv = topicsTag?.value ?? '';
		if (tv !== lastTagValue) {
			lastTagValue = tv;
			localTopics = tv ? tv.split('\\p').filter(Boolean) : [];
		}
	});

	function syncToTag() {
		const filtered = localTopics.filter(t => t.trim());
		const newTags = tags.filter(t => t.key !== 'O');
		if (filtered.length > 0) {
			newTags.push({ key: 'O', value: filtered.join('\\p') });
		}
		lastTagValue = filtered.length > 0 ? filtered.join('\\p') : '';
		onUpdate(newTags);
	}

	const MAX_TOPIC_LENGTH = 40;

	function updateTopic(index: number, value: string) {
		localTopics[index] = value.slice(0, MAX_TOPIC_LENGTH);
		syncToTag();
	}

	function addTopic() {
		localTopics = [...localTopics, ''];
	}

	function removeTopic(index: number) {
		localTopics = localTopics.filter((_, i) => i !== index);
		syncToTag();
	}
</script>

<div class="panel">
	<h3>Topics</h3>

	<p class="hint">
		The "General" topic is always present and cannot be removed.
		Add custom topics to organise discussions.
		<HintIcon tip="Topics are encoded in the URL. Each topic gets its own derived tag for relay filtering." />
	</p>

	<div class="topic-list">
		<div class="topic-row fixed">
			<input type="text" value="General" disabled />
			<span class="fixed-label">default</span>
		</div>

		{#each localTopics as topic, i}
			<div class="topic-row">
				<input
					type="text"
					value={topic}
					oninput={(e) => {
						const el = e.currentTarget;
						if (el.value.length > MAX_TOPIC_LENGTH) el.value = el.value.slice(0, MAX_TOPIC_LENGTH);
					}}
					onchange={(e) => updateTopic(i, e.currentTarget.value)}
					placeholder="Topic name"
					maxlength={MAX_TOPIC_LENGTH}
				/>
				<button class="remove-btn" onclick={() => removeTopic(i)} aria-label="Remove topic" title="Remove">&times;</button>
			</div>
		{/each}

		<button class="add-btn" onclick={addTopic}>+ Add topic</button>
		<span class="char-hint">{MAX_TOPIC_LENGTH} characters max per topic</span>
	</div>
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

	.hint {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.topic-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.topic-row {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}

	.topic-row input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.topic-row input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.topic-row input:disabled {
		background: var(--color-bg-secondary);
		color: var(--color-text-muted);
	}

	.fixed-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.remove-btn {
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

	.remove-btn:hover {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.add-btn {
		border: 1px dashed var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
		text-align: center;
	}

	.add-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.char-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>

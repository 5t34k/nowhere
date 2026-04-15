<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from './HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
		primaryLabel: string;
		primaryHint?: string;
		secondaryLabel?: string;
		secondaryHint?: string;
		showSecondary?: boolean;
	}

	let { tags, onUpdate, primaryLabel, primaryHint, secondaryLabel, secondaryHint, showSecondary = false }: Props = $props();

	function parseRelays(key: string): string[] {
		const tag = tags.find(t => t.key === key);
		if (!tag?.value) return [];
		return tag.value.split(',').filter(Boolean);
	}

	const customEnabled = $derived(
		tags.some(t => t.key === '1' || t.key === '2')
	);

	const initialPrimary = parseRelays('1');
	let primaryRows = $state<string[]>(
		initialPrimary.length > 0 ? initialPrimary : (customEnabled ? [''] : [])
	);
	let secondaryRows = $state<string[]>(parseRelays('2'));

	function syncRelays(key: string, rows: string[]) {
		const filtered = rows.map(r => r.trim()).filter(Boolean);
		const newTags = tags.filter(t => t.key !== key);
		if (filtered.length > 0) newTags.push({ key, value: filtered.join(',') });
		onUpdate(newTags);
	}

	function toggleCustom() {
		if (customEnabled) {
			primaryRows = [];
			secondaryRows = [];
			onUpdate(tags.filter(t => t.key !== '1' && t.key !== '2'));
		} else {
			primaryRows = [''];
			onUpdate([...tags.filter(t => t.key !== '1' && t.key !== '2'), { key: '1', value: '' }]);
		}
	}

	function updatePrimary(index: number, value: string) {
		primaryRows[index] = value;
		syncRelays('1', primaryRows);
	}

	function updateSecondary(index: number, value: string) {
		secondaryRows[index] = value;
		syncRelays('2', secondaryRows);
	}

	function addPrimary() {
		primaryRows = [...primaryRows, ''];
	}

	function addSecondary() {
		secondaryRows = [...secondaryRows, ''];
	}

	function removePrimary(index: number) {
		primaryRows = primaryRows.filter((_, i) => i !== index);
		if (primaryRows.length === 0) primaryRows = [''];
		syncRelays('1', primaryRows);
	}

	function removeSecondary(index: number) {
		secondaryRows = secondaryRows.filter((_, i) => i !== index);
		syncRelays('2', secondaryRows);
	}
</script>

<details class="advanced-section">
	<summary class="advanced-summary">Advanced</summary>

	<div class="advanced-body">
		<div class="relay-toggle-row">
			<span class="relay-toggle-label">Use custom relays</span>
			<button
				class="toggle-track"
				class:on={customEnabled}
				onclick={toggleCustom}
				role="switch"
				aria-checked={customEnabled}
				aria-label="Use custom relays"
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		{#if !customEnabled}
			<p class="relay-hint">
				<strong>Custom relays: tradeoffs to consider.</strong> Using specific relays changes your privacy profile in both directions. Picking uncommon relays means your site blends in less with the crowd, but trusted or self-hosted relays avoid exposing activity to third parties you don't control. Running your own relay also gives you control over how long events persist. The default relay network is the safer default if you're unsure.
			</p>
		{:else}
			<div class="relay-group">
				<div class="relay-group-label">{primaryLabel}{#if primaryHint}<HintIcon tip={primaryHint} />{/if}</div>
				<div class="relay-list">
					{#each primaryRows as relay, i}
						<div class="relay-row">
							<input
								type="text"
								value={relay}
								oninput={(e) => updatePrimary(i, e.currentTarget.value)}
								placeholder="wss://relay.example.com"
							/>
							<button class="remove-btn" onclick={() => removePrimary(i)} aria-label="Remove relay" title="Remove">&times;</button>
						</div>
					{/each}
					<button class="add-btn" onclick={addPrimary}>+ Add relay</button>
				</div>
			</div>

			{#if showSecondary && secondaryLabel}
				<div class="relay-group">
					<div class="relay-group-label">{secondaryLabel}{#if secondaryHint}<HintIcon tip={secondaryHint} />{/if}</div>
					<div class="relay-list">
						{#each secondaryRows as relay, i}
							<div class="relay-row">
								<input
									type="text"
									value={relay}
									oninput={(e) => updateSecondary(i, e.currentTarget.value)}
									placeholder="wss://relay.example.com"
								/>
								<button class="remove-btn" onclick={() => removeSecondary(i)} aria-label="Remove relay" title="Remove">&times;</button>
							</div>
						{/each}
						<button class="add-btn" onclick={addSecondary}>+ Add relay</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</details>

<style>
	.advanced-section {
		border-top: 1px solid var(--color-border);
		margin-top: var(--space-2);
	}

	.advanced-summary {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: var(--space-3) 0;
		user-select: none;
		list-style: none;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.advanced-summary::before {
		content: '›';
		display: inline-block;
		transition: transform 0.15s;
		font-size: 1.1em;
	}

	details[open] .advanced-summary::before {
		transform: rotate(90deg);
	}

	.advanced-summary::-webkit-details-marker {
		display: none;
	}

	.advanced-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: var(--space-3);
	}

	.relay-toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.relay-toggle-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.toggle-track {
		width: 36px;
		height: 20px;
		border-radius: 10px;
		background: var(--color-border);
		border: none;
		padding: 0;
		cursor: pointer;
		position: relative;
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.toggle-track.on {
		background: var(--color-primary);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s;
		display: block;
	}

	.toggle-track.on .toggle-thumb {
		transform: translateX(16px);
	}

	.relay-hint {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.relay-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.relay-group-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.relay-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.relay-row {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}

	.relay-row input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
	}

	.relay-row input:focus {
		outline: none;
		border-color: var(--color-primary);
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
		align-self: flex-start;
	}

	.add-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
</style>

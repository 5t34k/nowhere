<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { ItemState } from '../stores/builder-state';
	import ItemEditor from './ItemEditor.svelte';

	interface Props {
		items: ItemState[];
		weightUnit: string;
		onUpdateItem: (index: number, field: string, value: unknown) => void;
		onRemoveItem: (index: number) => void;
		onMoveItem: (from: number, to: number) => void;
		onCloneItem: (index: number) => void;
		onAddItem: () => void;
	}

	let { items, weightUnit, onUpdateItem, onRemoveItem, onMoveItem, onCloneItem, onAddItem }: Props = $props();

	let searchQuery = $state('');
	let collapseKey = $state(0);
	let targetExpanded = $state(true);
	let allExpanded = $state(true);

	function collapseAll() {
		allExpanded = false;
		targetExpanded = false;
		collapseKey++;
	}

	function expandAll() {
		allExpanded = true;
		targetExpanded = true;
		collapseKey++;
	}

	const filteredIndices = $derived.by(() => {
		if (!searchQuery.trim()) return items.map((_, i) => i);
		const q = searchQuery.trim().toLowerCase();
		return items.reduce<number[]>((acc, item, i) => {
			if (item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)) {
				acc.push(i);
			}
			return acc;
		}, []);
	});

	let draggingIndex = $state<number | null>(null);
	// dropPosition is the insertion index (0..items.length)
	let dropPosition = $state<number | null>(null);

	function handleDragStart(index: number, e: DragEvent) {
		draggingIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(index: number, e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (draggingIndex === null) return;

		// Determine top/bottom half of the target to decide insertion point
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		if (e.clientY < midY) {
			dropPosition = index;
		} else {
			dropPosition = index + 1;
		}
	}

	function handleBottomDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropPosition = items.length;
	}

	function executeDrop(e: DragEvent) {
		e.preventDefault();
		if (draggingIndex === null || dropPosition === null) return;
		if (draggingIndex !== dropPosition && draggingIndex !== dropPosition - 1) {
			// Adjust for the removal offset
			let to = dropPosition;
			if (draggingIndex < dropPosition) to--;
			onMoveItem(draggingIndex, to);
		}
		draggingIndex = null;
		dropPosition = null;
	}

	function handleDragEnd() {
		draggingIndex = null;
		dropPosition = null;
	}
</script>

<div class="panel">
	<div class="panel-header">
		<h3>Items ({items.length})</h3>
		<div class="header-actions">
			{#if items.length > 1}
				<button class="collapse-btn" onclick={allExpanded ? collapseAll : expandAll}>
					{allExpanded ? 'Collapse All' : 'Expand All'}
				</button>
			{/if}
			<button class="add-btn" onclick={onAddItem}>+ Add Item</button>
		</div>
	</div>

	{#if items.length > 3}
		<div class="search-bar" transition:slide={{ duration: 200 }}>
			<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
			<input
				class="search-input"
				type="text"
				placeholder="Search items..."
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button class="search-clear" onclick={() => (searchQuery = '')}>&#10005;</button>
			{/if}
		</div>
	{/if}

	{#if items.length === 0}
		<div class="empty">
			<p>No items yet. Add your first product.</p>
			<button class="add-btn" onclick={onAddItem}>+ Add Item</button>
		</div>
	{:else}
		<div class="items-list">
			{#each items as item, i (i)}
				{#if filteredIndices.includes(i)}
					{#if dropPosition === i && draggingIndex !== null && draggingIndex !== i && draggingIndex !== i - 1}
						<div class="drop-indicator"></div>
					{/if}
					<div
						class="item-wrapper"
						class:dragging={draggingIndex === i}
					>
						<ItemEditor
							index={i}
							name={item.name}
							price={item.price}
							description={item.description}
							image={item.image}
							tags={item.tags}
							{weightUnit}
							{collapseKey}
							{targetExpanded}
							onUpdate={(field, value) => onUpdateItem(i, field, value)}
							onRemove={() => onRemoveItem(i)}
							onClone={() => onCloneItem(i)}
							onDragStart={(e) => handleDragStart(i, e)}
							onDragOver={(e) => handleDragOver(i, e)}
							onDragEnd={handleDragEnd}
							onDrop={executeDrop}
						/>
					</div>
				{/if}
			{/each}
			{#if dropPosition === items.length && draggingIndex !== null && draggingIndex !== items.length - 1}
				<div class="drop-indicator"></div>
			{/if}
			<div
				class="bottom-drop-zone"
				ondragover={handleBottomDragOver}
				ondrop={executeDrop}
			></div>
		</div>
		{#if searchQuery && filteredIndices.length === 0}
			<p class="no-results">No items match "{searchQuery}"</p>
		{/if}
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.collapse-btn {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		font-weight: 500;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.collapse-btn:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.search-bar {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: var(--space-2);
		color: var(--color-text-muted);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: var(--space-2) var(--space-3) var(--space-2) calc(var(--space-2) + 20px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		background: var(--color-bg);
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.search-input::placeholder {
		color: var(--color-text-muted);
	}

	.search-clear {
		position: absolute;
		right: var(--space-1);
		width: 24px;
		height: 24px;
		border: none;
		background: none;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
	}

	.search-clear:hover {
		color: var(--color-text);
		background: var(--color-bg-secondary);
	}

	.no-results {
		text-align: center;
		padding: var(--space-4);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.add-btn {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-primary);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: all var(--transition-fast);
	}

	.add-btn:hover {
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

	.items-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.item-wrapper {
		transition: opacity var(--transition-fast);
	}

	.item-wrapper.dragging {
		opacity: 0.4;
	}

	.drop-indicator {
		height: 3px;
		background: var(--color-primary);
		border-radius: 2px;
		margin: -2px 0;
	}

	.bottom-drop-zone {
		min-height: 40px;
	}

	.empty {
		text-align: center;
		padding: var(--space-8);
		color: var(--color-text-muted);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}
</style>

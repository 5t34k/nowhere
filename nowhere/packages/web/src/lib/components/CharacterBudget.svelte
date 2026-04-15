<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		length: number;
		expanded?: boolean;
		onToggle?: () => void;
		children?: Snippet;
	}

	let { length, expanded = false, onToggle, children }: Props = $props();

	const percent = $derived(Math.min(100, (length / 2000) * 100));
	const isOver = $derived(length > 2000);
	const colorClass = $derived(isOver ? 'red' : percent > 85 ? 'yellow' : percent > 60 ? 'yellow' : 'green');
</script>

<!-- Bottom sheet overlay — always in DOM for smooth enter/exit -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sheet-backdrop" class:visible={expanded} onclick={onToggle}></div>
<div class="sheet" class:open={expanded}>
	<button class="sheet-handle" onclick={onToggle} type="button">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
	</button>
	<div class="sheet-content">
		{@render children?.()}
	</div>
</div>

<div class="budget-wrapper">
	{#if isOver}
		<div class="budget-warning">
			Links over 2,000 characters may not be shareable on some platforms. Keep under the limit for maximum compatibility.
		</div>
	{/if}
	<button class="budget-bar" onclick={onToggle} type="button">
		<div class="budget-track">
			<div class="budget-fill {colorClass}" style:width="{percent}%"></div>
		</div>
		<span class="budget-text {colorClass}">
			{length.toLocaleString()} / 2,000
		</span>
		<span class="budget-chevron">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>
		</span>
	</button>
</div>

<style>
	/* Bottom sheet backdrop */
	.sheet-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
		z-index: 100;
	}

	.sheet-backdrop.visible {
		opacity: 1;
		pointer-events: auto;
	}

	/* Bottom sheet */
	.sheet {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		top: 16px;
		transform: translateY(100%);
		transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
		background: var(--color-bg);
		border-radius: 16px 16px 0 0;
		z-index: 101;
		display: flex;
		flex-direction: column;
		box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.2);
	}

	.sheet.open {
		transform: translateY(0);
	}

	.sheet-handle {
		flex-shrink: 0;
		display: flex;
		justify-content: center;
		padding: 8px 0 4px;
		cursor: pointer;
		border: none;
		background: none;
		width: 100%;
		color: var(--color-text-muted);
	}

	.sheet-handle:hover {
		color: var(--color-text-secondary);
	}

	.sheet-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 var(--space-4) var(--space-4);
	}

	/* Budget bar */
	.budget-wrapper {
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.budget-warning {
		padding: var(--space-2) var(--space-4);
		background: #fff3cd;
		color: #856404;
		font-size: var(--text-xs);
		line-height: 1.4;
		border-bottom: 1px solid #ffc107;
	}


	.budget-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: none;
		background: none;
		width: 100%;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.budget-bar:hover {
		background: var(--color-bg-secondary);
	}

	.budget-track {
		flex: 1;
		height: 6px;
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.budget-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width var(--transition-base), background var(--transition-base);
	}

	.budget-fill.green {
		background: var(--color-success);
	}
	.budget-fill.yellow {
		background: var(--color-warning);
	}
	.budget-fill.red {
		background: var(--color-error);
	}

	.budget-text {
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		font-family: var(--font-mono);
	}

	.budget-text.green {
		color: var(--color-success);
	}
	.budget-text.yellow {
		color: var(--color-warning);
	}
	.budget-text.red {
		color: var(--color-error);
	}

	.budget-chevron {
		display: flex;
		align-items: center;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.budget-bar:hover .budget-chevron {
		color: var(--color-text-secondary);
	}
</style>

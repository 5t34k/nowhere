<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		sidebar: Snippet;
		editor: Snippet;
		preview: Snippet;
		budget: Snippet;
		editorCollapsed: boolean;
		onToggleCollapse: () => void;
		mobileShowPreview?: boolean;
		scrollKey?: unknown;
	}

	let { sidebar, editor, preview, budget, editorCollapsed, onToggleCollapse, mobileShowPreview = false, scrollKey = undefined }: Props = $props();

	let editorScrollEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		scrollKey;
		editorScrollEl?.scrollTo({ top: 0 });
	});

	let layoutEl: HTMLDivElement;
	let editorFraction = $state(0.5);
	let dragging = $state(false);
	let skipNextClick = false;

	// Detect mobile to avoid inline flex-grow overriding CSS
	let isMobile = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 768px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	// Reset to default 50/50 when expanding from collapsed
	$effect(() => {
		if (!editorCollapsed) {
			editorFraction = 0.5;
		}
	});

	function handleRailMouseDown(e: MouseEvent) {
		const startX = e.clientX;
		let moved = false;

		function onMove(ev: MouseEvent) {
			if (editorCollapsed) return;
			if (!moved && Math.abs(ev.clientX - startX) > 3) moved = true;
			if (!moved) return;

			dragging = true;
			const rect = layoutEl.getBoundingClientRect();
			const sidebarEl = layoutEl.querySelector('.sidebar-area') as HTMLElement;
			const sidebarWidth = sidebarEl?.offsetWidth ?? 0;
			const railWidth = 6;
			const available = rect.width - sidebarWidth - railWidth;
			const editorWidth = ev.clientX - rect.left - sidebarWidth;
			editorFraction = Math.max(0.15, Math.min(0.85, editorWidth / available));
		}

		function onUp() {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			if (moved) skipNextClick = true;
			dragging = false;
		}

		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	function handleRailClick() {
		if (skipNextClick) {
			skipNextClick = false;
			return;
		}
		onToggleCollapse();
	}
</script>

<div class="builder-layout" bind:this={layoutEl}>
	<div class="sidebar-area">
		{@render sidebar()}
	</div>

	<div
		class="editor-area"
		class:collapsed={editorCollapsed}
		class:dragging
		class:mobile-hidden={mobileShowPreview}
		style:flex-grow={isMobile ? undefined : (editorCollapsed ? undefined : editorFraction)}
	>
		<div class="editor-scroll" bind:this={editorScrollEl}>
			{@render editor()}
		</div>
		<div class="budget-area">
			{@render budget()}
		</div>
	</div>

	<button
		class="collapse-rail"
		class:is-collapsed={editorCollapsed}
		onmousedown={handleRailMouseDown}
		onclick={handleRailClick}
		title={editorCollapsed ? 'Show editor' : 'Hide editor'}
		aria-label={editorCollapsed ? 'Show editor' : 'Hide editor'}
	>
		<span class="rail-chevron">
			{#if editorCollapsed}&#9654;{:else}&#9664;{/if}
		</span>
	</button>

	<div
		class="preview-area"
		class:dragging
		class:mobile-visible={mobileShowPreview}
		style:flex-grow={isMobile ? undefined : (editorCollapsed ? undefined : 1 - editorFraction)}
	>
		{@render preview()}
	</div>
</div>

<style>
	.builder-layout {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}

	.sidebar-area {
		flex-shrink: 0;
	}

	.editor-area {
		flex: 1 1 0%;
		display: flex;
		flex-direction: column;
		min-width: 0;
		position: relative;
		overflow: hidden;
		transition: flex-grow 300ms ease, opacity 200ms ease;
	}

	.editor-area.collapsed {
		flex: 0 0 0%;
		opacity: 0;
		pointer-events: none;
	}

	.editor-area.dragging {
		transition: none;
	}

	.editor-scroll {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-6);
	}

	.budget-area {
		flex-shrink: 0;
	}

	/* The rail: a thin vertical strip that acts as the border + resize/collapse control */
	.collapse-rail {
		flex-shrink: 0;
		width: 6px;
		border: none;
		border-left: 1px solid var(--color-border);
		border-right: 1px solid var(--color-border);
		background: transparent;
		cursor: col-resize;
		position: relative;
		padding: 0;
		transition: background 0.15s, width 0.15s;
	}

	.collapse-rail.is-collapsed {
		cursor: pointer;
	}

	.collapse-rail:hover {
		width: 10px;
		background: var(--color-bg-tertiary);
	}

	.rail-chevron {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 14px;
		color: transparent;
		transition: color 0.15s;
		cursor: pointer;
		line-height: 1;
		padding: var(--space-2) var(--space-1);
	}

	.collapse-rail:hover .rail-chevron {
		color: var(--color-text-secondary);
	}

	.preview-area {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		transition: flex-grow 300ms ease;
	}

	.preview-area.dragging {
		transition: none;
	}

	/* ─── Responsive: mobile ─── */
	@media (max-width: 768px) {
		.builder-layout {
			flex-direction: column;
			height: 100vh;
		}

		.sidebar-area {
			flex-shrink: 0;
		}

		.editor-area {
			flex: 1 1 0%;
			min-height: 0;
		}

		.editor-area.collapsed {
			flex: 1 1 0%;
			min-height: 0;
			opacity: 1;
			pointer-events: auto;
		}

		.editor-scroll {
			padding: var(--space-4);
		}

		.editor-area.mobile-hidden {
			display: none;
		}

		.preview-area {
			display: none;
			flex: 1;
			min-height: 0;
		}

		.preview-area.mobile-visible {
			display: flex;
		}
	}
</style>

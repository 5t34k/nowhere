<script lang="ts">
	interface PanelDef {
		id: string;
		label: string;
		step: string;
	}

	interface Props {
		activePanel: string;
		onNavigate: (panel: string) => void;
		onImport?: () => void;
		onReset: () => void;
		panels?: PanelDef[];
		resetLabel?: string;
		importLabel?: string;
		mobileShowPreview?: boolean;
		onTogglePreview?: () => void;
		siteType?: string;
		beta?: boolean;
	}

	const defaultPanels: PanelDef[] = [
		{ id: 'settings', label: 'Store Settings', step: '1' },
		{ id: 'policies', label: 'Store Policies', step: '2' },
		{ id: 'contacts', label: 'Contact Details', step: '3' },
		{ id: 'payment', label: 'Payment', step: '4' },
		{ id: 'items', label: 'Items', step: '5' },
		{ id: 'inventory', label: 'Inventory', step: '6' },
		{ id: 'tags', label: 'Checkout Options', step: '7' },
		{ id: 'verification', label: 'Verification', step: '8' },
		{ id: 'manage', label: 'Manage', step: '9' },
		{ id: 'publish', label: 'Share Link', step: '10' }
	];

	let { activePanel, onNavigate, onImport, onReset, panels = defaultPanels, resetLabel = 'Reset All', importLabel = 'Import Store', mobileShowPreview = false, onTogglePreview, siteType = '', beta = false }: Props = $props();

	import { getContext } from 'svelte';

	interface SidebarNav {
		homeHref?: string;
		pwaBack?: string;
		getApp?: string;
	}
	const nav = getContext<SidebarNav>('sidebarNav') ?? {};

	let showOverflow = $state(false);
	let tabsEl: HTMLDivElement;

	function scrollTabToCenter(btn: HTMLElement) {
		if (!tabsEl) return;
		const tabsWidth = tabsEl.offsetWidth;
		const btnWidth = btn.offsetWidth;
		const scrollTarget = btn.offsetLeft - (tabsWidth / 2) + (btnWidth / 2);
		tabsEl.scrollTo({ left: scrollTarget, behavior: 'smooth' });
	}

	function handleMobileTabClick(panel: PanelDef, e: MouseEvent) {
		if (activePanel === panel.id) return;
		onNavigate(panel.id);
		scrollTabToCenter(e.currentTarget as HTMLElement);
	}
</script>

<!-- Desktop sidebar -->
<nav class="sidebar desktop-only">
	<div class="sidebar-header">
		{#if nav.pwaBack}
			<a href={nav.pwaBack} class="nav-back">← Home</a>
		{/if}
		<a href={nav.homeHref ?? '/'} class="logo" class:logo--beta={beta}>
			nowhere
			{#if beta}
				<span class="beta-tag">beta</span>
			{/if}
		</a>
		{#if siteType}
			<span class="logo-type">{siteType}</span>
		{/if}
		{#if nav.getApp}
			<a href={nav.getApp} class="get-app">Get Nowhere App</a>
		{/if}
	</div>

	<div class="nav-items">
		{#each panels as panel}
			<button
				class="nav-item"
				class:active={activePanel === panel.id}
				onclick={() => onNavigate(panel.id)}
			>
				<span class="nav-step" class:active={activePanel === panel.id}>{panel.step}</span>
				<span class="nav-label">{panel.label}</span>
			</button>
		{/each}
	</div>

	<div class="sidebar-footer">
		{#if onImport}
			<button class="footer-btn" onclick={onImport}>{importLabel}</button>
		{/if}
		<button class="footer-btn footer-btn--danger" onclick={onReset}>{resetLabel}</button>
	</div>
</nav>

<!-- Mobile top bar -->
<div class="mobile-bar mobile-only">
	<div class="mobile-bar-top">
		<div class="mobile-brand">
			{#if nav.pwaBack}
				<a href={nav.pwaBack} class="nav-back">← Home</a>
			{/if}
			<a href={nav.homeHref ?? '/'} class="mobile-logo" class:mobile-logo--beta={beta}>
				nowhere
				{#if beta}
					<span class="mobile-beta-tag">beta</span>
				{/if}
			</a>
			{#if siteType}
				<span class="mobile-logo-type">{siteType}</span>
			{/if}
			{#if nav.getApp}
				<a href={nav.getApp} class="get-app">Get Nowhere App</a>
			{/if}
		</div>
		<div class="mobile-bar-actions">
			{#if onTogglePreview}
				<div class="mobile-mode-toggle">
					<button class="mobile-mode-btn" class:active={!mobileShowPreview} onclick={() => { if (mobileShowPreview && onTogglePreview) onTogglePreview(); }} aria-label="Editor">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
					</button>
					<button class="mobile-mode-btn" class:active={mobileShowPreview} onclick={() => { if (!mobileShowPreview && onTogglePreview) onTogglePreview(); }} aria-label="Preview">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
					</button>
				</div>
			{/if}
			<button class="mobile-overflow-btn" onclick={() => (showOverflow = !showOverflow)} aria-label="More options">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
			</button>
		</div>
	</div>

	{#if !mobileShowPreview}
		<div class="mobile-tabs" bind:this={tabsEl}>
			{#each panels as panel}
				<button
					class="mobile-tab"
					class:active={activePanel === panel.id}
					onclick={(e) => handleMobileTabClick(panel, e)}
				>
					{panel.label}
				</button>
			{/each}
		</div>
	{/if}

	{#if showOverflow}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="mobile-overflow-backdrop" onclick={() => (showOverflow = false)}></div>
		<div class="mobile-overflow-menu">
			{#if onImport}
				<button class="mobile-overflow-item" onclick={() => { onImport(); showOverflow = false; }}>{importLabel}</button>
			{/if}
			<button class="mobile-overflow-item mobile-overflow-item--danger" onclick={() => { onReset(); showOverflow = false; }}>{resetLabel}</button>
		</div>
	{/if}
</div>

<style>
	/* ─── Desktop Sidebar ─── */
	.desktop-only {
		display: flex;
	}

	.mobile-only {
		display: none;
	}

	@media (max-width: 768px) {
		.desktop-only {
			display: none !important;
		}

		.mobile-only {
			display: flex !important;
		}
	}

	.sidebar {
		width: 200px;
		flex-direction: column;
		background: var(--color-bg-secondary);
		border-right: 1px solid var(--color-border);
		height: 100vh;
		position: sticky;
		top: 0;
	}

	.sidebar-header {
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border);
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.nav-back {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-muted);
		text-decoration: none;
		white-space: nowrap;
		transition: color var(--transition-fast);
	}

	.nav-back:hover {
		color: var(--color-text-secondary);
	}

	.get-app {
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--color-text-muted);
		text-decoration: none;
		white-space: nowrap;
		transition: color var(--transition-fast);
		margin-left: auto;
	}

	.get-app:hover {
		color: var(--color-primary);
	}

	.logo {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
	}

	.logo--beta {
		position: relative;
	}

	.beta-tag {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 1px;
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-text-muted);
		line-height: 1;
	}

	.logo-type {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-secondary);
	}

	.nav-items {
		flex: 1;
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		text-align: left;
		transition: all var(--transition-fast);
	}

	.nav-item:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.nav-item.active {
		background: var(--color-bg);
		color: var(--color-primary);
		font-weight: 600;
		box-shadow: var(--shadow-sm);
	}

	.nav-step {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-muted);
		background: var(--color-bg-tertiary);
		flex-shrink: 0;
	}

	.nav-step.active {
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

	.sidebar-footer {
		padding: var(--space-3);
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.footer-btn {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.footer-btn:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.footer-btn--danger:hover {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	/* ─── Mobile Bar ─── */
	.mobile-bar {
		flex-direction: column;
		background: var(--color-bg-secondary);
		border-bottom: 1px solid var(--color-border);
		position: relative;
	}

	.mobile-bar-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}

	.mobile-brand {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.mobile-logo {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
	}

	.mobile-logo--beta {
		position: relative;
	}

	.mobile-beta-tag {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0;
		font-size: 0.5rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-text-muted);
		line-height: 1;
	}

	.mobile-logo-type {
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-secondary);
	}

	.mobile-bar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* ─── Mobile Mode Toggle ─── */
	.mobile-mode-toggle {
		display: flex;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.mobile-mode-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 28px;
		border: none;
		background: none;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.mobile-mode-btn + .mobile-mode-btn {
		border-left: 1px solid var(--color-border);
	}

	.mobile-mode-btn.active {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.mobile-overflow-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.mobile-overflow-btn:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	/* ─── Mobile Tabs ─── */
	.mobile-tabs {
		display: flex;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		gap: 0;
		padding: 0 var(--space-2);
	}

	.mobile-tabs::-webkit-scrollbar {
		display: none;
	}

	.mobile-tab {
		flex-shrink: 0;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}

	.mobile-tab:hover {
		color: var(--color-text-secondary);
	}

	.mobile-tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
		font-weight: 600;
	}

	/* ─── Overflow Menu ─── */
	.mobile-overflow-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.mobile-overflow-menu {
		position: absolute;
		top: 44px;
		right: var(--space-3);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
		min-width: 160px;
		overflow: hidden;
	}

	.mobile-overflow-item {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		background: none;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.mobile-overflow-item:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.mobile-overflow-item--danger:hover {
		color: var(--color-error);
	}
</style>

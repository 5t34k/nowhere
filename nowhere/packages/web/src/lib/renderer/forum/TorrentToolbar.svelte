<script lang="ts">
	export type SizeFilter = { min: number | null; max: number | null };
	export type DateFilter = '' | 'today' | 'week' | 'month' | 'year';

	interface Props {
		search: string;
		sizeFilter: SizeFilter;
		dateFilter: DateFilter;
		authorFilters: string[];
		drillPath: string[];
		hasActiveFilters: boolean;
		onRemoveAuthorFilter: (pubkey: string) => void;
		onResetDrillPath: () => void;
		onDrillTo: (index: number) => void;
	}

	let {
		search = $bindable(''),
		sizeFilter = $bindable<SizeFilter>({ min: null, max: null }),
		dateFilter = $bindable<DateFilter>(''),
		authorFilters,
		drillPath,
		hasActiveFilters,
		onRemoveAuthorFilter,
		onResetDrillPath,
		onDrillTo
	}: Props = $props();

	const DATE_LABELS: Record<DateFilter, string> = {
		'': '', today: 'Today', week: 'This week', month: 'This month', year: 'This year'
	};

	// ── Size dropdown state ────────────────────────────────────────────────────
	let sizeOpen = $state(false);

	type Unit = 'MB' | 'GB';
	let minVal  = $state('');
	let minUnit = $state<Unit>('MB');
	let maxVal  = $state('');
	let maxUnit = $state<Unit>('MB');

	const UNIT_BYTES: Record<Unit, number> = { MB: 1024 ** 2, GB: 1024 ** 3 };

	// Sync back when sizeFilter is reset externally (e.g. chip dismiss)
	$effect(() => {
		if (sizeFilter.min === null) minVal = '';
		if (sizeFilter.max === null) maxVal = '';
	});

	function updateSizeFilter() {
		const minNum = parseFloat(minVal);
		const maxNum = parseFloat(maxVal);
		sizeFilter = {
			min: minVal.trim() !== '' && !isNaN(minNum) && minNum >= 0 ? minNum * UNIT_BYTES[minUnit] : null,
			max: maxVal.trim() !== '' && !isNaN(maxNum) && maxNum >= 0 ? maxNum * UNIT_BYTES[maxUnit] : null,
		};
	}

	function formatSizeVal(bytes: number): string {
		if (bytes >= 1024 ** 3) {
			const v = bytes / 1024 ** 3;
			return (Number.isInteger(v) ? v : v.toFixed(1)) + ' GB';
		}
		return Math.round(bytes / 1024 ** 2) + ' MB';
	}

	function sizeLabel(f: SizeFilter): string {
		if (f.min !== null && f.max !== null) return `${formatSizeVal(f.min)} – ${formatSizeVal(f.max)}`;
		if (f.min !== null) return `≥ ${formatSizeVal(f.min)}`;
		if (f.max !== null) return `≤ ${formatSizeVal(f.max)}`;
		return 'Size';
	}

	const sizeActive = $derived(sizeFilter.min !== null || sizeFilter.max !== null);

	// ── General helpers ────────────────────────────────────────────────────────
	function capitalise(s: string): string {
		return s ? s[0].toUpperCase() + s.slice(1) : s;
	}

	const showChips = $derived(hasActiveFilters || drillPath.length > 0);
</script>

{#if sizeOpen}
	<div class="size-backdrop" onclick={() => sizeOpen = false}></div>
{/if}

<div class="toolbar">
	<div class="toolbar-row">
		<div class="toolbar-search">
			<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
			<input
				type="search"
				placeholder="Search torrents…"
				bind:value={search}
			/>
			{#if search}
				<button class="search-clear" onclick={() => { search = ''; }} aria-label="Clear search">×</button>
			{/if}
		</div>
		<div class="filter-sep"></div>
		<div class="size-wrap">
			<button
				class="filter-select-btn"
				class:active={sizeActive}
				onclick={() => sizeOpen = !sizeOpen}
			>{sizeLabel(sizeFilter)} ▾</button>
			{#if sizeOpen}
				<div class="size-panel">
					<div class="size-row">
						<span class="size-label">Min</span>
						<input
							class="size-input"
							type="number"
							min="0"
							placeholder="—"
							value={minVal}
							oninput={(e) => { minVal = (e.currentTarget as HTMLInputElement).value; updateSizeFilter(); }}
						/>
						<select class="size-unit" value={minUnit} onchange={(e) => { minUnit = (e.currentTarget as HTMLSelectElement).value as Unit; updateSizeFilter(); }}>
							<option value="MB">MB</option>
							<option value="GB">GB</option>
						</select>
					</div>
					<div class="size-row">
						<span class="size-label">Max</span>
						<input
							class="size-input"
							type="number"
							min="0"
							placeholder="—"
							value={maxVal}
							oninput={(e) => { maxVal = (e.currentTarget as HTMLInputElement).value; updateSizeFilter(); }}
						/>
						<select class="size-unit" value={maxUnit} onchange={(e) => { maxUnit = (e.currentTarget as HTMLSelectElement).value as Unit; updateSizeFilter(); }}>
							<option value="MB">MB</option>
							<option value="GB">GB</option>
						</select>
					</div>
				</div>
			{/if}
		</div>
		<select class="filter-select" bind:value={dateFilter}>
			<option value="">Date</option>
			<option value="today">Today</option>
			<option value="week">This week</option>
			<option value="month">This month</option>
			<option value="year">This year</option>
		</select>
	</div>

	{#if showChips}
		<div class="chips-row">
			{#if drillPath.length > 0}
				<span class="filter-chip">
					Category: {drillPath.map(capitalise).join(' › ')}
					<button class="chip-dismiss" onclick={onResetDrillPath} aria-label="Clear category filter">×</button>
				</span>
			{/if}
			{#if sizeActive}
				<span class="filter-chip">
					{sizeLabel(sizeFilter)}
					<button class="chip-dismiss" onclick={() => { sizeFilter = { min: null, max: null }; }} aria-label="Clear size filter">×</button>
				</span>
			{/if}
			{#if dateFilter}
				<span class="filter-chip">
					{DATE_LABELS[dateFilter]}
					<button class="chip-dismiss" onclick={() => { dateFilter = ''; }} aria-label="Clear date filter">×</button>
				</span>
			{/if}
			{#each authorFilters as pubkey (pubkey)}
				<span class="filter-chip">
					@{pubkey.slice(0, 8)}
					<button class="chip-dismiss" onclick={() => onRemoveAuthorFilter(pubkey)} aria-label="Remove author filter">×</button>
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.size-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}

	.toolbar {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.toolbar-search {
		flex: 1 1 200px;
		position: relative;
		display: flex;
		align-items: center;
	}

	.toolbar-search input {
		width: 100%;
		padding: 5px 28px 5px 28px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: inherit;
		color: inherit;
		font-size: var(--text-sm);
		outline: none;
		font-family: inherit;
	}

	.toolbar-search input:focus {
		border-color: var(--fm-border-strong, var(--color-border));
	}

	.toolbar-search input::-webkit-search-cancel-button {
		display: none;
	}

	.search-icon {
		position: absolute;
		left: 8px;
		color: var(--color-text-muted);
		pointer-events: none;
		flex-shrink: 0;
	}

	.search-clear {
		position: absolute;
		right: 6px;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-muted);
		font-size: 16px;
		line-height: 1;
		padding: 0 2px;
	}

	.search-clear:hover { color: var(--color-text); }

	.filter-sep {
		width: 1px;
		height: 20px;
		background: var(--color-border);
		flex-shrink: 0;
	}

	/* ── Size dropdown ──────────────────────────────────────────────────────── */

	.size-wrap {
		position: relative;
	}

	.filter-select-btn {
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: inherit;
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		font-family: inherit;
		cursor: pointer;
		white-space: nowrap;
		outline: none;
	}

	.filter-select-btn:focus,
	.filter-select-btn:hover {
		border-color: var(--fm-border-strong, var(--color-border));
	}

	.filter-select-btn.active {
		color: var(--color-text);
		border-color: var(--fm-border-strong, var(--color-border));
	}

	.size-panel {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 11;
		background: var(--color-bg, #fff);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		box-shadow: var(--shadow-md);
		min-width: 180px;
	}

	.size-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.size-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		width: 24px;
		flex-shrink: 0;
	}

	.size-input {
		width: 64px;
		padding: 3px 6px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: inherit;
		color: inherit;
		font-size: var(--text-xs);
		font-family: inherit;
		outline: none;
	}

	.size-input:focus {
		border-color: var(--fm-border-strong, var(--color-border));
	}

	/* Hide number input spinners */
	.size-input::-webkit-outer-spin-button,
	.size-input::-webkit-inner-spin-button { -webkit-appearance: none; }
	.size-input[type=number] { -moz-appearance: textfield; }

	.size-unit {
		padding: 3px 4px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: inherit;
		color: inherit;
		font-size: var(--text-xs);
		font-family: inherit;
		cursor: pointer;
		outline: none;
	}

	.size-unit:focus {
		border-color: var(--fm-border-strong, var(--color-border));
	}

	/* ── Date select ────────────────────────────────────────────────────────── */

	.filter-select {
		padding: 4px 6px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: inherit;
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		font-family: inherit;
		cursor: pointer;
		outline: none;
	}

	.filter-select:focus {
		border-color: var(--fm-border-strong, var(--color-border));
	}

	/* ── Chips ──────────────────────────────────────────────────────────────── */

	.chips-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px 2px 8px;
		background: var(--color-bg-secondary, #f5f5f5);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.chip-dismiss {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 0;
		line-height: 1;
		font-size: 15px;
		display: flex;
		align-items: center;
	}

	.chip-dismiss:hover { color: var(--color-text); }
</style>

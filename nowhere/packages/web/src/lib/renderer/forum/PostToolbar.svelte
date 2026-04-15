<script lang="ts">
	export type DateFilter = '' | 'today' | 'week' | 'month' | 'year';
	export type TypeFilter = '' | 'text' | 'link' | 'image';
	export type SortMode  = 'newest' | 'oldest' | 'replies';

	interface Props {
		search:          string;
		dateFilter:      DateFilter;
		typeFilter:      TypeFilter;
		sortMode:        SortMode;
		topicLabel:      string;
		hasActiveFilters: boolean;
	}

	let {
		search = $bindable(''),
		dateFilter = $bindable<DateFilter>(''),
		typeFilter = $bindable<TypeFilter>(''),
		sortMode = $bindable<SortMode>('newest'),
		topicLabel,
		hasActiveFilters
	}: Props = $props();

	const DATE_LABELS: Record<DateFilter, string> = {
		'': '', today: 'Today', week: 'This week', month: 'This month', year: 'This year'
	};

	const TYPE_LABELS: Record<Exclude<TypeFilter, ''>, string> = {
		text: 'Text posts', link: 'Link posts', image: 'Image posts'
	};

	const placeholder = $derived(topicLabel ? `Search in ${topicLabel}…` : 'Search posts…');
</script>

<div class="toolbar">
	<div class="toolbar-row">
		<div class="toolbar-search">
			<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
			<input
				type="search"
				{placeholder}
				bind:value={search}
			/>
			{#if search}
				<button class="search-clear" onclick={() => { search = ''; }} aria-label="Clear search">×</button>
			{/if}
		</div>
		<div class="filter-sep"></div>
		<div class="type-group">
			{#each (['', 'text', 'link', 'image'] as const) as t}
				<button
					class="filter-btn"
					class:active={typeFilter === t}
					onclick={() => { typeFilter = typeFilter === t ? '' : t; }}
				>{t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}</button>
			{/each}
		</div>
		<div class="filter-sep"></div>
		<select class="filter-select" bind:value={sortMode}>
			<option value="newest">Newest</option>
			<option value="oldest">Oldest</option>
			<option value="replies">Most replies</option>
		</select>
		<select class="filter-select" bind:value={dateFilter}>
			<option value="">Date</option>
			<option value="today">Today</option>
			<option value="week">This week</option>
			<option value="month">This month</option>
			<option value="year">This year</option>
		</select>
	</div>

	{#if hasActiveFilters}
		<div class="chips-row">
			{#if typeFilter}
				<span class="filter-chip">
					{TYPE_LABELS[typeFilter]}
					<button class="chip-dismiss" onclick={() => { typeFilter = ''; }} aria-label="Clear type filter">×</button>
				</span>
			{/if}
			{#if dateFilter}
				<span class="filter-chip">
					{DATE_LABELS[dateFilter]}
					<button class="chip-dismiss" onclick={() => { dateFilter = ''; }} aria-label="Clear date filter">×</button>
				</span>
			{/if}
		</div>
	{/if}
</div>

<style>
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
		flex: 1 1 180px;
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

	.type-group {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}

	.filter-btn {
		padding: 3px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		background: none;
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		font-family: inherit;
		cursor: pointer;
		white-space: nowrap;
		outline: none;
	}

	.filter-btn:hover {
		border-color: var(--fm-border-strong, var(--color-border));
		color: var(--color-text);
	}

	.filter-btn.active {
		background: var(--fm-btn-bg, var(--color-primary, #333));
		color: var(--fm-btn-text, #fff);
		border-color: var(--fm-btn-bg, var(--color-primary, #333));
	}

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

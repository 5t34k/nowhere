<script lang="ts">
	import type { DecryptedTorrent, TorrentData } from '$lib/renderer/nostr/forum-events.js';
	import { buildMagnetLink } from '$lib/renderer/nostr/forum-events.js';
	import AuthorIdentity from './AuthorIdentity.svelte';
	import TorrentSubmitForm from './TorrentSubmitForm.svelte';
	import TorrentToolbar from './TorrentToolbar.svelte';
	import type { SizeFilter, DateFilter } from './TorrentToolbar.svelte';

	interface Props {
		torrents: DecryptedTorrent[];
		topCategories: string[];
		canSubmit: boolean;
		wotBlocked?: boolean;
		loading: boolean;
		onSelectTorrent: (t: DecryptedTorrent) => void;
		onSignIn?: () => void;
		privacyMode: number;
		profileRelays?: string[];
		// Submit form
		categoriesFixed?: boolean;
		publishing?: boolean;
		rules?: string;
		onSubmitTorrent: (data: TorrentData) => void;
		drillPath?: string[];
	}

	let {
		torrents, topCategories, canSubmit, wotBlocked = false, loading,
		onSelectTorrent, onSignIn, privacyMode, profileRelays,
		categoriesFixed = false, publishing = false, rules = '', onSubmitTorrent,
		drillPath = $bindable<string[]>([])
	}: Props = $props();

	let showSubmitForm = $state(false);
	let magnetCopied = $state('');
	let collapsedGroups = $state<Set<string>>(new Set());
	let toolbarExpanded = $state(false);

	type SortCol = 'category' | 'name' | 'date' | 'size' | 'from';
	let sortCol = $state<SortCol>('date');
	let sortDir = $state<'asc' | 'desc'>('desc');

	// ─── Filter / search state ───────────────────────────────────────────────
	let searchQuery   = $state('');
	let sizeFilter    = $state<SizeFilter>({ min: null, max: null });
	let dateFilter    = $state<DateFilter>('');
	let authorFilters = $state<string[]>([]);

	// ─── Helpers ─────────────────────────────────────────────────────────────

	function rootCategory(category: string): string {
		return category.split('>')[0].trim().toLowerCase();
	}

	function capitalise(s: string): string {
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
	}

	function displayCategory(category: string): string {
		return category.split('>').map(s => capitalise(s.trim())).join(' › ');
	}

	function totalSize(t: DecryptedTorrent): number {
		return t.torrentData.files.reduce((s, f) => s + f.size, 0);
	}

	function formatSize(bytes: number): string {
		if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GiB';
		if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + ' MiB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KiB';
		return bytes + ' B';
	}

	function formatDate(ts: number): string {
		if (!ts) return '—';
		const d = new Date(ts * 1000);
		return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
	}

	// Filter predicates
	function passesSizeFilter(t: DecryptedTorrent, f: SizeFilter): boolean {
		const b = totalSize(t);
		if (f.min !== null && b < f.min) return false;
		if (f.max !== null && b > f.max) return false;
		return true;
	}

	function passesDateFilter(t: DecryptedTorrent, f: DateFilter): boolean {
		if (!f) return true;
		const ms: Record<string, number> = { today: 864e5, week: 7*864e5, month: 30*864e5, year: 365*864e5 };
		return (Date.now() - t.innerTimestamp * 1000) <= ms[f];
	}

	// Drill-down helpers
	function catSegments(category: string): string[] {
		return category.toLowerCase().split('>').map(s => s.trim());
	}

	function categoryMatchesDrill(category: string, path: string[]): boolean {
		if (!path.length) return true;
		const segs = catSegments(category);
		return path.every((p, i) => segs[i] === p);
	}

	function segmentAtDepth(category: string, depth: number): string {
		return catSegments(category)[depth] ?? '';
	}

	// Author filter
	function addAuthorFilter(pubkey: string) {
		if (!authorFilters.includes(pubkey)) authorFilters = [...authorFilters, pubkey];
	}

	function removeAuthorFilter(pubkey: string) {
		authorFilters = authorFilters.filter(p => p !== pubkey);
	}

	// Drill navigation
	function drillInto(segment: string) {
		drillPath = [...drillPath, segment.toLowerCase()];
		collapsedGroups = new Set();
	}

	function drillTo(index: number) {
		drillPath = index < 0 ? [] : drillPath.slice(0, index + 1);
		collapsedGroups = new Set();
	}

	function clearAllFilters() {
		sizeFilter = { min: null, max: null }; dateFilter = ''; authorFilters = []; drillPath = []; searchQuery = '';
	}

	// Sort
	function toggleSort(col: SortCol) {
		if (sortCol === col) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortCol = col;
			sortDir = (col === 'date' || col === 'size') ? 'desc' : 'asc';
		}
	}

	function sortIndicator(col: SortCol): string {
		return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
	}

	function sortedItems(items: DecryptedTorrent[]): DecryptedTorrent[] {
		return [...items].sort((a, b) => {
			let cmp = 0;
			if (sortCol === 'category') cmp = (a.torrentData.category || '').localeCompare(b.torrentData.category || '');
			else if (sortCol === 'name') cmp = a.torrentData.title.localeCompare(b.torrentData.title);
			else if (sortCol === 'date') cmp = a.innerTimestamp - b.innerTimestamp;
			else if (sortCol === 'size') cmp = totalSize(a) - totalSize(b);
			else if (sortCol === 'from') cmp = a.authorPubkey.localeCompare(b.authorPubkey);
			return sortDir === 'asc' ? cmp : -cmp;
		});
	}

	// Magnet copy
	async function copyMagnet(e: MouseEvent, t: DecryptedTorrent) {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(buildMagnetLink(t.torrentData));
			magnetCopied = t.eventId;
			setTimeout(() => { if (magnetCopied === t.eventId) magnetCopied = ''; }, 2000);
		} catch { /* clipboard unavailable */ }
	}

	// Collapsible groups
	function toggleGroup(key: string) {
		const next = new Set(collapsedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedGroups = next;
	}

	// ─── Derived values ───────────────────────────────────────────────────────

	const isSearchMode = $derived(searchQuery.trim().length > 0);

	const filteredTorrents = $derived.by(() =>
		torrents.filter(t =>
			passesSizeFilter(t, sizeFilter) &&
			passesDateFilter(t, dateFilter) &&
			(authorFilters.length === 0 || authorFilters.includes(t.authorPubkey))
		)
	);

	const scopedTorrents = $derived.by(() =>
		drillPath.length === 0
			? filteredTorrents
			: filteredTorrents.filter(t => categoryMatchesDrill(t.torrentData.category?.trim() || '', drillPath))
	);

	const searchResults = $derived.by(() => {
		if (!isSearchMode) return [];
		const q = searchQuery.trim().toLowerCase();
		return scopedTorrents.filter(t =>
			t.torrentData.title.toLowerCase().includes(q) ||
			(t.torrentData.description || '').toLowerCase().includes(q) ||
			(t.torrentData.category || '').toLowerCase().includes(q)
		);
	});

	const hasActiveFilters = $derived(sizeFilter.min !== null || sizeFilter.max !== null || !!dateFilter || authorFilters.length > 0);

	const groups = $derived.by(() => {
		const depth = drillPath.length;
		const groupMap = new Map<string, DecryptedTorrent[]>();
		const groupOrder: string[] = [];
		const definedRoots = topCategories.map(c => c.toLowerCase());

		for (const t of [...scopedTorrents].sort((a, b) => b.innerTimestamp - a.innerTimestamp)) {
			const cat = t.torrentData.category?.trim() || '';
			const key = cat ? segmentAtDepth(cat, depth) : '';
			if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key); }
			groupMap.get(key)!.push(t);
		}

		const sorted: string[] = depth === 0
			? [...definedRoots.filter(r => groupMap.has(r)),
			   ...groupOrder.filter(r => r && !definedRoots.includes(r)),
			   ...(groupMap.has('') ? [''] : [])]
			: [...groupOrder.filter(r => r).sort(), ...(groupMap.has('') ? [''] : [])];

		return sorted.map(key => {
			const items = groupMap.get(key)!;
			const hasChildren = items.some(t => {
				const segs = catSegments(t.torrentData.category?.trim() || '');
				return segs.length > depth + 1 && segs[depth] === key;
			});
			// At root depth, unlabelled torrents are 'Other'.
			// When drilled in, torrents that end exactly at the current level
			// belong to that level — label them with the current level's name.
			const label = key
				? capitalise(key)
				: depth > 0
					? capitalise(drillPath[depth - 1])
					: 'Other';
			return { key, label, items, hasChildren };
		});
	});
</script>

<div class="torrent-list">
	<div class="post-list-actions">
		{#if canSubmit && !wotBlocked}
			<button class="new-post-btn" onclick={() => (showSubmitForm = !showSubmitForm)}>
				{showSubmitForm ? 'Cancel' : '+ New Torrent'}
			</button>
		{:else if wotBlocked}
			<div class="wot-tooltip-wrapper" data-tooltip="Your account is not in the trust network for submitting torrents">
				<button class="new-post-btn" disabled>+ New Torrent</button>
			</div>
		{:else if onSignIn}
			<button class="new-post-btn sign-in-btn" onclick={onSignIn}>Sign in to submit</button>
		{/if}
		{#if torrents.length > 0}
			<button
				class="search-toggle-btn"
				class:active={toolbarExpanded || hasActiveFilters || !!searchQuery}
				onclick={() => { toolbarExpanded = !toolbarExpanded; }}
				aria-label="Search and filter"
				title="Search and filter"
			><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
		{/if}
	</div>

	{#if showSubmitForm}
		<TorrentSubmitForm
			{topCategories}
			{categoriesFixed}
			existingTorrents={torrents}
			onSubmit={(data) => { onSubmitTorrent(data); showSubmitForm = false; }}
			onCancel={() => { showSubmitForm = false; }}
			{publishing}
			{rules}
		/>
	{/if}

	{#if torrents.length > 0 && toolbarExpanded}
		<TorrentToolbar
			bind:search={searchQuery}
			bind:sizeFilter={sizeFilter}
			bind:dateFilter={dateFilter}
			authorFilters={authorFilters}
			drillPath={drillPath}
			hasActiveFilters={hasActiveFilters}
			onRemoveAuthorFilter={removeAuthorFilter}
			onResetDrillPath={() => drillTo(-1)}
			onDrillTo={drillTo}
		/>
	{/if}

	{#if loading && torrents.length === 0}
		<div class="torrent-loading">Loading…</div>
	{:else if torrents.length === 0}
		<div class="torrent-empty">No torrents yet.</div>
	{:else}
		{#if drillPath.length > 0 && !isSearchMode}
			<nav class="drill-breadcrumb">
				<button class="bc-seg" onclick={() => drillTo(-1)}>All</button>
				{#each drillPath as seg, i}
					<span class="bc-arrow">›</span>
					{#if i < drillPath.length - 1}
						<button class="bc-seg" onclick={() => drillTo(i)}>{capitalise(seg)}</button>
					{:else}
						<span class="bc-seg bc-seg--current">{capitalise(seg)}</span>
					{/if}
				{/each}
			</nav>
		{/if}

		{#if isSearchMode}
			{#if searchResults.length === 0}
				<div class="torrent-empty">
					No results for "<strong>{searchQuery.trim()}</strong>".{#if hasActiveFilters || drillPath.length > 0} <button class="torrent-empty-clear" onclick={clearAllFilters}>Clear filters</button>{/if}
				</div>
			{:else}
				<p class="torrent-search-summary">
					{searchResults.length} result{searchResults.length === 1 ? '' : 's'}{#if drillPath.length > 0} in <strong>{drillPath.map(capitalise).join(' › ')}</strong>{/if}
				</p>
				<div class="torrent-table-scroll">
					<table class="torrent-table">
						<thead>
							<tr>
								<th class="col-category col-sortable" onclick={() => toggleSort('category')}>Category{sortIndicator('category')}</th>
								<th class="col-name col-sortable" onclick={() => toggleSort('name')}>Name{sortIndicator('name')}</th>
								<th class="col-date col-sortable" onclick={() => toggleSort('date')}>Uploaded{sortIndicator('date')}</th>
								<th class="col-magnet"></th>
								<th class="col-size col-sortable" onclick={() => toggleSort('size')}>Size{sortIndicator('size')}</th>
								<th class="col-from col-sortable" onclick={() => toggleSort('from')}>From</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedItems(searchResults) as t (t.eventId)}
								<tr class="torrent-row" onclick={() => onSelectTorrent(t)}>
									<td class="col-category">
										<span class="torrent-category">{displayCategory(t.torrentData.category)}</span>
									</td>
									<td class="col-name">{t.torrentData.title}</td>
									<td class="col-date">{formatDate(t.innerTimestamp)}</td>
									<td class="col-magnet">
										<button
											class="magnet-btn"
											class:copied={magnetCopied === t.eventId}
											title={magnetCopied === t.eventId ? 'Copied!' : 'Copy magnet link'}
											onclick={(e) => copyMagnet(e, t)}
										><svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 22 16" fill="currentColor"><path d="M8 0A8 8 0 0 0 8 16L8 11A3 3 0 0 1 8 5Z"/><rect x="8" y="0" width="8" height="5"/><rect x="18" y="0" width="4" height="5"/><rect x="8" y="11" width="8" height="5"/><rect x="18" y="11" width="4" height="5"/></svg></button>
									</td>
									<td class="col-size">{formatSize(totalSize(t))}</td>
									<td class="col-from" onclick={(e) => { e.stopPropagation(); addAuthorFilter(t.authorPubkey); }} title="Filter by this author">
										<AuthorIdentity
											pubkey={t.authorPubkey}
											{privacyMode}
											size={24}
											showPhrase={false}
											showNpub={false}
											{profileRelays}
										/>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else}
			{#if groups.length === 0}
				<div class="torrent-empty">
					No torrents match.
					{#if hasActiveFilters || drillPath.length > 0}
						<button class="torrent-empty-clear" onclick={clearAllFilters}>Clear filters</button>
					{/if}
				</div>
			{/if}
			{#each groups as group (group.key)}
				<div class="torrent-group">
					<div class="torrent-group-header">
						<button
							class="torrent-group-collapse"
							onclick={() => toggleGroup(group.key)}
							aria-expanded={!collapsedGroups.has(group.key)}
						>{collapsedGroups.has(group.key) ? '+' : '−'}</button>
						{#if group.hasChildren}
							<button class="torrent-group-drill" onclick={() => drillInto(group.key)}>
								<span class="torrent-group-label">{group.label}</span>
								<span class="torrent-group-count">{group.items.length}</span>
								<span class="torrent-group-drill-icon">›</span>
							</button>
						{:else}
							<span class="torrent-group-label">{group.label}</span>
							<span class="torrent-group-count">{group.items.length}</span>
						{/if}
					</div>

					{#if !collapsedGroups.has(group.key)}
						<div class="torrent-table-scroll">
							<table class="torrent-table">
								<thead>
									<tr>
										<th class="col-category col-sortable" onclick={() => toggleSort('category')}>Category{sortIndicator('category')}</th>
										<th class="col-name col-sortable" onclick={() => toggleSort('name')}>Name{sortIndicator('name')}</th>
										<th class="col-date col-sortable" onclick={() => toggleSort('date')}>Uploaded{sortIndicator('date')}</th>
										<th class="col-magnet"></th>
										<th class="col-size col-sortable" onclick={() => toggleSort('size')}>Size{sortIndicator('size')}</th>
										<th class="col-from col-sortable" onclick={() => toggleSort('from')}>From</th>
									</tr>
								</thead>
								<tbody>
									{#each sortedItems(group.items) as t (t.eventId)}
										<tr class="torrent-row" onclick={() => onSelectTorrent(t)}>
											<td class="col-category">
												<span class="torrent-category">{displayCategory(t.torrentData.category)}</span>
											</td>
											<td class="col-name">{t.torrentData.title}</td>
											<td class="col-date">{formatDate(t.innerTimestamp)}</td>
											<td class="col-magnet">
												<button
													class="magnet-btn"
													class:copied={magnetCopied === t.eventId}
													title={magnetCopied === t.eventId ? 'Copied!' : 'Copy magnet link'}
													onclick={(e) => copyMagnet(e, t)}
												><svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 22 16" fill="currentColor"><path d="M8 0A8 8 0 0 0 8 16L8 11A3 3 0 0 1 8 5Z"/><rect x="8" y="0" width="8" height="5"/><rect x="18" y="0" width="4" height="5"/><rect x="8" y="11" width="8" height="5"/><rect x="18" y="11" width="4" height="5"/></svg></button>
											</td>
											<td class="col-size">{formatSize(totalSize(t))}</td>
											<td class="col-from" onclick={(e) => { e.stopPropagation(); addAuthorFilter(t.authorPubkey); }} title="Filter by this author">
												<AuthorIdentity
													pubkey={t.authorPubkey}
													{privacyMode}
													size={24}
													showPhrase={false}
													showNpub={false}
													{profileRelays}
												/>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	{/if}
</div>

<style>
	.torrent-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-bottom: var(--space-4);
		min-width: 0;
		overflow: hidden;
	}

	.torrent-table-scroll {
		overflow-x: auto;
		overflow-y: auto;
		max-height: 480px;
		-webkit-overflow-scrolling: touch;
	}

	.torrent-loading,
	.torrent-empty {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		padding: var(--space-4) 0;
	}

	.torrent-empty-clear {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-primary);
		font-size: var(--text-sm);
		text-decoration: underline;
		padding: 0;
		margin-left: var(--space-2);
		font-family: inherit;
	}

	.torrent-search-summary {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
		padding: var(--space-1) 0;
	}

	/* ── Breadcrumb ─────────────────────────────────────────────────────────── */

	.drill-breadcrumb {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		flex-wrap: wrap;
	}

	.bc-seg {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		padding: 0;
		text-decoration: underline;
		font-family: inherit;
	}

	.bc-seg:hover { color: var(--color-text); }

	.bc-seg--current {
		color: var(--color-text);
		font-weight: 600;
		text-decoration: none;
		cursor: default;
	}

	.bc-arrow { color: var(--color-text-muted); }

	/* ── Group ──────────────────────────────────────────────────────────────── */

	.torrent-group {
		display: flex;
		flex-direction: column;
	}

	.torrent-group-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-2) 0;
	}

	.torrent-group-drill {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		padding: 0;
		flex: 1;
		min-width: 0;
		color: inherit;
		font-family: inherit;
	}

	.torrent-group-drill:hover .torrent-group-label {
		text-decoration: underline;
	}

	.torrent-group-drill-icon {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.torrent-group-label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.torrent-group-count {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.torrent-group-collapse {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0 var(--space-1) 0 0;
		color: var(--color-text-muted);
		flex-shrink: 0;
		font-size: var(--text-sm);
		line-height: 1;
	}

	.torrent-group-collapse:hover { color: var(--color-text); }

	/* ── Table ──────────────────────────────────────────────────────────────── */

	.torrent-table {
		width: 100%;
		min-width: 620px;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.torrent-table thead th {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-muted);
		text-align: left;
		padding: var(--space-2) var(--space-2) var(--space-1);
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
		background: var(--color-bg, #fff);
		z-index: 1;
	}

	.col-sortable {
		cursor: pointer;
		user-select: none;
	}

	.col-sortable:hover {
		color: var(--color-text);
	}

	.torrent-row {
		cursor: pointer;
	}

	.torrent-row:hover td {
		background: var(--color-hover, rgba(0,0,0,0.03));
	}

	.torrent-row td {
		padding: var(--space-1) var(--space-2);
		vertical-align: middle;
		border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
	}

	.col-category {
		width: 150px;
	}

	.torrent-category {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: normal;
		overflow-wrap: break-word;
	}

	.col-name {
		min-width: 240px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-date {
		width: 90px;
		white-space: nowrap;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.col-magnet {
		width: 32px;
		text-align: center;
	}

	.magnet-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.1rem;
		color: var(--color-text-muted);
		padding: 0 var(--space-1);
		line-height: 1;
		transition: color 0.15s;
	}

	.magnet-btn:hover,
	.magnet-btn.copied {
		color: var(--color-primary);
	}

	.col-size {
		width: 72px;
		white-space: nowrap;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.col-from {
		width: 36px;
		cursor: pointer;
	}
</style>

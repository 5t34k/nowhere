<script lang="ts">
	import type { TorrentData, DecryptedTorrent } from '$lib/renderer/nostr/forum-events.js';
	import { parseTorrentFile } from '$lib/renderer/nostr/torrent-bencode.js';
	import type { ParsedTorrent } from '$lib/renderer/nostr/torrent-bencode.js';

	interface Props {
		topCategories: string[];   // creator-defined root categories from q tag
		categoriesFixed: boolean;  // F tag — when true, submitters cannot create new root categories
		existingTorrents: DecryptedTorrent[];
		onSubmit: (data: TorrentData) => void;
		onCancel: () => void;
		publishing: boolean;
		rules?: string;
	}

	let {
		topCategories, categoriesFixed, existingTorrents,
		onSubmit, onCancel, publishing, rules = ''
	}: Props = $props();

	const MAX_CATEGORY_LENGTH = 24;

	// ─── Parsed torrent state ───
	let parsed = $state<ParsedTorrent | null>(null);
	let parseError = $state('');
	let editableTitle = $state('');
	let editableTrackers = $state('');
	let duplicateError = $state('');

	// ─── Manual fields ───
	let description = $state('');
	let refs = $state('');  // one per line

	// ─── Category picker state ───
	// selectedPath is an array of lowercase segments, e.g. ['video', 'movies', '4k']
	let selectedPath = $state<string[]>([]);
	let pickerLevel = $state<number | null>(null); // which level is currently open (null = none)
	let newNodeInput = $state('');
	let showNewNodeWarning = $state(false);
	let pendingNewNode = $state('');

	// ─── Derive available choices at each level ───

	function capitalize(s: string): string {
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
	}

	function displayPath(path: string[]): string {
		return path.map(capitalize).join(' › ');
	}

	// Build the set of existing category paths at a given level given a parent path
	function childrenAt(parentPath: string[]): string[] {
		const depth = parentPath.length;
		const seen = new Set<string>();
		for (const t of existingTorrents) {
			const cat = t.torrentData.category?.toLowerCase() || '';
			if (!cat) continue;
			const segments = cat.split('>').map(s => s.trim());
			if (segments.length <= depth) continue;
			// Check prefix matches
			let match = true;
			for (let i = 0; i < depth; i++) {
				if (segments[i] !== parentPath[i]) { match = false; break; }
			}
			if (match) seen.add(segments[depth]);
		}
		return Array.from(seen).sort();
	}

	// Level 0 choices
	const rootChoices = $derived.by(() => {
		const defined = topCategories.map(c => c.toLowerCase());
		if (categoriesFixed) return defined;
		// Merge with roots seen in existing torrents
		const fromTorrents = childrenAt([]);
		const all = new Set([...defined, ...fromTorrents]);
		return Array.from(all).sort((a, b) => {
			const ia = defined.indexOf(a);
			const ib = defined.indexOf(b);
			if (ia !== -1 && ib !== -1) return ia - ib;
			if (ia !== -1) return -1;
			if (ib !== -1) return 1;
			return a.localeCompare(b);
		});
	});

	function choicesAtLevel(level: number): string[] {
		if (level === 0) return rootChoices;
		return childrenAt(selectedPath.slice(0, level));
	}

	function selectSegment(level: number, value: string) {
		const next = [...selectedPath.slice(0, level), value];
		selectedPath = next;
		pickerLevel = null;
		newNodeInput = '';
		showNewNodeWarning = false;
	}

	function openLevel(level: number) {
		pickerLevel = level;
		newNodeInput = '';
		showNewNodeWarning = false;
		pendingNewNode = '';
	}

	function addNewNode(level: number) {
		const raw = newNodeInput.trim().toLowerCase().slice(0, MAX_CATEGORY_LENGTH);
		if (!raw) return;
		// Check for near-duplicates
		const existing = choicesAtLevel(level);
		if (existing.includes(raw)) {
			// Already exists — just select it
			selectSegment(level, raw);
			return;
		}
		// Warn before creating
		pendingNewNode = raw;
		showNewNodeWarning = true;
	}

	function confirmNewNode(level: number) {
		selectSegment(level, pendingNewNode);
		showNewNodeWarning = false;
		pendingNewNode = '';
	}

	// Final category string
	const categoryString = $derived(selectedPath.join(' > '));

	// ─── Duplicate check ───
	const duplicateByHash = $derived(
		parsed ? existingTorrents.find(t => t.torrentData.x === parsed!.infohash) ?? null : null
	);
	const duplicateByTitle = $derived(
		parsed && !duplicateByHash
			? existingTorrents.find(t => t.torrentData.title.trim().toLowerCase() === editableTitle.trim().toLowerCase()) ?? null
			: null
	);
	const duplicate = $derived(duplicateByHash ?? duplicateByTitle);

	// ─── Rules acknowledgement ───
	let rulesAcknowledged = $state(false);

	// ─── File input ───
	async function handleFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		parseError = '';
		duplicateError = '';
		parsed = null;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const result = await parseTorrentFile(bytes);
			parsed = result;
			editableTitle = result.title;
			editableTrackers = result.trackers.join('\n');
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Failed to parse .torrent file';
		}
		// Reset file input so the same file can be re-selected if needed
		input.value = '';
	}

	// ─── Submit ───
	const canSubmit = $derived(
		!!parsed &&
		editableTitle.trim().length > 0 &&
		selectedPath.length > 0 &&
		!publishing &&
		!duplicate
	);

	function handleSubmit() {
		if (!parsed || !canSubmit) return;

		const trackerList = editableTrackers
			.split('\n')
			.map(t => t.trim())
			.filter(Boolean);

		const refList = refs
			.split('\n')
			.map(r => r.trim())
			.filter(Boolean);

		const data: TorrentData = {
			x: parsed.infohash,
			title: editableTitle.trim(),
			files: parsed.files,
			trackers: trackerList,
			category: categoryString,
			refs: refList
		};
		if (description.trim()) data.description = description.trim();

		onSubmit(data);
	}
</script>

<div class="torrent-submit-form">
	<div class="form-header">
		<h3>Submit Torrent</h3>
		<button class="new-post-btn sign-in-btn" onclick={onCancel} disabled={publishing}>Cancel</button>
	</div>

	{#if rules}
		<div class="torrent-rules">
			<strong>Rules</strong>
			<p>{rules}</p>
			<label class="rules-ack">
				<input type="checkbox" bind:checked={rulesAcknowledged} />
				I have read and agree to the forum rules
			</label>
		</div>
	{/if}

	<!-- Step 1: Upload .torrent file -->
	<section class="form-section">
		<label class="section-label" for="torrent-file">
			.torrent file <span class="required">*</span>
		</label>
		<p class="section-hint">
			Upload a .torrent file. Infohash, title, file list, and trackers are extracted automatically.
			The file itself is never uploaded or stored anywhere.
		</p>
		<input
			id="torrent-file"
			type="file"
			accept=".torrent"
			onchange={handleFile}
			disabled={publishing || (!!rules && !rulesAcknowledged)}
		/>
		{#if parseError}
			<p class="error-msg">{parseError}</p>
		{/if}
	</section>

	{#if parsed}
		{#if duplicate}
			<p class="duplicate-msg">
				{#if duplicateByHash}
					This torrent has already been submitted (matching infohash: <strong>{duplicate.torrentData.title}</strong>).
				{:else}
					A torrent with this title already exists: <strong>{duplicate.torrentData.title}</strong>. Please check before submitting.
				{/if}
			</p>
		{/if}

		<!-- Auto-filled fields -->
		<section class="form-section">
			<div class="field-row">
				<label for="torrent-hash" class="field-label">Infohash</label>
				<input id="torrent-hash" type="text" value={parsed.infohash} readonly class="readonly-field" />
			</div>

			<div class="field-row">
				<label for="torrent-title" class="field-label">Title <span class="required">*</span></label>
				<input
					id="torrent-title"
					type="text"
					bind:value={editableTitle}
					disabled={publishing}
					placeholder="Torrent title"
				/>
			</div>

			<div class="field-row">
				<label class="field-label">
					Files
					<span class="field-count">{parsed.files.length}</span>
				</label>
				<div class="file-preview">
					{#each parsed.files as f}
						<div class="file-preview-row">
							<span class="file-preview-path">{f.path}</span>
							<span class="file-preview-size">{
								f.size >= 1073741824 ? (f.size / 1073741824).toFixed(1) + ' GiB' :
								f.size >= 1048576 ? (f.size / 1048576).toFixed(0) + ' MiB' :
								f.size >= 1024 ? (f.size / 1024).toFixed(0) + ' KiB' :
								f.size + ' B'
							}</span>
						</div>
					{/each}
				</div>
			</div>

			<div class="field-row">
				<label for="torrent-trackers" class="field-label">Trackers</label>
				<textarea
					id="torrent-trackers"
					bind:value={editableTrackers}
					rows="4"
					disabled={publishing}
					placeholder="One tracker URL per line"
				></textarea>
			</div>
		</section>

		<!-- Manual fields -->
		<section class="form-section">
			<!-- Category picker -->
			<div class="field-row">
				<label class="field-label">Category <span class="required">*</span></label>

				{#if selectedPath.length > 0}
					<div class="category-breadcrumb">
						{#each selectedPath as segment, i}
							<button class="breadcrumb-segment" onclick={() => openLevel(i)}>
								{capitalize(segment)}
							</button>
							{#if i < selectedPath.length - 1}
								<span class="breadcrumb-sep">›</span>
							{/if}
						{/each}
						<button class="breadcrumb-add" onclick={() => openLevel(selectedPath.length)}>+ sub</button>
					</div>
				{/if}

				{#if pickerLevel !== null}
					<div class="category-picker">
						<p class="picker-prompt">
							{pickerLevel === 0 ? 'Select a category:' : `Select subcategory under "${displayPath(selectedPath.slice(0, pickerLevel))}":` }
						</p>

						<div class="picker-choices">
							{#each choicesAtLevel(pickerLevel) as choice}
								<button
									class="picker-choice"
									class:selected={selectedPath[pickerLevel] === choice}
									onclick={() => selectSegment(pickerLevel!, choice)}
								>
									{capitalize(choice)}
								</button>
							{/each}

							<button class="picker-choice picker-other" onclick={() => selectSegment(pickerLevel!, 'other')}>
								Other
							</button>

							{#if pickerLevel === 0 && !categoriesFixed || pickerLevel! > 0}
								<div class="picker-new">
									<input
										type="text"
										bind:value={newNodeInput}
										placeholder={pickerLevel === 0 ? 'New category…' : 'New subcategory…'}
										maxlength={MAX_CATEGORY_LENGTH}
										onkeydown={(e) => { if (e.key === 'Enter') addNewNode(pickerLevel!); }}
									/>
									<button onclick={() => addNewNode(pickerLevel!)}>Add</button>
								</div>
							{/if}

							{#if showNewNodeWarning}
								<div class="picker-warning">
									<p>Are you sure no existing category fits? Creating "<strong>{pendingNewNode}</strong>" — check for duplicates first.</p>
									<div class="picker-warning-btns">
										<button class="warning-confirm" onclick={() => confirmNewNode(pickerLevel!)}>Yes, create it</button>
										<button class="warning-cancel" onclick={() => { showNewNodeWarning = false; pendingNewNode = ''; }}>Go back</button>
									</div>
								</div>
							{/if}
						</div>

						{#if selectedPath.length > pickerLevel}
							<button class="picker-close" onclick={() => { pickerLevel = null; }}>Done</button>
						{/if}
					</div>
				{:else if selectedPath.length === 0}
					<button class="pick-category-btn" onclick={() => openLevel(0)}>Choose category…</button>
				{/if}
			</div>

			<div class="field-row">
				<label for="torrent-desc" class="field-label">Description <span class="optional">(optional)</span></label>
				<textarea
					id="torrent-desc"
					bind:value={description}
					rows="3"
					disabled={publishing}
					placeholder="What is this torrent? Quality notes, source info…"
				></textarea>
			</div>

			<div class="field-row">
				<label for="torrent-refs" class="field-label">
					DB References <span class="optional">(optional)</span>
				</label>
				<p class="section-hint small">One per line.</p>
				<textarea
					id="torrent-refs"
					bind:value={refs}
					rows="2"
					disabled={publishing}
				></textarea>
			</div>
		</section>

		<div class="form-actions">
			<button class="new-post-btn" onclick={handleSubmit} disabled={!canSubmit}>
				{publishing ? 'Publishing…' : 'Submit Torrent'}
			</button>
			<button class="new-post-btn sign-in-btn" onclick={onCancel} disabled={publishing}>Cancel</button>
		</div>
	{/if}
</div>

<style>
	.torrent-submit-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-4) 0;
		border-top: 1px solid var(--color-border);
	}

	.form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.form-header h3 {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.torrent-rules {
		padding: var(--space-3);
		background: var(--color-surface-2, var(--color-hover));
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.torrent-rules strong {
		display: block;
		margin-bottom: var(--space-1);
	}

	.torrent-rules p {
		margin: 0;
		white-space: pre-wrap;
		color: var(--color-text-secondary);
	}

	.rules-ack {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		font-size: var(--text-sm);
		cursor: pointer;
		color: var(--color-text);
	}

	.rules-ack input[type="checkbox"] {
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		cursor: pointer;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: 3px;
	}

	.form-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--color-border);
	}

	.section-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.section-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.section-hint.small {
		font-size: var(--text-xs);
	}

	.required {
		color: var(--color-error, #e53e3e);
	}

	.optional {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.error-msg {
		font-size: var(--text-sm);
		color: var(--color-error, #e53e3e);
		margin: 0;
	}

	.duplicate-msg {
		font-size: var(--text-sm);
		color: var(--color-error, #e53e3e);
		background: color-mix(in srgb, var(--color-error, #e53e3e) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-error, #e53e3e) 25%, transparent);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		margin: 0;
	}

	.field-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.field-count {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		margin-left: 4px;
	}

	input[type="text"],
	input[type="file"],
	textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		resize: vertical;
		background: inherit;
		color: inherit;
	}

	input[type="text"]:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.readonly-field {
		background: var(--color-surface-2, var(--color-hover));
		color: var(--color-text-muted);
		font-family: monospace;
		font-size: var(--text-xs);
		cursor: default;
	}

	.file-preview {
		max-height: 160px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
	}

	.file-preview-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: var(--text-xs);
		padding: 2px 0;
		color: var(--color-text-secondary);
	}

	.file-preview-path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-preview-size {
		white-space: nowrap;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	/* Category picker */
	.category-breadcrumb {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}

	.breadcrumb-segment {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 2px var(--space-2);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text);
	}

	.breadcrumb-segment:hover {
		border-color: var(--color-primary);
	}

	.breadcrumb-sep {
		color: var(--color-text-muted);
	}

	.breadcrumb-add {
		background: none;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		padding: 2px var(--space-2);
		cursor: pointer;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.breadcrumb-add:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.pick-category-btn {
		background: none;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		align-self: flex-start;
	}

	.pick-category-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.category-picker {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.picker-prompt {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.picker-choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: flex-start;
	}

	.picker-choice {
		padding: 3px var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.picker-choice:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.picker-choice.selected {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-on-primary, #fff);
	}

	.picker-other {
		font-style: italic;
	}

	.picker-new {
		display: flex;
		gap: var(--space-1);
		align-items: center;
		width: 100%;
	}

	.picker-new input {
		flex: 1;
		padding: 3px var(--space-2);
		font-size: var(--text-sm);
	}

	.picker-new button {
		padding: 3px var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.picker-warning {
		width: 100%;
		padding: var(--space-2);
		background: var(--color-surface-2, var(--color-hover));
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.picker-warning p {
		margin: 0 0 var(--space-2);
		color: var(--color-text-secondary);
	}

	.picker-warning-btns {
		display: flex;
		gap: var(--space-2);
	}

	.warning-confirm {
		padding: 2px var(--space-2);
		border: 1px solid var(--color-error, #e53e3e);
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		font-size: var(--text-xs);
		color: var(--color-error, #e53e3e);
	}

	.warning-cancel {
		padding: 2px var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.picker-close {
		background: none;
		border: none;
		cursor: pointer;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		align-self: flex-end;
		text-decoration: underline;
	}

	.form-actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}


</style>

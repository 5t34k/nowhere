<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	function getTagValue(key: string): string {
		return tags.find(t => t.key === key)?.value ?? '';
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter(t => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate(newTags);
	}

	const identityMode = $derived(getTagValue('i') || '1');
	const privacyMode = $derived(getTagValue('H') || '0');
	const postSizeLimitRaw = $derived(getTagValue('m'));
	const postSizeLimit = $derived(
		postSizeLimitRaw ? parseInt(postSizeLimitRaw, 36) : 5000
	);
	const wotPostDepth = $derived(getTagValue('W'));
	const wotReplyDepth = $derived(getTagValue('3'));
	const wotChatDepth = $derived(getTagValue('4'));
	const bannedWords = $derived(getTagValue('X'));

	// Boolean tag S = sharing disabled (absence = enabled by default)
	const sharingDisabled = $derived(tags.some(t => t.key === 'S' && t.value === undefined));

	function toggleSharing() {
		if (sharingDisabled) {
			onUpdate(tags.filter(t => t.key !== 'S'));
		} else {
			onUpdate([...tags, { key: 'S', value: undefined }]);
		}
	}

	// Boolean tag 9 = QR sharing disabled (absence = enabled by default)
	const qrSharingDisabled = $derived(tags.some(t => t.key === '9' && t.value === undefined));

	function toggleQrSharing() {
		if (qrSharingDisabled) {
			onUpdate(tags.filter(t => t.key !== '9'));
		} else {
			onUpdate([...tags, { key: '9', value: undefined }]);
		}
	}

	// Boolean tag L = salt enabled (censorship resistance)
	const saltEnabled = $derived(tags.some(t => t.key === 'L' && t.value === undefined));

	function toggleSaltEnabled() {
		if (saltEnabled) {
			onUpdate(tags.filter(t => t.key !== 'L'));
		} else {
			onUpdate([...tags, { key: 'L', value: undefined }]);
		}
	}

	// Boolean tag V = voice chat enabled
	const voiceEnabled = $derived(tags.some(t => t.key === 'V' && t.value === undefined));

	function toggleVoice() {
		if (voiceEnabled) {
			onUpdate(tags.filter(t => t.key !== 'V'));
		} else {
			onUpdate([...tags, { key: 'V', value: undefined }]);
		}
	}

	// Boolean tag b = torrent feature enabled
	const torrentEnabled = $derived(tags.some(t => t.key === 'b' && t.value === undefined));

	function toggleTorrent() {
		if (torrentEnabled) {
			onUpdate(tags.filter(t => !['b', 'q', 'F', '5', 'h'].includes(t.key)));
		} else {
			onUpdate([...tags, { key: 'b', value: undefined }]);
		}
	}

	const DEFAULT_TORRENT_CATEGORIES = ['Software', 'Video', 'Audio', 'Books'];
	const MAX_CATEGORY_LENGTH = 24;

	let localCategories = $state<string[]>([]);
	let lastCategoriesTagValue: string | null = null;
	let categoryInput = $state('');

	const torrentCategoriesTag = $derived(tags.find(t => t.key === 'q')?.value);
	$effect(() => {
		const tv = torrentCategoriesTag ?? '';
		if (tv !== lastCategoriesTagValue) {
			lastCategoriesTagValue = tv;
			localCategories = tv ? tv.split('|').filter(Boolean) : [...DEFAULT_TORRENT_CATEGORIES];
		}
	});

	function syncCategoriesToTag() {
		const filtered = localCategories.map(c => c.trim()).filter(Boolean);
		const joined = filtered.join('|');
		const newTags = tags.filter(t => t.key !== 'q');
		if (filtered.length > 0) {
			newTags.push({ key: 'q', value: joined });
		}
		lastCategoriesTagValue = filtered.length > 0 ? joined : '';
		onUpdate(newTags);
	}

	function addCategory() {
		const value = categoryInput.replace(/\|/g, '').trim().slice(0, MAX_CATEGORY_LENGTH);
		if (!value) return;
		if (localCategories.some(c => c.toLowerCase() === value.toLowerCase())) {
			categoryInput = '';
			return;
		}
		localCategories = [...localCategories, value];
		categoryInput = '';
		syncCategoriesToTag();
	}

	function removeCategory(index: number) {
		localCategories = localCategories.filter((_, i) => i !== index);
		syncCategoriesToTag();
	}

	const torrentCategoriesFixed = $derived(tags.some(t => t.key === 'F' && t.value === undefined));
	const wotTorrentDepth = $derived(getTagValue('5'));
	const torrentRules = $derived(getTagValue('h'));

	function toggleTorrentFixed() {
		if (torrentCategoriesFixed) {
			onUpdate(tags.filter(t => t.key !== 'F'));
		} else {
			onUpdate([...tags, { key: 'F', value: undefined }]);
		}
	}
</script>

<div class="panel">
	<h3>Settings</h3>

	<section class="field-group">
		<label>
			Identity Mode
			<HintIcon tip="Controls how users identify themselves. Require NIP-07 extension, allow both extension and ephemeral keys, or force ephemeral-only." />
		</label>
		<div class="radio-group">
			<label class="radio-label">
				<input type="radio" name="identity-mode" value="0" checked={identityMode === '0'} onchange={() => setTagValue('i', '0')} />
				Require extension (NIP-07)
			</label>
			<label class="radio-label">
				<input type="radio" name="identity-mode" value="1" checked={identityMode === '1'} onchange={() => setTagValue('i', '1')} />
				Allow both
			</label>
			<label class="radio-label">
				<input type="radio" name="identity-mode" value="2" checked={identityMode === '2'} onchange={() => setTagValue('i', '2')} />
				Ephemeral only
			</label>
		</div>
	</section>

	<section class="field-group">
		<label>
			Privacy Mode
			<HintIcon tip="Full profile fetches Nostr profiles from relays. Private mode shows only truncated npub and generated avatar — no relay queries for identity." />
		</label>
		<div class="radio-group">
			<label class="radio-label">
				<input type="radio" name="privacy-mode" value="0" checked={privacyMode === '0'} onchange={() => setTagValue('H', '0')} />
				Full profile
			</label>
			<label class="radio-label">
				<input type="radio" name="privacy-mode" value="1" checked={privacyMode === '1'} onchange={() => setTagValue('H', '1')} />
				Private
			</label>
		</div>
	</section>

	<section class="field-group">
		<label for="fm-postlimit">
			Post Size Limit
			<HintIcon tip="Maximum characters per post. Default 5000. Encoded in base-36." />
		</label>
		<input
			id="fm-postlimit"
			type="number"
			min="100"
			max="50000"
			value={postSizeLimit}
			onchange={(e) => {
				const v = parseInt(e.currentTarget.value, 10);
				if (!isNaN(v) && v > 0) {
					if (v === 5000) {
						setTagValue('m', '');
					} else {
						setTagValue('m', v.toString(36));
					}
				}
			}}
			placeholder="5000"
		/>
	</section>

	<section class="field-group">
		<label>
			WoT Depth — Posts
			<HintIcon tip="Web of Trust depth for creating top-level posts. 0 = only forum creator. 1 = creator's follows. Higher = more open. No limit = anyone can post." />
		</label>
		<select value={wotPostDepth} onchange={(e) => setTagValue('W', e.currentTarget.value)}>
			<option value="">No limit</option>
			<option value="0">0 — Creator only</option>
			<option value="1">1 — Creator's follows</option>
			<option value="2">2 — 2 hops</option>
			<option value="3">3 — 3 hops</option>
		</select>
	</section>

	<section class="field-group">
		<label>
			WoT Depth — Replies
			<HintIcon tip="Web of Trust depth for replies. Can differ from post depth. Example: posts depth 0 (creator only) + replies depth 1 (creator's follows) creates a blog-style forum." />
		</label>
		<select value={wotReplyDepth} onchange={(e) => setTagValue('3', e.currentTarget.value)}>
			<option value="">No limit</option>
			<option value="0">0 — Creator only</option>
			<option value="1">1 — Creator's follows</option>
			<option value="2">2 — 2 hops</option>
			<option value="3">3 — 3 hops</option>
		</select>
	</section>

	<section class="field-group">
		<label>
			WoT Depth — Chat
			<HintIcon tip="Web of Trust depth for chat and voice chat participation. Controls who can send messages and join voice calls. No limit = anyone can chat." />
		</label>
		<select value={wotChatDepth} onchange={(e) => setTagValue('4', e.currentTarget.value)}>
			<option value="">No limit</option>
			<option value="0">0 — Creator only</option>
			<option value="1">1 — Creator's follows</option>
			<option value="2">2 — 2 hops</option>
			<option value="3">3 — 3 hops</option>
		</select>
	</section>

	<section class="field-group">
		<label for="fm-banned">
			Banned Words			<HintIcon tip="Comma-separated list of words to filter out. Posts or replies containing these words will be hidden." />
		</label>
		<textarea
			id="fm-banned"
			value={bannedWords}
			onchange={(e) => setTagValue('X', e.currentTarget.value)}
			placeholder="word, word, word"
			rows="2"
		></textarea>
	</section>

	<section class="field-group">
		<label class="checkbox-label">
			<input type="checkbox" checked={!sharingDisabled} onchange={toggleSharing} />
			Enable post sharing
			<HintIcon tip="Allow users to copy a direct link to a specific post. When disabled, the share button is hidden and shared links will not navigate to the post." />
		</label>
	</section>

	<section class="field-group">
		<label class="checkbox-label">
			<input type="checkbox" checked={!qrSharingDisabled} onchange={toggleQrSharing} />
			Enable QR sharing
			<HintIcon tip="Shows a QR code button in the forum header. Lets users share the forum link by scanning a QR code — useful for private in-person sharing with no digital trail." />
		</label>
	</section>

	<section class="field-group">
		<label class="checkbox-label">
			<input type="checkbox" checked={saltEnabled} onchange={toggleSaltEnabled} />
			Enable salt (censorship resistance)
			<HintIcon tip="Adds a salt shaker to the forum header. A salt opens a completely separate space within the forum — different posts, different chat, no visible connection to the original. The link and all settings stay the same. Each salt produces a unique place, and anyone with the same salt finds the same place." />
		</label>
	</section>

	<!-- Voice chat hidden until P2P connectivity is reliable across network types -->

	<section class="field-group">
		<label class="checkbox-label">
			<input type="checkbox" checked={torrentEnabled} onchange={toggleTorrent} />
			Enable torrents
			<HintIcon tip="Adds a private torrent section to the forum. Submitters upload a .torrent file; data is encrypted with the same layers as text posts. Submitter identity is tied to their real Nostr key via Web of Trust." />
		</label>
	</section>

	{#if torrentEnabled}
		<section class="field-group torrent-subsection">
			<label for="fm-torrent-cats">
				Top-level Categories
				<HintIcon tip="Root categories for torrents (e.g. Software, Video, Audio, Books). Submitters can drill into subcategories at submission time. Only top-level categories are stored here." />
			</label>
			{#if localCategories.length > 0}
				<div class="chip-list">
					{#each localCategories as category, i}
						<span class="chip">
							<span class="chip-label">{category}</span>
							<button
								type="button"
								class="chip-remove"
								onclick={() => removeCategory(i)}
								aria-label={`Remove ${category}`}
								title="Remove"
							>&times;</button>
						</span>
					{/each}
				</div>
			{/if}
			<div class="chip-input-row">
				<input
					id="fm-torrent-cats"
					type="text"
					bind:value={categoryInput}
					placeholder="Category name"
					maxlength={MAX_CATEGORY_LENGTH}
				/>
				<button type="button" class="add-chip-btn" onclick={addCategory} disabled={!categoryInput.trim()}>
					Add
				</button>
			</div>
			<span class="char-hint">{MAX_CATEGORY_LENGTH} characters max per category.</span>
		</section>

		<section class="field-group torrent-subsection">
			<label class="checkbox-label">
				<input type="checkbox" checked={torrentCategoriesFixed} onchange={toggleTorrentFixed} />
				Fix top-level categories
				<HintIcon tip="When enabled, submitters can only use the root categories you defined above. When disabled, submitters can propose new root categories (with a duplicate warning)." />
			</label>
		</section>

		<section class="field-group torrent-subsection">
			<label>
				WoT Depth — Torrent Submitters
				<HintIcon tip="Web of Trust depth for submitting torrents. Works the same as WoT for posts. No limit = anyone can submit." />
			</label>
			<select value={wotTorrentDepth} onchange={(e) => setTagValue('5', e.currentTarget.value)}>
				<option value="">No limit</option>
				<option value="0">0 — Creator only</option>
				<option value="1">1 — Creator's follows</option>
				<option value="2">2 — 2 hops</option>
				<option value="3">3 — 3 hops</option>
			</select>
		</section>

		<section class="field-group torrent-subsection">
			<label for="fm-torrent-rules">
				Torrent Rules				<HintIcon tip="Free-text rules shown at the top of the torrent tab and on the submission form. Use this to describe what is and isn't acceptable to submit." />
			</label>
			<textarea
				id="fm-torrent-rules"
				value={torrentRules}
				onchange={(e) => setTagValue('h', e.currentTarget.value)}
				placeholder="Quality standards, allowed formats, banned content…"
				rows="3"
			></textarea>
		</section>
	{/if}
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

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-group > label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.field-group input,
	.field-group textarea,
	.field-group select {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		resize: vertical;
	}

	.field-group input:focus,
	.field-group textarea:focus,
	.field-group select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.radio-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.radio-label input[type="radio"] {
		margin: 0;
		padding: 0;
		border: none;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.checkbox-label input[type="checkbox"] {
		margin: 0;
	}

	.torrent-subsection {
		padding-left: var(--space-4);
		border-left: 2px solid var(--color-border);
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 2px var(--space-1) 2px var(--space-2);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		font-size: var(--text-xs);
		color: var(--color-text);
		max-width: 100%;
	}

	.chip-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: none;
		background: none;
		border-radius: 50%;
		color: var(--color-text-secondary);
		font-size: var(--text-base);
		line-height: 1;
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
	}

	.chip-remove:hover {
		background: var(--color-error);
		color: var(--color-bg);
	}

	.chip-input-row {
		display: flex;
		gap: var(--space-2);
		align-items: stretch;
	}

	.chip-input-row input {
		flex: 1;
		min-width: 0;
	}

	.add-chip-btn {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
		flex-shrink: 0;
	}

	.add-chip-btn:hover:not(:disabled) {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.add-chip-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.char-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>

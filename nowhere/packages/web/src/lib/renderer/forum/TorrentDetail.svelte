<script lang="ts">
	import type { DecryptedTorrent, DecryptedReply } from '$lib/renderer/nostr/forum-events.js';
	import { buildMagnetLink } from '$lib/renderer/nostr/forum-events.js';
	import AuthorIdentity from './AuthorIdentity.svelte';
	import ReplyForm from './ReplyForm.svelte';

	interface Props {
		torrent: DecryptedTorrent;
		replies: DecryptedReply[];
		privacyMode: number;
		postSizeLimit: number;
		publishing: boolean;
		canPost: boolean;
		wotBlocked?: boolean;
		loadingReplies: boolean;
		onBack: () => void;
		onReply: (body: string, quotedId?: string) => void;
		onSignIn?: () => void;
		profileRelays?: string[];
		onOpenProfileCard?: (pubkey: string) => void;
		onCategoryClick?: (path: string[]) => void;
	}

	let {
		torrent, replies, privacyMode, postSizeLimit, publishing, canPost,
		wotBlocked = false, loadingReplies, onBack, onReply, onSignIn,
		profileRelays, onOpenProfileCard, onCategoryClick
	}: Props = $props();

	const { torrentData } = torrent;

	const categorySegments = $derived(
		(torrentData.category || '').split('>').map(s => s.trim()).filter(Boolean)
	);

	let magnetCopied = $state(false);
	let quotingReply = $state<DecryptedReply | null>(null);

	function displayCategory(category: string): string {
		return category.split('>').map(s => {
			const t = s.trim();
			return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
		}).join(' › ');
	}

	function formatSize(bytes: number): string {
		if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GiB';
		if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MiB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KiB';
		return bytes + ' B';
	}

	function formatDate(ts: number): string {
		return new Date(ts * 1000).toLocaleDateString(undefined, {
			year: 'numeric', month: 'short', day: 'numeric'
		});
	}

	function formatTime(ts: number): string {
		const d = new Date(ts * 1000);
		const now = Date.now();
		const diff = now - d.getTime();
		if (diff < 60000) return 'just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
		return d.toLocaleDateString();
	}

	const totalSize = $derived(torrentData.files.reduce((s, f) => s + f.size, 0));

	const sortedReplies = $derived([...replies].sort((a, b) => a.payload.ts - b.payload.ts));

	async function copyMagnet() {
		try {
			await navigator.clipboard.writeText(buildMagnetLink(torrentData));
			magnetCopied = true;
			setTimeout(() => { magnetCopied = false; }, 2000);
		} catch { /* clipboard unavailable */ }
	}

	function handleReply(body: string, quotedId?: string) {
		onReply(body, quotedId);
		quotingReply = null;
	}
</script>

<div class="torrent-detail">
	<button class="back-btn" onclick={onBack}>← Back</button>

	<div class="torrent-detail-card">
		<h2 class="torrent-title">{torrentData.title}</h2>

		{#if torrentData.category}
			<div class="torrent-meta-row">
				<span class="torrent-meta-label">Category</span>
				<span class="torrent-meta-value">
					{#if onCategoryClick}
						{#each categorySegments as seg, i}
							{#if i > 0}<span class="cat-sep"> › </span>{/if}
							<button
								class="cat-link"
								onclick={() => onCategoryClick!(categorySegments.slice(0, i + 1).map(s => s.toLowerCase()))}
							>{seg.charAt(0).toUpperCase() + seg.slice(1)}</button>
						{/each}
					{:else}
						{displayCategory(torrentData.category)}
					{/if}
				</span>
			</div>
		{/if}

		<div class="torrent-meta-row">
			<span class="torrent-meta-label">Total size</span>
			<span class="torrent-meta-value">{formatSize(totalSize)}</span>
		</div>

		<div class="torrent-meta-row">
			<span class="torrent-meta-label">Uploaded</span>
			<span class="torrent-meta-value">{formatDate(torrent.innerTimestamp)}</span>
		</div>

		<div class="torrent-meta-row">
			<span class="torrent-meta-label">Infohash</span>
			<span class="torrent-meta-value torrent-hash">{torrentData.x}</span>
		</div>

		<div class="torrent-meta-row">
			<span class="torrent-meta-label">Submitted by</span>
			<div class="torrent-meta-value torrent-author">
				<AuthorIdentity
					pubkey={torrent.authorPubkey}
					{privacyMode}
					size={28}
					{profileRelays}
					{onOpenProfileCard}
				/>
			</div>
		</div>

		{#if torrentData.description}
			<div class="torrent-description">
				<h4>Description</h4>
				<p>{torrentData.description}</p>
			</div>
		{/if}

		{#if torrentData.refs && torrentData.refs.length > 0}
			<div class="torrent-refs">
				{#each torrentData.refs as ref}
					<span class="ref-badge">{ref}</span>
				{/each}
			</div>
		{/if}

		<button class="magnet-copy-btn" class:copied={magnetCopied} onclick={copyMagnet}>
			{#if magnetCopied}
				✓ Copied!
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 22 16" fill="currentColor" style="vertical-align:middle"><path d="M8 0A8 8 0 0 0 8 16L8 11A3 3 0 0 1 8 5Z"/><rect x="8" y="0" width="8" height="5"/><rect x="18" y="0" width="4" height="5"/><rect x="8" y="11" width="8" height="5"/><rect x="18" y="11" width="4" height="5"/></svg> Copy magnet link
			{/if}
		</button>

		<div class="torrent-section">
			<h4>Files <span class="section-count">{torrentData.files.length}</span></h4>
			<div class="file-list">
				{#each torrentData.files as f}
					<div class="file-row">
						<span class="file-path">{f.path}</span>
						<span class="file-size">{formatSize(f.size)}</span>
					</div>
				{/each}
			</div>
		</div>

		{#if torrentData.trackers && torrentData.trackers.length > 0}
			<div class="torrent-section">
				<h4>Trackers</h4>
				<ul class="tracker-list">
					{#each torrentData.trackers as tr}
						<li class="tracker-item">{tr}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>

	<!-- Reply thread -->
	<div class="torrent-replies">
		<h3 class="replies-heading">Discussion</h3>

		{#if loadingReplies}
			<div class="replies-loading">Loading replies…</div>
		{:else if sortedReplies.length > 0}
			<div class="replies-list">
				{#each sortedReplies as reply (reply.eventId)}
					<div class="reply-item">
						<div class="reply-header">
							<AuthorIdentity
								pubkey={reply.payload.p}
								{privacyMode}
								size={24}
								vertical={true}
								{profileRelays}
								{onOpenProfileCard}
							/>
							<span class="reply-time">{formatTime(reply.payload.ts)}</span>
							{#if canPost && !wotBlocked}
								<button class="reply-quote-btn" onclick={() => { quotingReply = reply; }}>↩</button>
							{/if}
						</div>
						{#if reply.payload.ref}
							{@const quoted = sortedReplies.find(r => r.eventId === reply.payload.ref)}
							{#if quoted}
								<div class="reply-quote">
									<span class="reply-quote-text">{quoted.payload.b}</span>
								</div>
							{/if}
						{/if}
						<div class="reply-body">{reply.payload.b}</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="replies-empty">No replies yet.</div>
		{/if}

		{#if canPost && !wotBlocked}
			<ReplyForm
				{postSizeLimit}
				{publishing}
				quotedReply={quotingReply}
				onSubmit={handleReply}
				onClearQuote={() => { quotingReply = null; }}
			/>
		{:else if !canPost && onSignIn}
			<button class="sign-in-to-reply" onclick={onSignIn}>Sign in to reply</button>
		{/if}
	</div>
</div>

<style>
	.torrent-detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-4) 0;
	}

	.back-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		padding: 0;
		text-align: left;
	}

	.back-btn:hover {
		color: var(--color-text);
	}

	.torrent-detail-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.torrent-title {
		font-size: var(--text-xl);
		font-weight: 600;
		margin: 0;
		line-height: 1.3;
	}

	.torrent-meta-row {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		font-size: var(--text-sm);
	}

	.torrent-meta-label {
		min-width: 90px;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		padding-top: 2px;
	}

	.torrent-meta-value {
		color: var(--color-text);
		word-break: break-all;
	}

	.cat-link {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--color-text);
		font-size: inherit;
		font-family: inherit;
		text-decoration: underline;
	}

	.cat-link:hover {
		color: var(--color-text-secondary);
	}

	.cat-sep {
		color: var(--color-text-muted);
	}

	:global(.author-text-stack) {
		display: inline-flex;
		flex-direction: column;
		gap: 1px;
	}

	.torrent-hash {
		font-family: monospace;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.torrent-description {
		padding-top: var(--space-2);
	}

	.torrent-description h4,
	.torrent-section h4 {
		font-size: var(--text-sm);
		font-weight: 600;
		margin: 0 0 var(--space-2);
	}

	.torrent-description p {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		white-space: pre-wrap;
		margin: 0;
	}

	.torrent-refs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.ref-badge {
		display: inline-block;
		padding: 2px var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.magnet-copy-btn {
		align-self: flex-start;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		font-size: var(--text-sm);
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: border-color 0.15s, color 0.15s;
	}

	.magnet-copy-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.magnet-copy-btn.copied {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.torrent-section {
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.section-count {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		margin-left: var(--space-1);
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 240px;
		overflow-y: auto;
	}

	.file-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-xs);
		padding: 2px 0;
		color: var(--color-text-secondary);
	}

	.file-path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-size {
		white-space: nowrap;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.tracker-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tracker-item {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		word-break: break-all;
	}

	/* Reply thread */
	.torrent-replies {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.replies-heading {
		font-size: var(--text-base);
		font-weight: 600;
		margin: 0;
	}

	.replies-loading,
	.replies-empty {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.replies-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.reply-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.reply-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.reply-time {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.reply-quote-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		padding: 0 var(--space-1);
		margin-left: auto;
	}

	.reply-quote-btn:hover {
		color: var(--color-text-secondary);
	}

	.reply-quote {
		margin-left: var(--space-4);
		padding: var(--space-1) var(--space-2);
		border-left: 2px solid var(--color-border);
	}

	.reply-quote-text {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: pre-wrap;
	}

	.reply-body {
		font-size: var(--text-sm);
		color: var(--color-text);
		white-space: pre-wrap;
		margin-left: var(--space-1);
	}

	.sign-in-to-reply {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		cursor: pointer;
		color: var(--color-text-secondary);
		align-self: flex-start;
	}

	.torrent-author {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: 1fr auto;
		column-gap: var(--space-2);
		row-gap: 0;
		min-height: 28px;
	}

	.torrent-author :global(.author-avatar-img) {
		grid-column: 1;
		grid-row: 1 / 3;
		align-self: center;
	}

	.torrent-author :global(.author-label) {
		grid-column: 2;
		grid-row: 1;
		align-self: end;
		line-height: 1;
		font-size: var(--text-sm);
		padding-bottom: 2px;
	}

	.torrent-author :global(.author-npub) {
		grid-column: 2;
		grid-row: 2;
		align-self: start;
		line-height: 1;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>

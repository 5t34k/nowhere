<script lang="ts">
	import type { DecryptedPost, DecryptedReply } from '$lib/renderer/nostr/forum-events.js';
	import type { ForumCache } from '$lib/renderer/nostr/forum-cache.js';
	import AuthorIdentity from './AuthorIdentity.svelte';
	import ReplyForm from './ReplyForm.svelte';
	import { sanitizeUrl, sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';

	interface Props {
		post: DecryptedPost;
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
		onSharePost?: (post: DecryptedPost) => void;
		newReplyCount?: number;
		profileRelays?: string[];
		forumCache?: ForumCache;
		onOpenProfileCard?: (pubkey: string) => void;
	}

	let { post, replies, privacyMode, postSizeLimit, publishing, canPost, wotBlocked = false, loadingReplies, onBack, onReply, onSignIn, onSharePost, newReplyCount = 0, profileRelays, forumCache, onOpenProfileCard }: Props = $props();

	let imageExpanded = $state(false);
	let imageFailed = $state(false);
	let copied = $state(false);
	let quotingReply = $state<DecryptedReply | null>(null);
	let expandedQuotes = $state<Set<string>>(new Set());
	let replyFormEl = $state<HTMLElement | null>(null);

	function sharePost() {
		onSharePost?.(post);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	const isImagePost = $derived(
		!!post.payload.l && /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i.test(post.payload.l)
	);

	const sortedReplies = $derived(
		[...replies].sort((a, b) => a.payload.ts - b.payload.ts)
	);

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

	function startQuoteReply(reply: DecryptedReply) {
		quotingReply = reply;
		replyFormEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	function jumpToReply(eventId: string) {
		document.getElementById(`reply-${eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function toggleQuoteExpand(eventId: string) {
		const next = new Set(expandedQuotes);
		if (next.has(eventId)) next.delete(eventId);
		else next.add(eventId);
		expandedQuotes = next;
	}

	function isLongQuote(text: string): boolean {
		return text.length > 200 || text.includes('\n');
	}

	function handleReplySubmit(body: string, quotedId?: string) {
		onReply(body, quotedId);
		quotingReply = null;
	}
</script>

<div class="post-detail-back">
	<button class="back-btn" onclick={onBack}>&larr; Back to posts</button>
</div>

<!-- OP block: author sidebar + content -->
<div class="thread-op">
	<div class="thread-op-sidebar">
		<AuthorIdentity pubkey={post.payload.p} {privacyMode} size={48} {profileRelays} {forumCache} {onOpenProfileCard} />
	</div>
	<div class="thread-op-body">
		{#if onSharePost}
			<button class="post-share-btn" onclick={sharePost} title="Copy link to post">
				{#if copied}Copied!{:else}Share Post{/if}
			</button>
		{/if}
		<h2 class="thread-op-title">{post.payload.t}</h2>
		{#if post.payload.b}
			<div class="thread-op-text">{post.payload.b}</div>
		{/if}
		{#if post.payload.l}
			<div class="thread-op-link-row">
				{#if isImagePost}
					<button class="thread-op-image-toggle" onclick={() => { imageExpanded = !imageExpanded; imageFailed = false; }} title="Preview image">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
					</button>
				{/if}
				<a class="thread-op-link" href={sanitizeUrl(post.payload.l)} target="_blank" rel="noopener noreferrer">{post.payload.l}</a>
			</div>
			{#if isImagePost && imageExpanded}
				<div class="thread-op-image-preview">
					{#if imageFailed}
						<div class="thread-op-image-error">Failed to load image</div>
					{:else}
						<img src={sanitizeImageUrl(post.payload.l)} alt={post.payload.t} onerror={() => { imageFailed = true; }} />
					{/if}
				</div>
			{/if}
		{/if}
		<div class="thread-op-time">{formatTime(post.payload.ts)}</div>
	</div>
</div>

<!-- Replies -->
<div class="replies-section">
	<div class="replies-heading">Replies ({sortedReplies.length}){#if newReplyCount > 0} <span class="post-row-new-replies">+{newReplyCount} new</span>{/if}</div>

	{#if loadingReplies}
		<div class="forum-loading">Loading replies...</div>
	{:else if sortedReplies.length === 0}
		<div class="reply-empty">No replies yet.</div>
	{:else}
		{#each sortedReplies as reply}
			<div class="thread-reply" id="reply-{reply.eventId}">
				<div class="thread-reply-sidebar">
					<AuthorIdentity pubkey={reply.payload.p} {privacyMode} size={44} {profileRelays} {forumCache} {onOpenProfileCard} />
				</div>
				<div class="thread-reply-body">
					{#if reply.payload.ref}
						{@const quoted = sortedReplies.find(r => r.eventId === reply.payload.ref)}
						{#if quoted}
							<div class="reply-quote">
								<div class="reply-quote-header">
									<div class="reply-quote-author">
										<AuthorIdentity pubkey={quoted.payload.p} {privacyMode} size={18} showNpub={false} {profileRelays} {forumCache} {onOpenProfileCard} />
									</div>
									<button class="reply-quote-jump" onclick={() => jumpToReply(quoted.eventId)}>↑ Jump</button>
								</div>
								<div class="reply-quote-body" class:expanded={expandedQuotes.has(reply.eventId)}>
									{quoted.payload.b}
								</div>
								{#if isLongQuote(quoted.payload.b)}
									<button class="reply-quote-toggle" onclick={() => toggleQuoteExpand(reply.eventId)}>
										{expandedQuotes.has(reply.eventId) ? 'Collapse ▲' : 'Expand ▾'}
									</button>
								{/if}
							</div>
						{:else}
							<div class="reply-quote reply-quote-missing">Replying to an earlier message</div>
						{/if}
					{/if}
					<div class="reply-text">{reply.payload.b}</div>
					<div class="reply-action-row">
						<span class="reply-time">{formatTime(reply.payload.ts)}</span>
						{#if canPost && !wotBlocked}
							<button class="reply-btn" onclick={() => startQuoteReply(reply)}>Reply</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	{/if}

	{#if canPost && wotBlocked}
		<div class="thread-reply-form">
			<div class="wot-tooltip-wrapper" data-tooltip="You are not in this forum's trust network">
				<button class="new-post-btn" disabled>Reply</button>
			</div>
		</div>
	{:else if canPost}
		<div class="thread-reply-form" bind:this={replyFormEl}>
			<ReplyForm
				{postSizeLimit}
				{publishing}
				quotedReply={quotingReply}
				onClearQuote={() => { quotingReply = null; }}
				onSubmit={handleReplySubmit}
			/>
		</div>
	{:else if onSignIn}
		<div class="thread-reply-form">
			<button class="new-post-btn sign-in-btn" onclick={onSignIn}>Sign in to reply</button>
		</div>
	{/if}
</div>

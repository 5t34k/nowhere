<script lang="ts">
	import type { DecryptedPost } from '$lib/renderer/nostr/forum-events.js';
	import type { ForumCache } from '$lib/renderer/nostr/forum-cache.js';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import AuthorIdentity from './AuthorIdentity.svelte';
	import PostCreateForm from './PostCreateForm.svelte';
	import PostToolbar from './PostToolbar.svelte';
	import type { DateFilter, TypeFilter, SortMode } from './PostToolbar.svelte';
	import { npubEncode } from 'nostr-tools/nip19';

	interface Props {
		posts: DecryptedPost[];
		privacyMode: number;
		postSizeLimit: number;
		publishing: boolean;
		canPost: boolean;
		wotBlocked?: boolean;
		loading: boolean;
		onSelectPost: (post: DecryptedPost) => void;
		onCreatePost: (title: string, body: string, link: string) => void;
		onSignIn?: () => void;
		replyCountMap?: Record<string, number>;
		newReplyCountMap?: Record<string, number>;
		newPostIds?: Set<string>;
		onMarkAllRead?: () => void;
		profileRelays?: string[];
		forumCache?: ForumCache;
		onOpenProfileCard?: (pubkey: string) => void;
		activeTopic?: string;
	}

	let { posts, privacyMode, postSizeLimit, publishing, canPost, wotBlocked = false, loading, onSelectPost, onCreatePost, onSignIn, replyCountMap = {}, newReplyCountMap = {}, newPostIds = new Set(), onMarkAllRead, profileRelays, forumCache, onOpenProfileCard, activeTopic = '' }: Props = $props();

	let showCreateForm = $state(false);
	let expandedImages = $state<Set<string>>(new Set());
	let toolbarExpanded = $state(false);

	// ── Search / filter state ──────────────────────────────────────────────────
	let searchQuery = $state('');
	let dateFilter  = $state<DateFilter>('');
	let typeFilter  = $state<TypeFilter>('');
	let sortMode    = $state<SortMode>('newest');

	// Reset filters when topic changes
	$effect(() => {
		void activeTopic;
		searchQuery = ''; dateFilter = ''; typeFilter = ''; sortMode = 'newest';
	});

	function passesDateFilter(post: DecryptedPost, f: DateFilter): boolean {
		if (!f) return true;
		const ms = { today: 864e5, week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5 }[f]!;
		return (Date.now() - post.payload.ts * 1000) <= ms;
	}

	function clearAllFilters() {
		searchQuery = ''; dateFilter = ''; typeFilter = ''; sortMode = 'newest';
	}

	const hasActiveFilters = $derived(!!dateFilter || !!typeFilter);

	const topicLabel = $derived(
		activeTopic ? activeTopic.charAt(0).toUpperCase() + activeTopic.slice(1) : ''
	);

	const filteredSortedPosts = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		let result = posts.filter(p => {
			if (dateFilter && !passesDateFilter(p, dateFilter)) return false;
			if (typeFilter && getPostType(p) !== typeFilter) return false;
			if (q) {
				let npub = '';
				try { npub = npubEncode(p.payload.p); } catch {}
				if (!(
					p.payload.t.toLowerCase().includes(q) ||
					(p.payload.b || '').toLowerCase().includes(q) ||
					(p.payload.l || '').toLowerCase().includes(q) ||
					npub.toLowerCase().includes(q) ||
					p.payload.p.toLowerCase().includes(q)
				)) return false;
			}
			return true;
		});
		if (sortMode === 'oldest')  return result.sort((a, b) => a.payload.ts - b.payload.ts);
		if (sortMode === 'replies') return result.sort((a, b) =>
			(replyCountMap[b.eventId] ?? 0) - (replyCountMap[a.eventId] ?? 0)
		);
		return result.sort((a, b) => b.payload.ts - a.payload.ts);
	});
	// ──────────────────────────────────────────────────────────────────────────

	function toggleImage(eventId: string, e: MouseEvent) {
		e.stopPropagation();
		const next = new Set(expandedImages);
		if (next.has(eventId)) next.delete(eventId);
		else next.add(eventId);
		expandedImages = next;
	}

	function handleImageError(eventId: string) {
		const next = new Set(expandedImages);
		next.delete(eventId);
		expandedImages = next;
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

	function extractDomain(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}

	function getPostType(post: DecryptedPost): 'text' | 'link' | 'image' {
		if (post.payload.l) {
			if (/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i.test(post.payload.l)) return 'image';
			return 'link';
		}
		return 'text';
	}

	function handleSubmit(title: string, body: string, link: string) {
		onCreatePost(title, body, link);
		showCreateForm = false;
	}
</script>

<div class="post-list-actions">
	{#if canPost && wotBlocked}
		<div class="wot-tooltip-wrapper" data-tooltip="You are not in this forum's trust network">
			<button class="new-post-btn" disabled>+ New Post</button>
		</div>
	{:else if canPost}
		<button class="new-post-btn" onclick={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? 'Cancel' : '+ New Post'}
		</button>
	{:else if onSignIn}
		<button class="new-post-btn sign-in-btn" onclick={onSignIn}>Sign in to post</button>
	{/if}
	{#if onMarkAllRead && (newPostIds.size > 0 || Object.keys(newReplyCountMap).length > 0)}
		<button class="mark-all-read-btn" onclick={onMarkAllRead}>Mark all read</button>
	{/if}
	{#if posts.length > 0}
		<button
			class="search-toggle-btn"
			class:active={toolbarExpanded || hasActiveFilters || !!searchQuery}
			onclick={() => { toolbarExpanded = !toolbarExpanded; }}
			aria-label="Search and filter"
			title="Search and filter"
		><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
	{/if}
</div>

{#if showCreateForm}
	<PostCreateForm
		{postSizeLimit}
		{publishing}
		onSubmit={handleSubmit}
		onCancel={() => (showCreateForm = false)}
	/>
{/if}

{#if posts.length > 0 && toolbarExpanded}
	<PostToolbar
		bind:search={searchQuery}
		bind:dateFilter
		bind:typeFilter
		bind:sortMode
		{topicLabel}
		{hasActiveFilters}
	/>
{/if}

{#if loading}
	<div class="forum-loading">Loading posts...</div>
{:else if posts.length === 0}
	<div class="post-empty">
		<p>No posts yet. Be the first to start a discussion.</p>
	</div>
{:else if filteredSortedPosts.length === 0}
	<div class="post-empty">
		<p>
			{#if searchQuery.trim()}
				No results in {topicLabel || 'this topic'}. Try searching other topics.
			{:else}
				No posts match.
			{/if}
		</p>
		<button class="post-empty-clear" onclick={clearAllFilters}>Clear filters</button>
	</div>
{:else}
	{#if searchQuery.trim()}
		<p class="search-summary">{filteredSortedPosts.length} result{filteredSortedPosts.length === 1 ? '' : 's'} in {topicLabel || 'this topic'}</p>
	{/if}
	{#each filteredSortedPosts as post}
		{@const postType = getPostType(post)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="post-row" class:post-new={newPostIds.has(post.eventId)} onclick={() => onSelectPost(post)}>
			<div class="post-row-avatar">
				<AuthorIdentity pubkey={post.payload.p} {privacyMode} size={44} showPhrase={false} showNpub={false} {profileRelays} {forumCache} {onOpenProfileCard} />
				<AuthorIdentity pubkey={post.payload.p} {privacyMode} showAvatar={false} showPhrase={false} {profileRelays} {forumCache} {onOpenProfileCard} />
			</div>
			<div class="post-row-content">
				<div class="post-row-title">{post.payload.t}</div>
				{#if post.payload.l}
					<div class="post-row-link-line">
						{#if postType === 'image'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="post-row-inline-icon post-type-image" onclick={(e) => toggleImage(post.eventId, e)}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
							</span>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="post-row-link post-row-link-image" onclick={(e) => toggleImage(post.eventId, e)}>{extractDomain(post.payload.l)}</span>
						{:else}
							<span class="post-row-inline-icon post-type-link">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
							</span>
							<a class="post-row-link" href={post.payload.l} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>{extractDomain(post.payload.l)}</a>
						{/if}
					</div>
				{:else if post.payload.b}
					<div class="post-row-snippet-line">
						<span class="post-row-inline-icon post-type-text">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
						</span>
						<span class="post-row-snippet">{post.payload.b.length > 120 ? post.payload.b.slice(0, 120) + '...' : post.payload.b}</span>
					</div>
				{:else}
					<div class="post-row-snippet-line">
						<span class="post-row-inline-icon post-type-text">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
						</span>
					</div>
				{/if}
				{#if post.payload.l && post.payload.b}
					<div class="post-row-snippet">{post.payload.b.length > 120 ? post.payload.b.slice(0, 120) + '...' : post.payload.b}</div>
				{/if}
				{#if postType === 'image' && expandedImages.has(post.eventId)}
					<div class="post-row-image-preview">
						<img src={sanitizeImageUrl(post.payload.l ?? '')} alt={post.payload.t} onerror={() => handleImageError(post.eventId)} />
					</div>
				{/if}
				<div class="post-row-footer">
					<span class="post-row-phrase">
						<AuthorIdentity pubkey={post.payload.p} {privacyMode} showAvatar={false} showNpub={false} {profileRelays} {forumCache} />
					</span>
					<span class="post-row-time">{formatTime(post.payload.ts)}</span>
					<span class="post-row-replies">{(replyCountMap[post.eventId] ?? 0) === 1 ? '1 reply' : (replyCountMap[post.eventId] ?? 0) + ' replies'}</span>
					{#if newReplyCountMap[post.eventId]}
						<span class="post-row-new-replies">+{newReplyCountMap[post.eventId]} new</span>
					{/if}
				</div>
			</div>
		</div>
	{/each}
{/if}

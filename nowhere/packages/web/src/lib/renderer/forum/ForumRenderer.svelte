<script lang="ts">
	import { untrack } from 'svelte';
	import type { ForumData, Tag } from '@nowhere/codec';
	import { computeFingerprintFromString, computeVerificationPhrase, computeSellerFingerprint, base64urlToHex, bytesToBase64url } from '@nowhere/codec';
	import { siteData, siteSigned, siteFragment } from '$lib/renderer/stores/site-data.js';
	import { postIdFromHash, saltFromHash } from '$lib/renderer/utils/hash-reader.js';
	import { computeVerification } from '$lib/renderer/nostr/verify.js';
	import { getForumRelays, getForumProfileRelays, USE_LOCAL_RELAY, USE_PTR_RELAY, fetchProfile, fetchProfiles } from '$lib/renderer/nostr/relay-pool.js';
	import { TESTING_MODE } from '$lib/renderer/nostr/messaging.js';
	import { deriveForumKeypair, deriveTopicTag, deriveChatTag, derivePostTag, deriveReplyKeypair, TORRENT_TOPIC_SEED, deriveTorrentPostTag, deriveTorrentReplyKeypair } from '$lib/nostr/forum-keys.js';
	import { sha256 } from '@noble/hashes/sha2.js';
	import { bytesToHex } from '@noble/hashes/utils.js';
	import { subscribeToForum, publishForumPost, publishForumReply, publishForumTorrent, decryptForumTorrent, buildMagnetLink, getSessionKeypair } from '$lib/renderer/nostr/forum-events.js';
	import type { ReplyEntry, TorrentData, DecryptedTorrent } from '$lib/renderer/nostr/forum-events.js';
	import { wrapContentForSigning, INNER_EVENT_KIND } from '$lib/renderer/nostr/nowhere-signing.js';
	import { buildWotSet, passesModeration } from '$lib/renderer/nostr/forum-wot.js';
	import { npubEncode } from 'nostr-tools/nip19';
	import type { DecryptedPost, DecryptedReply } from '$lib/renderer/nostr/forum-events.js';
	import type { SubCloser } from 'nostr-tools/pool';

	import { initCache, isOptedIn, setOptIn, loadSeenState, saveSeenState, loadPosts, savePosts, loadReplies, saveReplies, loadTorrents, saveTorrents, clearCache, clearAllCache, hasAnyCachedHistory } from '$lib/renderer/nostr/forum-cache.js';
	import type { ForumCache, SeenState } from '$lib/renderer/nostr/forum-cache.js';

	import { publishVoiceSignal, signJoinSignal } from '$lib/renderer/nostr/forum-voice.js';
	import type { VoiceSignal } from '$lib/renderer/nostr/forum-voice.js';
	import { VoiceMesh } from '$lib/renderer/nostr/voice-mesh.js';

	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import ForumHeader from './ForumHeader.svelte';
	import TopicTabs from './TopicTabs.svelte';
	import PostList from './PostList.svelte';
	import PostDetail from './PostDetail.svelte';
	import TorrentList from './TorrentList.svelte';
	import TorrentDetail from './TorrentDetail.svelte';
	import TorrentSubmitForm from './TorrentSubmitForm.svelte';
	import ChatPanel from './ChatPanel.svelte';
	import VoiceBar from './VoiceBar.svelte';
	import ForumFooter from './ForumFooter.svelte';
	import './forum.css';

	const data = $derived($siteData as ForumData);
	const fragment = $derived($siteFragment);

	// ─── Tag helpers ───
	function getTag(key: string): string | undefined {
		return data?.tags?.find((t: Tag) => t.key === key)?.value;
	}

	// ─── Parse settings ───
	const identityMode = $derived(parseInt(getTag('i') ?? '1', 10));
	const privacyMode = $derived(parseInt(getTag('H') ?? '0', 10));
	const postSizeLimitRaw = $derived(getTag('m'));
	const postSizeLimit = $derived(postSizeLimitRaw ? parseInt(postSizeLimitRaw, 36) : 5000);
	const wotPostDepthRaw = $derived(getTag('W'));
	const wotReplyDepthRaw = $derived(getTag('3'));
	const wotChatDepthRaw = $derived(getTag('4'));
	const wotPostDepth = $derived(wotPostDepthRaw !== undefined ? parseInt(wotPostDepthRaw, 10) : null);
	const wotReplyDepth = $derived(wotReplyDepthRaw !== undefined ? parseInt(wotReplyDepthRaw, 10) : null);
	const wotChatDepth = $derived(wotChatDepthRaw !== undefined ? parseInt(wotChatDepthRaw, 10) : null);
	const bannedWordsRaw = $derived(getTag('X') ?? '');
	const bannedWords = $derived(bannedWordsRaw ? bannedWordsRaw.split(',').map(w => w.trim()).filter(Boolean) : []);
	const topicsRaw = $derived(getTag('O'));
	const customTopics = $derived(topicsRaw ? topicsRaw.split('\\p').filter(Boolean) : []);

	// ─── Torrent feature ───
	const torrentEnabled = $derived(!!data?.tags?.some((t: Tag) => t.key === 'b' && t.value === undefined));
	const torrentCategoriesRaw = $derived(getTag('q') ?? '');
	const torrentCategories = $derived(
		torrentCategoriesRaw ? torrentCategoriesRaw.split('|').filter(Boolean) : ['Software', 'Video', 'Audio', 'Books']
	);
	const torrentCategoriesFixed = $derived(!!data?.tags?.some((t: Tag) => t.key === 'F' && t.value === undefined));
	const wotTorrentDepthRaw = $derived(getTag('5'));
	const wotTorrentDepth = $derived(wotTorrentDepthRaw !== undefined ? parseInt(wotTorrentDepthRaw, 10) : null);
	const torrentRules = $derived(getTag('h') ?? '');

	// ─── Salt ───
	const saltEnabled = $derived(!!data?.tags?.some((t: Tag) => t.key === 'L' && t.value === undefined));
	let salt = $state('');

	$effect(() => {
		const urlSalt = $saltFromHash;
		if (urlSalt) salt = urlSalt;
	});

	function setSalt(value: string) {
		salt = value;
		const base = '#' + fragment;
		if (value) {
			const saltB64 = bytesToBase64url(new TextEncoder().encode(value));
			window.history.replaceState(null, '', base + '*' + saltB64);
		} else {
			window.history.replaceState(null, '', base);
		}
	}

	// ─── Key derivation ───
	const effectiveFragment = $derived(salt ? fragment + ':' + salt : fragment);

	const forumKeys = $derived.by(() => {
		if (!effectiveFragment) return null;
		return deriveForumKeypair(effectiveFragment);
	});

	const relays = $derived(data ? getForumRelays(data.tags) : []);
	const profileRelays = $derived(data ? getForumProfileRelays(data.tags) : []);
	const creatorPubkeyHex = $derived(data?.pubkey ? base64urlToHex(data.pubkey) : '');

	// ─── Session cache helpers (fallback for non-opted-in) ───
	const SESSION_PREFIX = 'nowhere-forum-';

	function sessionCacheGet<T>(key: string): T[] {
		if (typeof sessionStorage === 'undefined') return [];
		try {
			const raw = sessionStorage.getItem(SESSION_PREFIX + key);
			return raw ? JSON.parse(raw) : [];
		} catch { return []; }
	}

	function sessionCacheSet<T>(key: string, items: T[]): void {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(items));
		} catch { /* quota exceeded — ignore */ }
	}

	function cacheGetPosts(topicTag: string): DecryptedPost[] {
		if (forumCacheHandle && persistEnabled) return loadPosts(forumCacheHandle, topicTag);
		return sessionCacheGet<DecryptedPost>('posts-' + topicTag);
	}

	function cacheSetPosts(topicTag: string, posts: DecryptedPost[]): void {
		if (forumCacheHandle && persistEnabled) savePosts(forumCacheHandle, topicTag, posts);
		else sessionCacheSet('posts-' + topicTag, posts);
	}

	function cacheGetReplies(postTag: string): DecryptedReply[] {
		if (forumCacheHandle && persistEnabled) return loadReplies(forumCacheHandle, postTag);
		return sessionCacheGet<DecryptedReply>('replies-' + postTag);
	}

	function cacheSetReplies(postTag: string, replies: DecryptedReply[]): void {
		if (forumCacheHandle && persistEnabled) saveReplies(forumCacheHandle, postTag, replies);
		else sessionCacheSet('replies-' + postTag, replies);
	}

	// ─── State ───
	type ViewMode = 'posts' | 'post-detail' | 'chat' | 'torrents' | 'torrent-detail';
	let currentView = $state<ViewMode>('posts');
	let activeTopic = $state('');
	let allTopicPosts = $state<Record<string, DecryptedPost[]>>({});
	const posts = $derived(allTopicPosts[activeTopic] ?? []);
	let replies = $state<DecryptedReply[]>([]);

	// Batched profile prefetch: whenever the visible post list or replies
	// change, fire one batched kind 0 query for all distinct authors. The
	// session Map in fetchProfile dedupes, so repeat calls are cheap, and
	// individual AuthorIdentity mounts will hydrate from the batch.
	$effect(() => {
		if (privacyMode !== 0 || profileRelays.length === 0) return;
		const authors = new Set<string>();
		for (const post of posts) authors.add(post.payload.p);
		for (const reply of replies) authors.add(reply.payload.p);
		if (authors.size === 0) return;
		void fetchProfiles(Array.from(authors), profileRelays, forumCacheReactive ?? undefined);
	});
	let activePost = $state<DecryptedPost | null>(null);
	let loadingPosts = $state(true);
	let loadingReplies = $state(false);
	let publishing = $state(false);
	let identityOpen = $state(false);

	// ─── Torrent state ───
	let allTorrents = $state<DecryptedTorrent[]>([]);
	let activeTorrent = $state<DecryptedTorrent | null>(null);
	let torrentDrillPath = $state<string[]>([]);
	let torrentReplies = $state<DecryptedReply[]>([]);
	let loadingTorrentReplies = $state(false);
	let showTorrentSubmit = $state(false);
	let torrentWotSet = $state<Set<string> | null>(null);

	// Plain (non-reactive) maps — mutations trigger deriveds via _trackingVersion
	const _repliesMap: Record<string, DecryptedReply[]> = {};
	let seenReplyCounts: Record<string, number> = {};
	let seenPostIds = new Set<string>();

	// Bump to force replyCountMap / newReplyCountMap / newPostIds to recompute
	let _trackingVersion = $state(0);

	// ─── Reply counts ───
	const replyCountMap = $derived.by(() => {
		void _trackingVersion;
		const map: Record<string, number> = {};
		for (const post of posts) {
			map[post.eventId] = (_repliesMap[post.eventId] ?? []).length;
		}
		return map;
	});

	const newReplyCountMap = $derived.by(() => {
		void _trackingVersion;
		const map: Record<string, number> = {};
		for (const post of posts) {
			const current = (_repliesMap[post.eventId] ?? []).length;
			const seen = seenReplyCounts[post.eventId] ?? 0;
			const diff = current - seen;
			if (diff > 0) map[post.eventId] = diff;
		}
		return map;
	});

	const newPostIds = $derived.by(() => {
		void _trackingVersion;
		return new Set(posts.filter(p => !seenPostIds.has(p.eventId)).map(p => p.eventId));
	});

	// ─── Post notification ───
	let postNotification = $state(false);
	let topicUnreadCounts = $state<Record<string, number>>({});

	// ─── Persistent cache ───
	// Reactive handle derived synchronously from forumKeys. This must resolve
	// on the very first render so child components (AuthorIdentity, etc.) can
	// read the cache before paint — otherwise we flash the generated SVG for
	// a frame before the cached profile picture replaces it.
	const forumCacheReactive = $derived.by<ForumCache | null>(() => {
		if (!forumKeys) return null;
		return initCache(forumKeys.privkey, forumKeys.pubkey);
	});
	// Plain let kept for non-reactive access inside the forum subscription
	// effect — assigned from the derived value at the top of that effect.
	let forumCacheHandle: ForumCache | null = null;
	let persistEnabled = $state(false);
	let hasAnyHistory = $state(hasAnyCachedHistory());
	let seenSaveTimer: ReturnType<typeof setTimeout> | null = null;

	function buildSeenState(): SeenState {
		const state: SeenState = { posts: {} };
		for (const [eventId, count] of Object.entries(seenReplyCounts)) {
			state.posts[eventId.slice(0, 8)] = count;
		}
		for (const id of seenPostIds) {
			const prefix = id.slice(0, 8);
			if (!(prefix in state.posts)) {
				state.posts[prefix] = 0;
			}
		}
		return state;
	}

	function scheduleSaveSeenState() {
		if (!persistEnabled || !forumCacheHandle) return;
		if (seenSaveTimer) clearTimeout(seenSaveTimer);
		seenSaveTimer = setTimeout(() => {
			if (forumCacheHandle && persistEnabled) {
				saveSeenState(forumCacheHandle, buildSeenState());
			}
		}, 3000);
	}

	function mergeSeenState(state: SeenState, postsSource?: Record<string, DecryptedPost[]>) {
		seenReplyCounts = {};
		seenPostIds = new Set<string>();
		const allPosts = Object.values(postsSource ?? allTopicPosts).flat();
		for (const [prefix, count] of Object.entries(state.posts)) {
			const post = allPosts.find(p => p.eventId.startsWith(prefix));
			if (post) {
				seenReplyCounts[post.eventId] = count;
				seenPostIds.add(post.eventId);
			}
		}
		_trackingVersion++;
	}

	function handleEnableHistory() {
		if (!forumCacheHandle) return;
		setOptIn(forumCacheHandle.prefix, true);
		persistEnabled = true;
		saveSeenState(forumCacheHandle, buildSeenState());
		hasAnyHistory = hasAnyCachedHistory();
	}

	function handleDisableHistory() {
		if (!forumCacheHandle) return;
		clearCache(forumCacheHandle);
		persistEnabled = false;
		hasAnyHistory = hasAnyCachedHistory();
	}

	function handleClearAll() {
		clearAllCache();
		persistEnabled = false;
		hasAnyHistory = false;
	}

	function markAllRead() {
		for (const post of posts) {
			seenPostIds.add(post.eventId);
			seenReplyCounts[post.eventId] = (_repliesMap[post.eventId] ?? []).length;
		}
		_trackingVersion++;
		scheduleSaveSeenState();
	}

	// ─── WoT sets ───
	let postWotSet = $state<Set<string> | null>(null);
	let replyWotSet = $state<Set<string> | null>(null);
	let chatWotSet = $state<Set<string> | null>(null);
	let wotLoading = $state(false);

	function reFilterAfterWot() {
		// Remove posts/replies that arrived before WoT was built and shouldn't be shown.
		// Also update the sessionStorage cache so rejected items don't reappear on reload.
		for (const topic of Object.keys(allTopicPosts)) {
			const filtered = allTopicPosts[topic].filter(post => {
				const text = post.payload.t + (post.payload.b ? ' ' + post.payload.b : '');
				return passesModeration(post.payload.p, text, postWotSet, bannedWords);
			});
			if (filtered.length !== allTopicPosts[topic].length) {
				allTopicPosts[topic] = filtered;
				const topicTag = [...topicTagMap.entries()].find(([, e]) => e.topic === topic)?.[0];
				if (topicTag) cacheSetPosts(topicTag, filtered);
			}
		}
		for (const postId of Object.keys(_repliesMap)) {
			const before = _repliesMap[postId] ?? [];
			const filtered = before.filter(reply =>
				passesModeration(reply.payload.p, reply.payload.b, replyWotSet, bannedWords)
			);
			if (filtered.length !== before.length) {
				_repliesMap[postId] = filtered;
				const entry = [...replyKeyMap.values()].find(e => e.postId === postId);
				if (entry) cacheSetReplies(entry.postTag, filtered);
			}
		}
		if (activePost) replies = _repliesMap[activePost.eventId] ?? [];
		_trackingVersion++;
	}

	// ─── Theme ───
	let isDark = $state(false);

	function initTheme() {
		if (typeof window === 'undefined') return;
		const stored = sessionStorage.getItem('nowhere-forum-theme');
		if (stored) {
			isDark = stored === 'dark';
		} else {
			isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	}

	function toggleTheme() {
		isDark = !isDark;
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('nowhere-forum-theme', isDark ? 'dark' : 'light');
		}
	}

	$effect(() => { initTheme(); });
	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.style.backgroundColor = isDark ? '#1A1A1A' : '#FAFAF7';
		}
	});

	// ─── Verification phrase ───
	let verificationPhrase = $state('');
	let creatorSellerPhrase = $state('');
	let creatorProfile = $state<{
		npubFull: string; npubTruncated: string; avatarSvg: string;
		name: string; picture: string; nip05: string; nip05Verified: boolean | null;
	}>({ npubFull: '', npubTruncated: '', avatarSvg: '', name: '', picture: '', nip05: '', nip05Verified: null });

	$effect(() => {
		if (data) {
			computeVerification(data).then((result) => {
				verificationPhrase = result.storePhrase;
				creatorSellerPhrase = result.sellerPhrase;
			});
			untrack(() => loadCreatorProfile());
		}
	});

	async function loadCreatorProfile() {
		if (!creatorPubkeyHex) return;
		const pubkey = creatorPubkeyHex;
		creatorProfile = { npubFull: '', npubTruncated: '', avatarSvg: '', name: '', picture: '', nip05: '', nip05Verified: null };
		try {
			const npub = npubEncode(pubkey);
			creatorProfile.npubFull = npub;
			creatorProfile.npubTruncated = npub.slice(0, 12) + '...' + npub.slice(-4);
		} catch {
			creatorProfile.npubFull = pubkey;
			creatorProfile.npubTruncated = pubkey.slice(0, 8) + '...';
		}
		try {
			const { generateAvatar } = await import('$lib/nowhere-avatar.js');
			creatorProfile.avatarSvg = generateAvatar(pubkey, 56);
		} catch {}
		if (privacyMode === 0) {
			try {
				const event = await fetchProfile({ kinds: [0], authors: [pubkey], limit: 1 }, profileRelays, forumCacheHandle ?? undefined);
				if (event?.content) {
					const p = JSON.parse(event.content);
					creatorProfile.name = p.display_name || p.name || '';
					creatorProfile.picture = sanitizeImageUrl(p.picture || '');
					creatorProfile.nip05 = p.nip05 || '';
					creatorProfile.nip05Verified = null;
					if (p.nip05) {
						verifyNip05(p.nip05, pubkey).then(verified => {
							creatorProfile.nip05Verified = verified;
						});
					}
				}
			} catch {}
		}
	}

	// ─── Identity management ───
	const ANON_KEY = 'nowhere-forum-anon-active';
	const NIP07_KEY = 'nowhere-forum-nip07-pubkey';
	let nip07Pubkey = $state('');
	let anonActive = $state(
		typeof sessionStorage !== 'undefined' && sessionStorage.getItem(ANON_KEY) === '1'
	);
	let connectError = $state('');

	// Mode 2 (ephemeral only) auto-activates anon on load
	// Mode 0 (require extension) starts signed out
	// Mode 1 (allow both) restores from sessionStorage
	$effect(() => {
		if (identityMode === 2) {
			anonActive = true;
		}
	});

	// Restore NIP-07 session on load if previously connected
	$effect(() => {
		if (typeof sessionStorage === 'undefined' || typeof window === 'undefined') return;
		const saved = sessionStorage.getItem(NIP07_KEY);
		if (!saved || !window.nostr) return;
		window.nostr.getPublicKey().then(pk => {
			if (pk === saved) {
				nip07Pubkey = pk;
				anonActive = false;
			} else {
				sessionStorage.removeItem(NIP07_KEY);
			}
		}).catch(() => {
			sessionStorage.removeItem(NIP07_KEY);
		});
	});

	// Persist identity state across refreshes
	$effect(() => {
		if (typeof sessionStorage === 'undefined') return;
		if (nip07Pubkey) {
			sessionStorage.setItem(NIP07_KEY, nip07Pubkey);
			sessionStorage.removeItem(ANON_KEY);
		} else if (anonActive) {
			sessionStorage.setItem(ANON_KEY, '1');
			sessionStorage.removeItem(NIP07_KEY);
		} else {
			sessionStorage.removeItem(ANON_KEY);
			sessionStorage.removeItem(NIP07_KEY);
		}
	});

	const sessionKeys = $derived(getSessionKeypair());

	// Signed in = either NIP-07 connected or anon session activated
	const signedIn = $derived(!!nip07Pubkey || anonActive);

	// The active author pubkey — NIP-07 if connected, anon session if activated, empty if signed out
	const authorPubkey = $derived(nip07Pubkey || (anonActive ? sessionKeys.pubkey : ''));
	// Only pass privkey for inner rumor signing when using ephemeral keys
	const authorPrivkey = $derived(nip07Pubkey ? undefined : (anonActive ? sessionKeys.privkey : undefined));

	// Can the user post?
	const canPost = $derived(signedIn);

	// WoT blocking: signed in but not in the trust network (only applies once WoT is loaded)
	const postWotBlocked = $derived(
		!!authorPubkey && !wotLoading && postWotSet !== null && !postWotSet.has(authorPubkey)
	);
	const replyWotBlocked = $derived(
		!!authorPubkey && !wotLoading && replyWotSet !== null && !replyWotSet.has(authorPubkey)
	);
	const chatWotBlocked = $derived(
		!!authorPubkey && !wotLoading && chatWotSet !== null && !chatWotSet.has(authorPubkey)
	);
	const torrentWotBlocked = $derived(
		!!authorPubkey && !wotLoading && torrentWotSet !== null && !torrentWotSet.has(authorPubkey)
	);

	async function connectNip07() {
		connectError = '';
		if (typeof window === 'undefined' || !window.nostr) {
			connectError = 'No Nostr signing extension found. Install nos2x, Alby, or similar.';
			return;
		}
		try {
			nip07Pubkey = await window.nostr.getPublicKey();
			anonActive = false;
		} catch (e) {
			connectError = `Connection failed: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	function startAnon() {
		nip07Pubkey = '';
		anonActive = true;
		connectError = '';
	}

	function disconnectNip07() {
		nip07Pubkey = '';
		anonActive = false;
		connectError = '';
	}

	async function signInnerRumorNip07(content: string, timestamp: number): Promise<string> {
		if (!window.nostr) throw new Error('No signing extension');
		const signed = await window.nostr.signEvent({
			kind: INNER_EVENT_KIND,
			created_at: timestamp,
			content,
			tags: []
		});
		return signed.sig;
	}

	// ─── Build WoT sets on mount ───
	$effect(() => {
		if (!creatorPubkeyHex || profileRelays.length === 0) return;

		if (wotPostDepth !== null || wotReplyDepth !== null || wotChatDepth !== null) {
			wotLoading = true;

			const promises: Promise<void>[] = [];

			if (wotPostDepth !== null) {
				promises.push(
					buildWotSet(creatorPubkeyHex, wotPostDepth, profileRelays).then(set => {
						postWotSet = set;
					})
				);
			}

			if (wotReplyDepth !== null) {
				promises.push(
					buildWotSet(creatorPubkeyHex, wotReplyDepth, profileRelays).then(set => {
						replyWotSet = set;
					})
				);
			}

			if (wotChatDepth !== null) {
				promises.push(
					buildWotSet(creatorPubkeyHex, wotChatDepth, profileRelays).then(set => {
						chatWotSet = set;
					})
				);
			}

			if (wotTorrentDepth !== null) {
				promises.push(
					buildWotSet(creatorPubkeyHex, wotTorrentDepth, profileRelays).then(set => {
						torrentWotSet = set;
					})
				);
			}

			Promise.all(promises).finally(() => {
				wotLoading = false;
				reFilterAfterWot();
			});
		}
	});

	// ─── Subscriptions (single unified REQ covering all topics + all reply threads) ───
	let forumSub: SubCloser | null = null;
	const topicTagMap = new Map<string, { topic: string; type?: 'text' | 'torrent' }>(); // topicTag → entry
	const replyKeyMap = new Map<string, ReplyEntry>(); // postTag → ReplyEntry
	let resubDebounce: ReturnType<typeof setTimeout> | null = null;

	function openForumSub(currentRelays: string[]) {
		if (forumSub) { forumSub.close(); forumSub = null; }
		if (!forumKeys || currentRelays.length === 0) return;
		forumSub = subscribeToForum({
			topicEntries: [...topicTagMap.entries()].map(([topicTag, entry]) => ({ topicTag, ...entry })),
			replyEntries: [...replyKeyMap.values()],
			forumPrivkey: forumKeys.privkey,
			relays: currentRelays,
			onPost: (post, topic) => handleIncomingPost(post, topic, currentRelays),
			onReply: handleIncomingReply,
			onTorrent: (torrent) => handleIncomingTorrent(torrent, currentRelays)
		});
	}

	function scheduleReopen(currentRelays: string[]) {
		if (resubDebounce) clearTimeout(resubDebounce);
		resubDebounce = setTimeout(() => openForumSub(currentRelays), 500);
	}

	function registerPostForReplies(post: DecryptedPost, currentRelays: string[]) {
		const postTag = derivePostTag(post.payload.t, post.payload.p, post.payload.ts);
		if (replyKeyMap.has(postTag)) return;
		const replyKeys = deriveReplyKeypair(post.payload.t, post.payload.p, post.payload.ts);
		replyKeyMap.set(postTag, { postTag, postId: post.eventId, replyPrivkey: replyKeys.privkey });
		_repliesMap[post.eventId] = cacheGetReplies(postTag);
		scheduleReopen(currentRelays);
	}

	function handleIncomingPost(post: DecryptedPost, topic: string, currentRelays: string[]) {
		const postText = post.payload.t + (post.payload.b ? ' ' + post.payload.b : '');
		if (!passesModeration(post.payload.p, postText, postWotSet, bannedWords)) return;
		if (postText.length > postSizeLimit) return;

		const existing = allTopicPosts[topic] ?? [];
		if (!existing.find(p => p.eventId === post.eventId)) {
			allTopicPosts[topic] = [...existing, post];
			const topicTag = [...topicTagMap.entries()].find(([, e]) => e.topic === topic)?.[0];
			if (topicTag) cacheSetPosts(topicTag, allTopicPosts[topic]);

			registerPostForReplies(post, currentRelays);

			if ((currentView === 'posts' || currentView === 'post-detail') && activeTopic === topic) {
				seenPostIds.add(post.eventId);
				_trackingVersion++;
				scheduleSaveSeenState();
			}
			if (currentView === 'chat') postNotification = true;
			if (activeTopic !== topic) topicUnreadCounts[topic] = (topicUnreadCounts[topic] ?? 0) + 1;
		}
		loadingPosts = false;
	}

	function handleIncomingReply(reply: DecryptedReply, postId: string, postTag: string) {
		if (!passesModeration(reply.payload.p, reply.payload.b, replyWotSet, bannedWords)) return;
		if (reply.payload.b.length > postSizeLimit) return;

		const existing = _repliesMap[postId] ?? [];
		if (!existing.find(r => r.eventId === reply.eventId)) {
			_repliesMap[postId] = [...existing, reply];
			cacheSetReplies(postTag, _repliesMap[postId]);
			_trackingVersion++;
			if (activePost?.eventId === postId) replies = _repliesMap[postId];
			if (activeTorrent?.eventId === postId) torrentReplies = _repliesMap[postId];
		}
	}

	function registerTorrentForReplies(torrent: DecryptedTorrent, currentRelays: string[]) {
		const tPostTag = deriveTorrentPostTag(torrent.w);
		if (replyKeyMap.has(tPostTag)) return;
		const tReplyKeys = deriveTorrentReplyKeypair(torrent.w);
		replyKeyMap.set(tPostTag, { postTag: tPostTag, postId: torrent.eventId, replyPrivkey: tReplyKeys.privkey });
		_repliesMap[torrent.eventId] = cacheGetReplies(tPostTag);
		scheduleReopen(currentRelays);
	}

	function handleIncomingTorrent(torrent: DecryptedTorrent, currentRelays: string[]) {
		if (!passesModeration(torrent.authorPubkey, torrent.torrentData.title, torrentWotSet, bannedWords)) return;
		if (allTorrents.find(t => t.eventId === torrent.eventId)) return;
		allTorrents = [...allTorrents, torrent];

		// Cache
		if (forumCacheHandle && persistEnabled) {
			const tTorrentTag = deriveTopicTag(forumKeys!.privkey, TORRENT_TOPIC_SEED);
			saveTorrents(forumCacheHandle, tTorrentTag, allTorrents);
		} else {
			const tTorrentTag = deriveTopicTag(forumKeys!.privkey, TORRENT_TOPIC_SEED);
			sessionCacheSet('torrents-' + tTorrentTag, allTorrents);
		}

		registerTorrentForReplies(torrent, currentRelays);
	}

	// Subscribe to ALL topics and reply threads in a single REQ
	$effect(() => {
		if (!forumKeys || relays.length === 0) return;

		// Initialise per-forum cache handle using plain local vars to avoid reactive tracking
		const handle = initCache(forumKeys.privkey, forumKeys.pubkey);
		forumCacheHandle = handle;
		const isOpted = isOptedIn(handle.prefix);
		persistEnabled = isOpted;

		if (forumSub) { forumSub.close(); forumSub = null; }
		if (resubDebounce) { clearTimeout(resubDebounce); resubDebounce = null; }
		topicTagMap.clear();
		replyKeyMap.clear();
		for (const key of Object.keys(_repliesMap)) delete _repliesMap[key];

		const allTopics = ['', ...customTopics];
		const currentRelays = relays;
		const initialPosts: Record<string, DecryptedPost[]> = {};

		for (const topic of allTopics) {
			const topicTag = deriveTopicTag(forumKeys.privkey, topic);
			topicTagMap.set(topicTag, { topic });
			// Use local vars to avoid making the subscription dependent on persistEnabled $state
			const cached: DecryptedPost[] = isOpted
				? loadPosts(handle, topicTag)
				: sessionCacheGet<DecryptedPost>('posts-' + topicTag);
			initialPosts[topic] = cached;
			for (const post of cached) {
				const postTag = derivePostTag(post.payload.t, post.payload.p, post.payload.ts);
				if (replyKeyMap.has(postTag)) continue;
				const replyKeys = deriveReplyKeypair(post.payload.t, post.payload.p, post.payload.ts);
				replyKeyMap.set(postTag, { postTag, postId: post.eventId, replyPrivkey: replyKeys.privkey });
				_repliesMap[post.eventId] = isOpted
					? loadReplies(handle, postTag)
					: sessionCacheGet<DecryptedReply>('replies-' + postTag);
			}
		}

		allTopicPosts = initialPosts;
		loadingPosts = Object.values(initialPosts).every(arr => arr.length === 0);

		// Register torrent topic if feature is enabled
		if (torrentEnabled) {
			const tTorrentTag = deriveTopicTag(forumKeys.privkey, TORRENT_TOPIC_SEED);
			topicTagMap.set(tTorrentTag, { topic: '__torrents__', type: 'torrent' });
			const cachedTorrents: DecryptedTorrent[] = isOpted
				? loadTorrents(handle, tTorrentTag)
				: sessionCacheGet<DecryptedTorrent>('torrents-' + tTorrentTag);
			allTorrents = cachedTorrents;
			// Register reply threads for cached torrents
			for (const torrent of cachedTorrents) {
				const tPostTag = deriveTorrentPostTag(torrent.w);
				if (replyKeyMap.has(tPostTag)) continue;
				const tReplyKeys = deriveTorrentReplyKeypair(torrent.w);
				replyKeyMap.set(tPostTag, { postTag: tPostTag, postId: torrent.eventId, replyPrivkey: tReplyKeys.privkey });
				_repliesMap[torrent.eventId] = isOpted
					? loadReplies(handle, tPostTag)
					: sessionCacheGet<DecryptedReply>('replies-' + tPostTag);
			}
		}

		// Restore seen state from cache if opted in (use initialPosts to avoid reactive read of allTopicPosts)
		if (isOpted) untrack(() => mergeSeenState(loadSeenState(handle), initialPosts));
		const timer = setTimeout(() => { loadingPosts = false; }, 5000);

		// Cancel any debounced reopens from registerPostForReplies and open immediately
		if (resubDebounce) { clearTimeout(resubDebounce); resubDebounce = null; }
		openForumSub(currentRelays);

		return () => {
			clearTimeout(timer);
			if (resubDebounce) clearTimeout(resubDebounce);
			if (forumSub) { forumSub.close(); forumSub = null; }
			topicTagMap.clear();
			replyKeyMap.clear();
		};
	});

	// ─── Chat tag ───
	const chatTag = $derived.by(() => {
		if (!forumKeys) return '';
		return deriveChatTag(forumKeys.privkey);
	});

	// ─── Forum fingerprint (for sessionStorage keys) ───
	const forumFingerprint = $derived.by(() => {
		if (!forumKeys) return '';
		return bytesToHex(sha256(forumKeys.privkey)).slice(0, 16);
	});

	// ─── Chat persistence ───
	const CHAT_CLOSED_KEY = 'nowhere-forum-chat-closed';
	const chatManuallyClosed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CHAT_CLOSED_KEY) === '1';
	let chatJoined = $state(false);
	let previewBeforeChat = $state<ViewMode>('posts');
	let chatNotification = $state<'private' | 'default' | null>(null);

	// Auto-join chat when signed in, unless user manually closed it this session
	$effect(() => {
		if (signedIn && !chatJoined && !chatManuallyClosed) {
			chatJoined = true;
		}
	});

	// ─── Actions ───
	function selectTopic(topic: string) {
		activeTopic = topic;
		currentView = 'posts';
		activePost = null;
		// Clear unread count for this topic
		topicUnreadCounts[topic] = 0;
		// Mark all loaded posts in this topic as seen
		for (const post of (allTopicPosts[topic] ?? [])) {
			seenPostIds.add(post.eventId);
		}
		_trackingVersion++;
		scheduleSaveSeenState();
	}

	function selectView(view: string) {
		if (view === 'posts') {
			postNotification = false;
			if (currentView === 'chat') {
				// Restore the view we had before switching to chat
				currentView = previewBeforeChat;
			} else {
				currentView = 'posts';
				activePost = null;
			}
			// Mark all loaded posts in active topic as seen
			for (const post of (allTopicPosts[activeTopic] ?? [])) {
				seenPostIds.add(post.eventId);
			}
			_trackingVersion++;
			scheduleSaveSeenState();
		} else if (view === 'torrents') {
			currentView = 'torrents';
			activeTorrent = null;
		} else if (view === 'chat') {
			if (currentView !== 'chat') {
				previewBeforeChat = currentView;
			}
			currentView = 'chat';
		}
	}

	function selectPost(post: DecryptedPost) {
		activePost = post;
		currentView = 'post-detail';
		// Sync replies from the eagerly-fetched map
		replies = _repliesMap[post.eventId] ?? [];
		loadingReplies = !(post.eventId in _repliesMap);
		// Record that we've seen this many replies
		seenReplyCounts[post.eventId] = (_repliesMap[post.eventId] ?? []).length;
		seenPostIds.add(post.eventId);
		_trackingVersion++;
		scheduleSaveSeenState();
	}

	function goBack() {
		activePost = null;
		currentView = 'posts';
	}

	function selectTorrent(torrent: DecryptedTorrent) {
		activeTorrent = torrent;
		currentView = 'torrent-detail';
		torrentReplies = _repliesMap[torrent.eventId] ?? [];
		loadingTorrentReplies = !(torrent.eventId in _repliesMap);
	}

	function goBackFromTorrent() {
		activeTorrent = null;
		currentView = 'torrents';
	}

	async function handleCreatePost(title: string, body: string, link: string) {
		if (!forumKeys || relays.length === 0 || !canPost) return;
		publishing = true;
		try {
			const topicTag = deriveTopicTag(forumKeys.privkey, activeTopic);

			let nip07Sig: string | undefined;
			let wrappedContent: string | undefined;
			let timestamp: number | undefined;

			if (nip07Pubkey) {
				timestamp = Math.floor(Date.now() / 1000);
				const innerContent = JSON.stringify({ t: title, b: body || null, l: link || null, ts: timestamp });
				wrappedContent = wrapContentForSigning(innerContent);
				nip07Sig = await signInnerRumorNip07(wrappedContent, timestamp);
			}

			await publishForumPost(
				title,
				body || undefined,
				link || undefined,
				topicTag,
				forumKeys.pubkey,
				forumKeys.privkey,
				relays,
				authorPubkey,
				authorPrivkey,
				nip07Sig,
				wrappedContent,
				timestamp
			);
		} catch (e) {
			console.error('[Forum] Failed to publish post:', e);
		} finally {
			publishing = false;
		}
	}

	async function handleReply(body: string, quotedId?: string) {
		if (!activePost || !forumKeys || relays.length === 0 || !canPost) return;
		publishing = true;
		try {
			const postTag = derivePostTag(activePost.payload.t, activePost.payload.p, activePost.payload.ts);
			const replyKeys = deriveReplyKeypair(activePost.payload.t, activePost.payload.p, activePost.payload.ts);

			let nip07Sig: string | undefined;
			let wrappedContent: string | undefined;
			let timestamp: number | undefined;

			if (nip07Pubkey) {
				timestamp = Math.floor(Date.now() / 1000);
				const innerContent = JSON.stringify({ b: body, ts: timestamp });
				wrappedContent = wrapContentForSigning(innerContent);
				nip07Sig = await signInnerRumorNip07(wrappedContent, timestamp);
			}

			await publishForumReply(
				body,
				postTag,
				replyKeys.pubkey,
				replyKeys.privkey,
				relays,
				authorPubkey,
				authorPrivkey,
				quotedId,
				nip07Sig,
				wrappedContent,
				timestamp
			);
		} catch (e) {
			console.error('[Forum] Failed to publish reply:', e);
		} finally {
			publishing = false;
		}
	}

	async function handleCreateTorrent(torrentData: TorrentData) {
		if (!forumKeys || relays.length === 0 || !canPost) return;
		publishing = true;
		try {
			const tTorrentTag = deriveTopicTag(forumKeys.privkey, TORRENT_TOPIC_SEED);

			let nip07Sig: string | undefined;
			let wrappedContent: string | undefined;
			let timestamp: number | undefined;

			if (nip07Pubkey) {
				timestamp = Math.floor(Date.now() / 1000);
				wrappedContent = wrapContentForSigning(JSON.stringify(torrentData));
				nip07Sig = await signInnerRumorNip07(wrappedContent, timestamp);
			}

			await publishForumTorrent(
				torrentData,
				tTorrentTag,
				forumKeys.pubkey,
				forumKeys.privkey,
				relays,
				authorPubkey,
				authorPrivkey,
				nip07Sig,
				wrappedContent,
				timestamp
			);
			showTorrentSubmit = false;
		} catch (e) {
			console.error('[Forum] Failed to publish torrent:', e);
		} finally {
			publishing = false;
		}
	}

	async function handleTorrentReply(body: string, quotedId?: string) {
		if (!activeTorrent || !forumKeys || relays.length === 0 || !canPost) return;
		publishing = true;
		try {
			const tPostTag = deriveTorrentPostTag(activeTorrent.w);
			const tReplyKeys = deriveTorrentReplyKeypair(activeTorrent.w);

			let nip07Sig: string | undefined;
			let wrappedContent: string | undefined;
			let timestamp: number | undefined;

			if (nip07Pubkey) {
				timestamp = Math.floor(Date.now() / 1000);
				const innerContent = JSON.stringify({ b: body, ts: timestamp });
				wrappedContent = wrapContentForSigning(innerContent);
				nip07Sig = await signInnerRumorNip07(wrappedContent, timestamp);
			}

			await publishForumReply(
				body,
				tPostTag,
				tReplyKeys.pubkey,
				tReplyKeys.privkey,
				relays,
				authorPubkey,
				authorPrivkey,
				quotedId,
				nip07Sig,
				wrappedContent,
				timestamp
			);
		} catch (e) {
			console.error('[Forum] Failed to publish torrent reply:', e);
		} finally {
			publishing = false;
		}
	}

	// ─── Preview mode ───
	const isPreview = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return new URLSearchParams(window.location.search).has('preview');
	});

	// ─── Voice chat ───
	const voiceEnabled = $derived(false && !!data?.tags?.some((t: Tag) => t.key === 'V' && t.value === undefined));

	let activeMesh = $state<VoiceMesh | null>(null);
	let activeVoiceChannel = $state('');
	let voiceMuted = $state(false);
	let voiceBarRef = $state<{ onPeerAudio: (pubkey: string, stream: MediaStream) => void; onPeerLeft: (pubkey: string) => void } | undefined>(undefined);
	let showIpWarning = $state(false);
	let pendingVoice = $state<{ channelKey: string; recipientPubkey: string } | null>(null);

	function ipWarningAcknowledged(): boolean {
		if (typeof sessionStorage === 'undefined') return false;
		return sessionStorage.getItem('nowhere-voice-ip-warned') === '1';
	}

	function acknowledgeIpWarning() {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('nowhere-voice-ip-warned', '1');
		}
		showIpWarning = false;
		if (pendingVoice) {
			const { channelKey, recipientPubkey } = pendingVoice;
			pendingVoice = null;
			startVoice(channelKey, recipientPubkey);
		}
	}

	function dismissIpWarning() {
		showIpWarning = false;
		pendingVoice = null;
	}

	async function startVoice(channelKey: string, recipientPubkey: string) {
		if (!forumKeys || !chatTag) return;
		if (!recipientPubkey) return;

		if (!ipWarningAcknowledged()) {
			pendingVoice = { channelKey, recipientPubkey };
			showIpWarning = true;
			return;
		}

		// Tear down any existing call first
		if (activeMesh) {
			activeMesh.destroy();
			activeMesh = null;
			activeVoiceChannel = '';
		}

		const currentChatTag = chatTag;
		const currentRelays = relays;
		const currentSessionKeys = sessionKeys;
		const currentAuthorPubkey = authorPubkey;
		const currentAuthorPrivkey = authorPrivkey;

		const mesh = new VoiceMesh(currentSessionKeys.pubkey, channelKey, {
			onPeerJoined: () => { activeMesh = activeMesh; }, // trigger reactivity for VoiceBar peer list
			onPeerLeft: (pubkey) => {
				voiceBarRef?.onPeerLeft(pubkey);
				activeMesh = activeMesh;
			},
			onPeerAudio: (pubkey, stream) => {
				voiceBarRef?.onPeerAudio(pubkey, stream);
			},
			onPeerMute: () => { activeMesh = activeMesh; },
			onPeerStateChange: () => { activeMesh = activeMesh; },
			sendSignal: (partial) => {
				const signal: VoiceSignal = {
					v: 1,
					voice: true,
					...partial,
					p: currentSessionKeys.pubkey,
					ap: currentAuthorPubkey,
					ch: channelKey,
					ts: Math.floor(Date.now() / 1000)
				} as VoiceSignal;
				if (signal.type === 'join' && currentAuthorPrivkey) {
					signJoinSignal(signal, currentAuthorPrivkey);
				}
				publishVoiceSignal(signal, currentChatTag, recipientPubkey, currentRelays);
			}
		});

		activeMesh = mesh;
		activeVoiceChannel = channelKey;
		voiceMuted = false;

		try {
			await mesh.start();
		} catch (e) {
			console.error('[Voice] Failed to start:', e);
			activeMesh = null;
			activeVoiceChannel = '';
		}
	}

	function leaveVoice() {
		if (activeMesh) {
			activeMesh.destroy();
			activeMesh = null;
			activeVoiceChannel = '';
			voiceMuted = false;
		}
	}

	function toggleVoiceMute() {
		voiceMuted = !voiceMuted;
		activeMesh?.setMuted(voiceMuted);
	}

	// Route incoming voice signals to the active mesh.
	// Private channels use channel key remapping: A calls B using 'private:B_ap' as the key.
	// B's active mesh (if B accepted) uses 'private:A_ap'. The ap field enables correct routing.
	function onVoiceSignalHandler(signal: VoiceSignal) {
		if (!activeMesh) return;

		let routeKey = signal.ch;

		// Private channel remapping: signal.ch may use the other party's author pubkey.
		// Try matching via ap (sender's author pubkey) if direct match fails.
		if (signal.ch.startsWith('private:') && signal.ch !== activeVoiceChannel) {
			const remapped = 'private:' + (signal.ap || signal.p);
			if (remapped === activeVoiceChannel) {
				routeKey = activeVoiceChannel;
			}
		}

		if (routeKey === activeVoiceChannel) {
			activeMesh.handleSignal(signal);
		}
	}

	// Clean up voice on page unload / component destroy
	$effect(() => {
		return () => { leaveVoice(); };
	});

	// ─── Post profile card ───
	let postProfileCardPubkey = $state('');
	let postProfileCardData = $state<{
		phrase: string;
		npubFull: string;
		npubTruncated: string;
		avatarSvg: string;
		name: string;
		picture: string;
		nip05: string;
		nip05Verified: boolean | null;
		about: string;
	}>({ phrase: '', npubFull: '', npubTruncated: '', avatarSvg: '', name: '', picture: '', nip05: '', nip05Verified: null, about: '' });
	let postProfileCardCopied = $state(false);
	const showPostProfileCard = $derived(postProfileCardPubkey !== '');

	async function openPostProfileCard(pubkey: string) {
		postProfileCardPubkey = pubkey;
		postProfileCardCopied = false;
		postProfileCardData = { phrase: '', npubFull: '', npubTruncated: '', avatarSvg: '', name: '', picture: '', nip05: '', nip05Verified: null, about: '' };

		try {
			const npub = npubEncode(pubkey);
			postProfileCardData.npubFull = npub;
			postProfileCardData.npubTruncated = npub.slice(0, 12) + '...' + npub.slice(-4);
		} catch {
			postProfileCardData.npubFull = pubkey;
			postProfileCardData.npubTruncated = pubkey.slice(0, 8) + '...';
		}

		try {
			const fp = await computeSellerFingerprint(pubkey);
			postProfileCardData.phrase = computeVerificationPhrase(fp, 6);
		} catch {}

		try {
			const { generateAvatar } = await import('$lib/nowhere-avatar.js');
			postProfileCardData.avatarSvg = generateAvatar(pubkey, 56);
		} catch {}

		if (privacyMode === 0) {
			try {
				const event = await fetchProfile({ kinds: [0], authors: [pubkey], limit: 1 }, profileRelays, forumCacheHandle ?? undefined);
				if (event?.content) {
					const p = JSON.parse(event.content);
					postProfileCardData.name = p.display_name || p.name || '';
					postProfileCardData.picture = sanitizeImageUrl(p.picture || '');
					postProfileCardData.nip05 = p.nip05 || '';
					postProfileCardData.nip05Verified = null;
					postProfileCardData.about = p.about || '';
					if (p.nip05) {
						verifyNip05(p.nip05, pubkey).then(verified => {
							postProfileCardData.nip05Verified = verified;
						});
					}
				}
			} catch {}
		}
	}

	async function verifyNip05(identifier: string, pubkeyHex: string): Promise<boolean> {
		try {
			const atIdx = identifier.lastIndexOf('@');
			const local = atIdx >= 0 ? identifier.slice(0, atIdx) : '_';
			const domain = atIdx >= 0 ? identifier.slice(atIdx + 1) : identifier;
			if (!domain) return false;
			const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local)}`;
			const res = await fetch(url);
			if (!res.ok) return false;
			const data = await res.json();
			return data?.names?.[local]?.toLowerCase() === pubkeyHex.toLowerCase();
		} catch {
			return false;
		}
	}

	function closePostProfileCard() { postProfileCardPubkey = ''; }

	async function copyPostProfileNpub() {
		try {
			await navigator.clipboard.writeText(postProfileCardData.npubFull);
			postProfileCardCopied = true;
			setTimeout(() => { postProfileCardCopied = false; }, 2000);
		} catch {}
	}

	// ─── Post sharing ───
	const sharingEnabled = $derived(!data?.tags?.some((t: Tag) => t.key === 'S' && t.value === undefined));

	// ─── QR sharing ───
	const qrSharingEnabled = $derived(!data?.tags?.some((t: Tag) => t.key === '9' && t.value === undefined));

	// Deep-link: auto-navigate to shared post (only if sharing enabled)
	$effect(() => {
		const targetId = $postIdFromHash;
		if (!targetId || posts.length === 0) return;
		if (!sharingEnabled) {
			postIdFromHash.set('');
			return;
		}
		const match = posts.find(p => p.eventId.startsWith(targetId));
		if (match) {
			selectPost(match);
			postIdFromHash.set('');
		}
	});

	function handleSharePost(post: DecryptedPost) {
		const postId = post.eventId.slice(0, 16);
		let hashPart = fragment;
		if (salt) {
			const saltB64 = bytesToBase64url(new TextEncoder().encode(salt));
			hashPart += '*' + saltB64;
		}
		const url = window.location.origin + window.location.pathname + '#' + hashPart + '~' + postId;
		navigator.clipboard.writeText(url);
	}
</script>

{#if data}
<div class="forum-page" class:dark={isDark}>
	{#if TESTING_MODE}
		<div class="forum-testing-banner">TESTING - NO RELAY</div>
	{:else if USE_LOCAL_RELAY}
		<div class="forum-testing-banner local-relay">LOCAL RELAY</div>
	{:else if USE_PTR_RELAY}
		<div class="forum-testing-banner ptr-relay"><span class="ptr-line">CONNECTED TO PRIVATE RELAY</span><span class="ptr-dash"> — </span><span class="ptr-line">TESTING ONLY</span></div>
	{/if}

	<div class="forum-top-header">
		<a href="https://hostednowhere.com">nowhere</a>
		<span class="forum-top-header-sep">·</span>
		<span class="forum-top-header-type">Forum</span>
	</div>

	<ForumHeader
		name={data.name}
		description={data.description}
		image={data.image}
		{verificationPhrase}
		signed={$siteSigned}
		{privacyMode}
		{saltEnabled}
		{salt}
		onSaltChange={setSalt}
		{qrSharingEnabled}
		{persistEnabled}
		{hasAnyHistory}
		onEnableHistory={handleEnableHistory}
		onDisableHistory={handleDisableHistory}
		onClearAll={handleClearAll}
	/>

	<TopicTabs
		topics={customTopics}
		{activeTopic}
		{currentView}
		onSelectTopic={selectTopic}
		onSelectView={selectView}
		{identityMode}
		{privacyMode}
		{authorPubkey}
		{nip07Pubkey}
		{canPost}
		{connectError}
		onConnectNip07={connectNip07}
		onDisconnectNip07={disconnectNip07}
		onStartAnon={startAnon}
		bind:identityOpen
		{chatNotification}
		{postNotification}
		{topicUnreadCounts}
		{torrentEnabled}
	/>

	{#if !isPreview}
		<button class="forum-theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
			{#if isDark}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
			{:else}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
			{/if}
		</button>
	{/if}

	<main class="forum-main">
		{#if wotLoading}
			<div class="forum-loading">Building trust network...</div>
		{:else if currentView === 'posts'}
			<PostList
				{posts}
				{privacyMode}
				{postSizeLimit}
				{publishing}
				{canPost}
				wotBlocked={postWotBlocked}
				loading={loadingPosts}
				onSelectPost={selectPost}
				onCreatePost={handleCreatePost}
				onSignIn={() => { identityOpen = true; }}
				{replyCountMap}
				{newReplyCountMap}
				{newPostIds}
				onMarkAllRead={markAllRead}
				{profileRelays}
				forumCache={forumCacheReactive ?? undefined}
				onOpenProfileCard={openPostProfileCard}
				{activeTopic}
			/>
		{:else if currentView === 'post-detail' && activePost}
			<PostDetail
				post={activePost}
				{replies}
				{privacyMode}
				{postSizeLimit}
				{publishing}
				{canPost}
				wotBlocked={replyWotBlocked}
				loadingReplies={loadingReplies}
				onBack={goBack}
				onReply={handleReply}
				onSignIn={() => { identityOpen = true; }}
				onSharePost={sharingEnabled ? handleSharePost : undefined}
				newReplyCount={newReplyCountMap[activePost.eventId] ?? 0}
				{profileRelays}
				forumCache={forumCacheReactive ?? undefined}
				onOpenProfileCard={openPostProfileCard}
			/>
		{:else if currentView === 'torrents' && torrentEnabled}
			<TorrentList
				torrents={allTorrents}
				topCategories={torrentCategories}
				canSubmit={canPost && !torrentWotBlocked}
				wotBlocked={torrentWotBlocked}
				loading={false}
				onSelectTorrent={selectTorrent}
				onSignIn={() => { identityOpen = true; }}
				{privacyMode}
				{profileRelays}
				categoriesFixed={torrentCategoriesFixed}
				{publishing}
				rules={torrentRules}
				onSubmitTorrent={handleCreateTorrent}
				bind:drillPath={torrentDrillPath}
			/>

		{:else if currentView === 'torrent-detail' && activeTorrent}
			<TorrentDetail
				torrent={activeTorrent}
				replies={torrentReplies}
				{privacyMode}
				{postSizeLimit}
				{publishing}
				{canPost}
				wotBlocked={replyWotBlocked}
				loadingReplies={loadingTorrentReplies}
				onBack={goBackFromTorrent}
				onCategoryClick={(path) => { torrentDrillPath = path; goBackFromTorrent(); }}
				onReply={handleTorrentReply}
				onSignIn={() => { identityOpen = true; }}
				{profileRelays}
				onOpenProfileCard={openPostProfileCard}
			/>
		{/if}

		{#if (chatJoined || currentView === 'chat') && chatTag && forumKeys}
			<div class:forum-chat-hidden={currentView !== 'chat'}>
				<ChatPanel
					{chatTag}
					forumPubkey={forumKeys.pubkey}
					forumPrivkey={forumKeys.privkey}
					{relays}
					{privacyMode}
					{authorPubkey}
					{authorPrivkey}
					sessionPrivkey={sessionKeys.privkey}
					sessionPubkey={sessionKeys.pubkey}
					{canPost}
					onSignIn={() => { identityOpen = true; }}
					{forumFingerprint}
					visible={currentView === 'chat'}
					onJoined={() => { chatJoined = true; sessionStorage.removeItem(CHAT_CLOSED_KEY); }}
					onClose={() => { chatJoined = false; chatNotification = null; sessionStorage.setItem(CHAT_CLOSED_KEY, '1'); }}
					onNotification={(level) => { chatNotification = level; }}
					{voiceEnabled}
					{nip07Pubkey}
					autoJoin={!chatManuallyClosed}
					{profileRelays}
					forumCache={forumCacheReactive ?? undefined}
					onRequestVoice={startVoice}
					onLeaveVoice={leaveVoice}
					onVoiceSignal={onVoiceSignalHandler}
					{activeVoiceChannel}
					wotSet={chatWotSet}
					wotBlocked={chatWotBlocked}
				/>
			</div>
		{/if}
	</main>

	<ForumFooter
		{data}
		{verificationPhrase}
		{creatorSellerPhrase}
		{creatorProfile}
		{privacyMode}
		signed={$siteSigned}
		{saltEnabled}
		{identityMode}
		{wotPostDepth}
		{wotReplyDepth}
		{wotChatDepth}
	/>

	{#if activeMesh && activeVoiceChannel}
		<VoiceBar
			bind:this={voiceBarRef}
			mesh={activeMesh}
			channelKey={activeVoiceChannel}
			{privacyMode}
			sessionPubkey={sessionKeys.pubkey}
			muted={voiceMuted}
			onToggleMute={toggleVoiceMute}
			onLeave={leaveVoice}
			{profileRelays}
		/>
	{/if}

	{#if showPostProfileCard}
		<div class="forum-profile-overlay" onclick={closePostProfileCard} onkeydown={(e) => { if (e.key === 'Escape') closePostProfileCard(); }} role="button" tabindex="-1">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="chat-profile-card" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
				<div class="chat-profile-card-top">
					{#if privacyMode === 0 && postProfileCardData.picture}
						<img class="chat-profile-card-photo" src={postProfileCardData.picture} alt="" width="56" height="56" />
					{:else if postProfileCardData.avatarSvg}
						<span class="chat-profile-card-avatar">{@html sanitizeSvg(postProfileCardData.avatarSvg)}</span>
					{/if}
					<div class="chat-profile-card-info">
						{#if privacyMode === 0 && postProfileCardData.name}
							<div class="chat-profile-card-name">{postProfileCardData.name}</div>
						{/if}
						{#if postProfileCardData.phrase}
							<div class="chat-profile-card-phrase">@{postProfileCardData.phrase}</div>
						{/if}
					</div>
				</div>

				{#if privacyMode === 0 && postProfileCardData.nip05}
					<div class="chat-profile-card-nip05" class:nip05-verified={postProfileCardData.nip05Verified === true} class:nip05-failed={postProfileCardData.nip05Verified === false}>
						{postProfileCardData.nip05.startsWith('_@') ? postProfileCardData.nip05.slice(2) : postProfileCardData.nip05}
						{#if postProfileCardData.nip05Verified === true}
							<svg class="nip05-check-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 8 6 12 14 4"/></svg>
						{/if}
					</div>
				{/if}
				{#if privacyMode === 0 && postProfileCardData.about}
					<div class="chat-profile-card-about">{postProfileCardData.about}</div>
				{/if}

				<button class="chat-profile-card-npub" onclick={copyPostProfileNpub} title="Click to copy">
					<span class="chat-profile-card-npub-text">{postProfileCardData.npubTruncated}</span>
					<span class="chat-profile-card-npub-action">{postProfileCardCopied ? 'Copied!' : 'Copy'}</span>
				</button>
			</div>
		</div>
	{/if}

	{#if showIpWarning}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="chat-room-dialog-overlay" onclick={dismissIpWarning} role="button" tabindex="-1">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="chat-room-dialog voice-ip-dialog" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
				<h3>Voice chat exposes your IP address</h3>

				<p class="voice-ip-section-label">During connection setup</p>
				<p>STUN servers briefly see your IP address to help your browser discover how it appears on the internet. They see your IP only — not your identity or call content.</p>
				<p>Two open-source STUN servers are always contacted: stunprotocol.org (independent) and Jitsi (open source project). Cloudflare is only contacted as a backup if both of those fail to establish a connection.</p>

				<p class="voice-ip-section-label">During the call</p>
				<p>Who can see your IP in the connection data depends on the channel:</p>
				<ul class="voice-ip-list">
					<li><strong>General chat</strong> — anyone who has the forum URL</li>
					<li><strong>Room</strong> — anyone with the room access code</li>
					<li><strong>Private call</strong> — only the person you are calling</li>
				</ul>

				<p class="voice-ip-section-label">Your audio</p>
				<p>Audio is encrypted between participants using DTLS-SRTP. The STUN servers and any relay infrastructure cannot intercept or hear the call.</p>

				<p class="voice-ip-vpn">Use a VPN to hide your IP from all of the above.</p>

				<div class="chat-room-dialog-actions">
					<button class="form-cancel-btn" onclick={dismissIpWarning}>Cancel</button>
					<button class="form-submit-btn" onclick={acknowledgeIpWarning}>I understand, connect</button>
				</div>
			</div>
		</div>
	{/if}
</div>
{/if}

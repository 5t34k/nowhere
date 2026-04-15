import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt, getConversationKey } from 'nostr-tools/nip44';
import { NOWHERE_CONV_KEY } from './nowhere-signing.js';
import type { DecryptedPost, DecryptedReply, DecryptedTorrent } from './forum-events.js';

export interface SeenState {
	// 8-char eventId prefix → seen reply count (0 = seen, >0 = seen with N replies)
	posts: Record<string, number>;
}

export interface ForumCache {
	convKey: Uint8Array;
	prefix: string;
}

const INDEX_KEY = 'nwfc-index';

// ─── Index helpers ───

function readIndex(): Record<string, boolean> {
	if (typeof localStorage === 'undefined') return {};
	const raw = localStorage.getItem(INDEX_KEY);
	if (!raw) return {};
	try {
		return JSON.parse(nip44Decrypt(raw, NOWHERE_CONV_KEY));
	} catch { return {}; }
}

function writeIndex(index: Record<string, boolean>): void {
	if (typeof localStorage === 'undefined') return;
	if (Object.keys(index).length === 0) {
		localStorage.removeItem(INDEX_KEY);
		return;
	}
	try {
		localStorage.setItem(INDEX_KEY, nip44Encrypt(JSON.stringify(index), NOWHERE_CONV_KEY));
	} catch { /* quota */ }
}

export function isOptedIn(prefix: string): boolean {
	return readIndex()[prefix] === true;
}

export function setOptIn(prefix: string, value: boolean): void {
	const index = readIndex();
	if (value) {
		index[prefix] = true;
	} else {
		delete index[prefix];
	}
	writeIndex(index);
}

export function hasAnyCachedHistory(): boolean {
	if (typeof localStorage === 'undefined') return false;
	const raw = localStorage.getItem(INDEX_KEY);
	if (!raw) return false;
	try {
		const index = JSON.parse(nip44Decrypt(raw, NOWHERE_CONV_KEY));
		return Object.keys(index).length > 0;
	} catch { return false; }
}

// ─── Init ───

export function initCache(forumPrivkey: Uint8Array, forumPubkey: string): ForumCache {
	const pubkeyBytes = new TextEncoder().encode(forumPubkey);
	const prefix = 'nwfc-' + bytesToHex(sha256(pubkeyBytes)).slice(0, 16);
	const convKey = getConversationKey(forumPrivkey, forumPubkey);
	return { convKey, prefix };
}

// ─── Local key derivation ───
// Derived from convKey + relay-visible tag so localStorage keys cannot be
// cross-referenced with relay traffic without knowing the forum URL.

function localTopicKey(cache: ForumCache, topicTag: string): string {
	const tagBytes = new TextEncoder().encode(topicTag);
	const input = new Uint8Array(cache.convKey.length + tagBytes.length);
	input.set(cache.convKey, 0);
	input.set(tagBytes, cache.convKey.length);
	return bytesToHex(sha256(input)).slice(0, 16);
}

function localPostKey(cache: ForumCache, postTag: string): string {
	const tagBytes = new TextEncoder().encode(postTag);
	const input = new Uint8Array(cache.convKey.length + tagBytes.length);
	input.set(cache.convKey, 0);
	input.set(tagBytes, cache.convKey.length);
	return bytesToHex(sha256(input)).slice(0, 16);
}

// ─── Encrypt / decrypt helpers ───

function enc(value: unknown, convKey: Uint8Array): string {
	return nip44Encrypt(JSON.stringify(value), convKey);
}

function dec<T>(raw: string, convKey: Uint8Array): T | null {
	try {
		return JSON.parse(nip44Decrypt(raw, convKey)) as T;
	} catch { return null; }
}

// ─── Seen state ───

export function loadSeenState(cache: ForumCache): SeenState {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return { posts: {} };
	const raw = localStorage.getItem(cache.prefix + '-seen');
	if (!raw) return { posts: {} };
	return dec<SeenState>(raw, cache.convKey) ?? { posts: {} };
}

export function saveSeenState(cache: ForumCache, state: SeenState): void {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(cache.prefix + '-seen', enc(state, cache.convKey));
	} catch { /* quota */ }
}

// ─── Posts ───

export function loadPosts(cache: ForumCache, topicTag: string): DecryptedPost[] {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return [];
	const key = cache.prefix + '-p-' + localTopicKey(cache, topicTag);
	const raw = localStorage.getItem(key);
	if (!raw) return [];
	return dec<DecryptedPost[]>(raw, cache.convKey) ?? [];
}

export function savePosts(cache: ForumCache, topicTag: string, posts: DecryptedPost[]): void {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return;
	const key = cache.prefix + '-p-' + localTopicKey(cache, topicTag);
	try {
		localStorage.setItem(key, enc(posts, cache.convKey));
	} catch { /* quota */ }
}

// ─── Replies ───

export function loadReplies(cache: ForumCache, postTag: string): DecryptedReply[] {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return [];
	const key = cache.prefix + '-r-' + localPostKey(cache, postTag);
	const raw = localStorage.getItem(key);
	if (!raw) return [];
	return dec<DecryptedReply[]>(raw, cache.convKey) ?? [];
}

export function saveReplies(cache: ForumCache, postTag: string, replies: DecryptedReply[]): void {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return;
	const key = cache.prefix + '-r-' + localPostKey(cache, postTag);
	try {
		localStorage.setItem(key, enc(replies, cache.convKey));
	} catch { /* quota */ }
}

// ─── Torrents ───

export function loadTorrents(cache: ForumCache, topicTag: string): DecryptedTorrent[] {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return [];
	const key = cache.prefix + '-t-' + localTopicKey(cache, topicTag);
	const raw = localStorage.getItem(key);
	if (!raw) return [];
	return dec<DecryptedTorrent[]>(raw, cache.convKey) ?? [];
}

export function saveTorrents(cache: ForumCache, topicTag: string, torrents: DecryptedTorrent[]): void {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return;
	const key = cache.prefix + '-t-' + localTopicKey(cache, topicTag);
	try {
		localStorage.setItem(key, enc(torrents, cache.convKey));
	} catch { /* quota */ }
}

// ─── Clear ───

export function clearCache(cache: ForumCache): void {
	if (typeof localStorage === 'undefined') return;
	const keysToRemove: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k && k.startsWith(cache.prefix)) keysToRemove.push(k);
	}
	for (const k of keysToRemove) localStorage.removeItem(k);
	setOptIn(cache.prefix, false);
}

export function clearAllCache(): void {
	if (typeof localStorage === 'undefined') return;
	const keysToRemove: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k && k.startsWith('nwfc-')) keysToRemove.push(k);
	}
	for (const k of keysToRemove) localStorage.removeItem(k);
}

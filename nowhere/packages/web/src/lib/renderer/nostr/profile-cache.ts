import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44';
import { isOptedIn, type ForumCache } from './forum-cache.js';

export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedProfile {
	content: string;
	fetchedAt: number;
}

function localProfileKey(cache: ForumCache, pubkey: string): string {
	const pkBytes = new TextEncoder().encode(pubkey);
	const input = new Uint8Array(cache.convKey.length + pkBytes.length);
	input.set(cache.convKey, 0);
	input.set(pkBytes, cache.convKey.length);
	return bytesToHex(sha256(input)).slice(0, 16);
}

function storageKey(cache: ForumCache, pubkey: string): string {
	return cache.prefix + '-prof-' + localProfileKey(cache, pubkey);
}

export function loadProfile(cache: ForumCache, pubkey: string): CachedProfile | null {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(storageKey(cache, pubkey));
	if (!raw) return null;
	try {
		return JSON.parse(nip44Decrypt(raw, cache.convKey)) as CachedProfile;
	} catch {
		return null;
	}
}

export function saveProfile(cache: ForumCache, pubkey: string, content: string): void {
	if (!isOptedIn(cache.prefix) || typeof localStorage === 'undefined') return;
	const entry: CachedProfile = { content, fetchedAt: Date.now() };
	try {
		localStorage.setItem(storageKey(cache, pubkey), nip44Encrypt(JSON.stringify(entry), cache.convKey));
	} catch { /* quota */ }
}

export function isProfileFresh(entry: CachedProfile): boolean {
	return Date.now() - entry.fetchedAt < PROFILE_TTL_MS;
}

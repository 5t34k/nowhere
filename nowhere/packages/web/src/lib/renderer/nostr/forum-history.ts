import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44';
import { nip44Encrypt as activeNip44Encrypt, nip44Decrypt as activeNip44Decrypt } from '$lib/nostr/nip07.js';

const HISTORY_PREFIX = 'nw-';

export interface ViewingHistory {
	// Maps 8-char eventId prefix → seen reply count
	posts: Record<string, number>;
}

export interface HistoryHandle {
	convKey: Uint8Array;
	storageKey: string;
	encKey: string; // NIP-07 nip44-encrypted symmetric key (preserved for saves)
}

interface StoredBlob {
	k: string; // NIP-07 nip44-encrypted symmetric key
	d: string; // nip44-encrypted history data (using symKey as conversation key)
}

function storageKeyForPubkey(pubkey: string): string {
	const hash = sha256(new TextEncoder().encode(pubkey));
	return HISTORY_PREFIX + bytesToHex(hash).slice(0, 32);
}

/**
 * Load existing history. Requires one NIP-07 nip44.decrypt call to unwrap
 * the symmetric key. Returns null if no history exists or decryption fails.
 */
export async function loadHistory(pubkey: string): Promise<{ handle: HistoryHandle; history: ViewingHistory } | null> {
	const storageKey = storageKeyForPubkey(pubkey);
	const raw = localStorage.getItem(storageKey);
	if (!raw) return null;

	try {
		const blob: StoredBlob = JSON.parse(raw);
		if (!blob.k || !blob.d) return null;

		// Active-signer decrypt to recover the symmetric key (one prompt)
		const symKeyHex = await activeNip44Decrypt(pubkey, blob.k);
		const convKey = hexToBytes(symKeyHex);

		// Decrypt the history data (no NIP-07 prompt)
		const json = nip44Decrypt(blob.d, convKey);
		const parsed = JSON.parse(json);
		if (!parsed || typeof parsed.posts !== 'object') return null;

		return {
			handle: { convKey, storageKey, encKey: blob.k },
			history: parsed as ViewingHistory
		};
	} catch {
		return null;
	}
}

/**
 * Create a new history handle. Generates a random symmetric key and
 * wraps it via NIP-07 nip44.encrypt (one prompt).
 */
export async function createHistoryHandle(pubkey: string): Promise<HistoryHandle> {
	const convKey = new Uint8Array(32);
	crypto.getRandomValues(convKey);

	// Active-signer encrypt the symmetric key to self (one prompt)
	const encKey = await activeNip44Encrypt(pubkey, bytesToHex(convKey));
	const storageKey = storageKeyForPubkey(pubkey);

	return { convKey, storageKey, encKey };
}

/** Save history data. Sync — uses in-memory convKey, no NIP-07 prompt. */
export function saveHistory(handle: HistoryHandle, history: ViewingHistory): void {
	const blob: StoredBlob = {
		k: handle.encKey,
		d: nip44Encrypt(JSON.stringify(history), handle.convKey)
	};
	localStorage.setItem(handle.storageKey, JSON.stringify(blob));
}

export function clearHistory(storageKey: string): void {
	localStorage.removeItem(storageKey);
}

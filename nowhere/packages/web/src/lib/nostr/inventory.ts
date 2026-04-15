import { getConversationKey, encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44';
import { computeLookupHash, deriveInventoryKeypair } from './inventory-keys.js';
import { publishToRelays, fetchEvent, getInventoryRelays } from '$lib/renderer/nostr/relay-pool.js';
import { NOWHERE_DTAG_PREFIX, NOWHERE_T_TAG } from '$lib/renderer/nostr/constants.js';
import { nip44Encrypt as nip07Encrypt, signEvent } from './nip07.js';
import type { Tag } from '@nowhere/codec';

export type StockLevel = 0 | 1 | 2 | 3;

export interface StatusPayload {
	v: 1;
	notice?: string;
	closed?: string;
	redirect?: string;
	items?: Record<string, StockLevel>;
	variants?: Record<string, Record<string, StockLevel>>;
	low?: { warn?: boolean; fields?: string; refund?: boolean };
}

/**
 * Publish a store status/inventory event.
 * Uses NIP-07 extension for signing and encryption.
 * The event is encrypted to the inventory keypair derived from the store fragment.
 */
export async function publishStatus(
	payload: StatusPayload,
	storeFragment: string,
	storeTags: Tag[]
): Promise<void> {
	const { pubkey: inventoryPubkey } = deriveInventoryKeypair(storeFragment);
	const lookupHash = computeLookupHash(storeFragment);

	// Encrypt payload to the inventory pubkey using NIP-07
	const content = await nip07Encrypt(inventoryPubkey, JSON.stringify(payload));

	// Sign with NIP-07 (seller's key)
	const event = await signEvent({
		kind: 30078,
		created_at: Math.floor(Date.now() / 1000),
		content,
		tags: [
			['d', `${NOWHERE_DTAG_PREFIX}/${lookupHash}`],
			['t', NOWHERE_T_TAG]
		]
	});

	const relays = getInventoryRelays(storeTags);
	await publishToRelays(event, relays, 'inventory status');
}

/**
 * Fetch and decrypt the current store status from relays.
 * This is used by the renderer (buyer-side) — no NIP-07 needed.
 * Decrypts using the inventory keypair derived from the store fragment.
 */
export async function fetchStatus(
	storeFragment: string,
	storePubkeyHex: string,
	storeTags: Tag[]
): Promise<StatusPayload | null> {
	const { privkey } = deriveInventoryKeypair(storeFragment);
	const lookupHash = computeLookupHash(storeFragment);
	const relays = getInventoryRelays(storeTags);

	const event = await fetchEvent(
		{
			kinds: [30078],
			authors: [storePubkeyHex],
			'#d': [`${NOWHERE_DTAG_PREFIX}/${lookupHash}`]
		},
		relays
	);

	if (!event) return null;

	try {
		const conversationKey = getConversationKey(privkey, event.pubkey);
		const plaintext = nip44Decrypt(event.content, conversationKey);
		const parsed = JSON.parse(plaintext);
		if (parsed.v === 1) return parsed as StatusPayload;
		return null;
	} catch {
		console.warn('[Nowhere] Failed to decrypt inventory status');
		return null;
	}
}

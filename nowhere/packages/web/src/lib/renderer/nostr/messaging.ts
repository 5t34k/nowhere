import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';
import { publishToRelays } from './relay-pool.js';
import { NOWHERE_DTAG_PREFIX, NOWHERE_T_TAG } from './constants.js';
import type { OrderMessage } from '$lib/renderer/payment/order.js';

// Set to true to skip all relay publishing (no network calls at all).
// Set to false + USE_LOCAL_RELAY=true in relay-pool.ts to publish to local relay only.
export const TESTING_MODE = false;

export type { OrderMessage };

// Receipt format: full Nostr event encrypted to seller pubkey using a fresh ephemeral key.
// { v: 1, p: <hex ephemeral pubkey>, c: <NIP-44 ciphertext of full event JSON> }
export interface OrderReceipt {
	v: 1;
	p: string;
	c: string;
}

// Returns the receipt JSON string. Throws on failure.
export async function publishOrder(
	order: OrderMessage,
	sellerPubkeyHex: string,
	relays: string[]
): Promise<string> {
	if (TESTING_MODE) {
		console.log('[Nowhere] TESTING MODE - skipping publish for order', order.orderId);
		return '';
	}

	console.log('[Nowhere] Publishing order', order.orderId, 'for', sellerPubkeyHex.slice(0, 8) + '...');

	// Generate ephemeral throwaway keypair
	const sk = generateSecretKey();
	const pk = getPublicKey(sk);
	console.log('[Nowhere] Ephemeral pubkey:', pk.slice(0, 8) + '...');

	// NIP-44 encrypt order data to the seller's pubkey
	const conversationKey = getConversationKey(sk, sellerPubkeyHex);
	const content = nip44Encrypt(JSON.stringify(order), conversationKey);

	// Create kind:30078 (NIP-78) event with nowhr d-tag and t-tag
	const event = finalizeEvent(
		{
			kind: 30078,
			created_at: Math.floor(Date.now() / 1000),
			content,
			tags: [
				['d', `${NOWHERE_DTAG_PREFIX}/${order.orderId}`],
				['t', NOWHERE_T_TAG]
			]
		},
		sk
	);

	await publishToRelays(event, relays, 'NIP-78 order');

	// Generate receipt: encrypt full event to seller using a fresh ephemeral key.
	// A separate key is used so the receipt is independent of the order relay event.
	const receiptSk = generateSecretKey();
	const receiptPk = getPublicKey(receiptSk);
	const receiptConvKey = getConversationKey(receiptSk, sellerPubkeyHex);
	const receiptCiphertext = nip44Encrypt(JSON.stringify(event), receiptConvKey);
	const receipt: OrderReceipt = { v: 1, p: receiptPk, c: receiptCiphertext };

	return JSON.stringify(receipt);
}

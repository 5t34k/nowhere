import { sha256 } from '@noble/hashes/sha2.js';
import { getPublicKey, verifyEvent, getEventHash } from 'nostr-tools/pure';
import { encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';

const enc = new TextEncoder();
const NOWHERE_SIGNING_KEY = sha256(enc.encode('nowhere-forum-signing-v1'));
const NOWHERE_SIGNING_PUBKEY = getPublicKey(NOWHERE_SIGNING_KEY);
export const NOWHERE_CONV_KEY = getConversationKey(NOWHERE_SIGNING_KEY, NOWHERE_SIGNING_PUBKEY);

export const NOWHERE_PREFIX = 'Signed for nowhere - nowhr.xyz\n';

/** Ephemeral kind — relays won't store if rebroadcast */
export const INNER_EVENT_KIND = 21423;

/** Wrap content with nowhere-scoped encryption for inner signing */
export function wrapContentForSigning(content: string): string {
	const encrypted = nip44Encrypt(content, NOWHERE_CONV_KEY);
	return NOWHERE_PREFIX + encrypted;
}

/** Verify an inner signature by reconstructing the ephemeral event */
export function verifyInnerSignature(
	pubkey: string, sig: string, wrappedContent: string, timestamp: number
): boolean {
	const event = {
		kind: INNER_EVENT_KIND,
		created_at: timestamp,
		content: wrappedContent,
		tags: [] as string[][],
		pubkey,
		sig,
		id: ''
	};
	event.id = getEventHash(event);
	return verifyEvent(event);
}

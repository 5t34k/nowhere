import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from 'nostr-tools/pure';

export function computeLookupHash(fragment: string): string {
	return bytesToHex(sha256(new TextEncoder().encode(fragment))).slice(0, 15);
}

export function deriveInventoryKeypair(fragment: string) {
	const enc = new TextEncoder();
	const privkey = hmac(sha256, enc.encode('nowhere-inventory'), enc.encode(fragment));
	return { privkey, pubkey: getPublicKey(privkey) };
}

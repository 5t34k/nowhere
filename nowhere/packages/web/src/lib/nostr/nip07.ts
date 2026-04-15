import { base64urlToBytes, bytesToBase64url } from '@nowhere/codec';

export function hasNostrExtension(): boolean {
	return typeof window !== 'undefined' && !!window.nostr;
}

export function hasNip44Support(): boolean {
	return hasNostrExtension() && !!window.nostr?.nip44;
}

export async function getPublicKey(): Promise<string> {
	if (!window.nostr) throw new Error('No Nostr signing extension found');
	return window.nostr.getPublicKey();
}

export async function signEvent(event: {
	kind: number;
	created_at: number;
	tags: string[][];
	content: string;
}): Promise<{
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
	sig: string;
}> {
	if (!window.nostr) throw new Error('No Nostr signing extension found');
	return window.nostr.signEvent(event);
}

export async function nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
	if (!window.nostr?.nip44) throw new Error('NIP-44 not supported by extension');
	return window.nostr.nip44.encrypt(pubkey, plaintext);
}

export async function nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
	if (!window.nostr?.nip44) throw new Error('NIP-44 not supported by extension');
	return window.nostr.nip44.decrypt(pubkey, ciphertext);
}

export async function signFragment(fragment: string): Promise<{ signedFragment: string; signerPubkey: string }> {
	const event = {
		kind: 22242,
		created_at: 0,
		tags: [] as string[][],
		content: fragment
	};
	const signed = await signEvent(event);
	const sigHex = signed.sig;
	const sigBytes = new Uint8Array(64);
	for (let i = 0; i < 64; i++) {
		sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
	}
	const fragmentBytes = base64urlToBytes(fragment);
	const combined = new Uint8Array(fragmentBytes.length + 64);
	combined.set(fragmentBytes);
	combined.set(sigBytes, fragmentBytes.length);
	return { signedFragment: bytesToBase64url(combined), signerPubkey: signed.pubkey };
}

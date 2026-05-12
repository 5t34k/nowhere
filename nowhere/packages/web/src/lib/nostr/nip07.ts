// Unified signing facade — delegates to whichever Signer is active (NIP-07
// extension, NIP-46 remote signer, or none). The "nip07" name is historical.
import { base64urlToBytes, bytesToBase64url } from '@nowhere/codec';
import { getActiveSigner, hasRealNostrExtension, readPersistedSigner, signOut as signOutSigner } from './signer';
import { restoreActiveSigner } from './nip46-signer';
import { requestSignIn } from './signin-modal-store';

export function hasNostrExtension(): boolean {
	return hasRealNostrExtension();
}

export function hasNip44Support(): boolean {
	const s = getActiveSigner();
	if (s) return true;
	const ext = typeof window !== 'undefined' ? window.nostr : undefined;
	return !!ext?.nip44;
}

function requireSigner() {
	const s = getActiveSigner();
	if (!s) throw new Error('Not signed in.');
	return s;
}

export async function getPublicKey(): Promise<string> {
	return requireSigner().getPublicKey();
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
	return requireSigner().signEvent(event);
}

export async function nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
	return requireSigner().nip44Encrypt(pubkey, plaintext);
}

export async function nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
	return requireSigner().nip44Decrypt(pubkey, ciphertext);
}

export async function ensureSignedIn(): Promise<string> {
	const existing = getActiveSigner();
	if (existing) return existing.pubkey;
	// Rehydrate persisted NIP-46 sessions before showing the modal so a new
	// tab doesn't prompt for a fresh connection the signer already trusts.
	if (readPersistedSigner()) {
		const restored = await restoreActiveSigner();
		if (restored) return restored.pubkey;
	}
	return requestSignIn();
}

export async function signOut(): Promise<void> {
	await signOutSigner();
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

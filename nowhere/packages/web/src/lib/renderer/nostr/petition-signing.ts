import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';
import { publishToRelays, countEvents } from './relay-pool.js';
import { NOWHERE_DTAG_PREFIX } from './constants.js';
import { applyPoW } from './pow.js';
import type { UnsignedEvent } from './pow.js';
import { ensureSignedIn, signEvent as activeSignEvent, nip44Encrypt as activeNip44Encrypt } from '$lib/nostr/nip07.js';

export const POW_DIFFICULTY = 20;

export type SigningPhase = 'encrypting' | 'pow' | 'publishing';

/**
 * Compute a petition hash from the URL fragment.
 * SHA-256 of the fragment, truncated to 16 hex chars.
 */
async function computePetitionHash(fragment: string): Promise<string> {
	const data = new TextEncoder().encode(fragment);
	const hash = await crypto.subtle.digest('SHA-256', data);
	const bytes = new Uint8Array(hash);
	let hex = '';
	for (const b of bytes) hex += b.toString(16).padStart(2, '0');
	return hex.slice(0, 16);
}

/**
 * Build the d-tag value for petition signatures.
 */
function petitionDtag(petitionHash: string): string {
	return `${NOWHERE_DTAG_PREFIX}/${petitionHash}`;
}

/**
 * Publish an encrypted signature to relays.
 *
 * @param payload - The signer's data (fields, comment, etc.) as an object
 * @param creatorPubkeyHex - The petition creator's pubkey (hex)
 * @param fragment - The URL fragment to derive the petition hash from
 * @param useNip07 - If true, use NIP-07 browser extension for signing
 * @param relays - Relay URLs to publish to
 */
export async function publishSignature(
	payload: Record<string, unknown>,
	creatorPubkeyHex: string,
	fragment: string,
	useNip07: boolean,
	relays: string[],
	onPhase?: (phase: SigningPhase) => void
): Promise<boolean> {
	const petitionHash = await computePetitionHash(fragment);
	const dtag = petitionDtag(petitionHash);

	let sk: Uint8Array;
	let pk: string;

	if (useNip07) {
		pk = await ensureSignedIn();

		onPhase?.('encrypting');
		const content = await activeNip44Encrypt(creatorPubkeyHex, JSON.stringify(payload));

		const unsigned: UnsignedEvent = {
			kind: 30078,
			created_at: Math.floor(Date.now() / 1000),
			content,
			tags: [['d', dtag]],
			pubkey: pk
		};

		onPhase?.('pow');
		const withPow = await applyPoW(unsigned, POW_DIFFICULTY);
		const signed = await activeSignEvent(withPow);
		onPhase?.('publishing');
		await publishToRelays(signed, relays, 'petition signature');
	} else {
		// Anonymous: generate throwaway keypair
		sk = generateSecretKey();
		pk = getPublicKey(sk);

		onPhase?.('encrypting');

		// NIP-44 encrypt to creator
		const conversationKey = getConversationKey(sk, creatorPubkeyHex);
		const content = nip44Encrypt(JSON.stringify(payload), conversationKey);

		// Build event, apply PoW, then finalize
		const unsigned: UnsignedEvent = {
			kind: 30078,
			created_at: Math.floor(Date.now() / 1000),
			content,
			tags: [['d', dtag]],
			pubkey: pk
		};

		onPhase?.('pow');
		const withPow = await applyPoW(unsigned, POW_DIFFICULTY);

		const event = finalizeEvent(
			{
				kind: withPow.kind,
				created_at: withPow.created_at,
				content: withPow.content,
				tags: withPow.tags
			},
			sk
		);

		onPhase?.('publishing');
		await publishToRelays(event, relays, 'petition signature');
	}

	return true;
}

/**
 * Count petition signatures from relays using NIP-45 COUNT.
 * More efficient than fetching all events -- only returns a number.
 * Note: count may include events without valid POW since relay-level
 * POW filtering is not universally supported.
 */
export async function countSignatures(
	fragment: string,
	relays: string[]
): Promise<number> {
	const petitionHash = await computePetitionHash(fragment);
	const dtag = petitionDtag(petitionHash);

	return countEvents(
		{ kinds: [30078], '#d': [dtag] },
		relays
	);
}

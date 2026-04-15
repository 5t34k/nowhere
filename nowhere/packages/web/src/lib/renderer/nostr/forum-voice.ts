import { generateSecretKey, finalizeEvent } from 'nostr-tools/pure';
import { encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';
import { getPool } from './relay-pool.js';
import { INNER_EVENT_KIND, wrapContentForSigning, verifyInnerSignature } from './nowhere-signing.js';

export interface VoiceSignal {
	v: 1;
	voice: true;
	type: 'join' | 'leave' | 'offer' | 'answer' | 'ice' | 'mute';
	p: string;           // sender session pubkey hex
	ap?: string;         // sender author pubkey hex — used for private call routing
	ch: string;          // channel key: 'general' | 'room:Name' | 'private:authorPubkey'
	ts: number;
	target?: string;     // recipient session pubkey (offer/answer/ice)
	sdp?: string;        // SDP for offer/answer
	candidate?: string;  // JSON-stringified RTCIceCandidate
	muted?: boolean;     // for mute signals
	sig?: string;        // inner signature proving ap owns this join (join signals only)
	w?: string;          // wrapped content for signature verification (join signals only)
}

const HEX64 = /^[0-9a-f]{64}$/;
const VALID_TYPES = new Set(['join', 'leave', 'offer', 'answer', 'ice', 'mute']);

/** Runtime validation for voice signals from untrusted sources. */
export function isValidVoiceSignal(p: unknown): p is VoiceSignal {
	if (p === null || typeof p !== 'object') return false;
	const o = p as Record<string, unknown>;
	if (o.v !== 1 || o.voice !== true) return false;
	if (typeof o.type !== 'string' || !VALID_TYPES.has(o.type)) return false;
	if (typeof o.p !== 'string' || !HEX64.test(o.p)) return false;
	if (typeof o.ch !== 'string' || !o.ch) return false;
	if (typeof o.ts !== 'number') return false;
	if (o.ap !== undefined && (typeof o.ap !== 'string' || !HEX64.test(o.ap))) return false;
	if (o.target !== undefined && (typeof o.target !== 'string' || !HEX64.test(o.target))) return false;
	return true;
}

/** Sign a join signal with the author's private key to prove identity. */
export function signJoinSignal(signal: VoiceSignal, authorPrivkey: Uint8Array): void {
	if (signal.type !== 'join' || !signal.ap) return;
	const content = `voice-join:${signal.p}`;
	const w = wrapContentForSigning(content);
	const innerEvent = finalizeEvent(
		{ kind: INNER_EVENT_KIND, created_at: signal.ts, content: w, tags: [] },
		authorPrivkey
	);
	signal.sig = innerEvent.sig;
	signal.w = w;
}

/** Verify a join signal's inner signature. Returns true if sig is valid or absent (unsigned). */
export function verifyJoinSignature(signal: VoiceSignal): boolean {
	if (signal.type !== 'join') return true;
	if (!signal.sig || !signal.w || !signal.ap) return false;
	return verifyInnerSignature(signal.ap, signal.sig, signal.w, signal.ts);
}

export function publishVoiceSignal(
	signal: VoiceSignal,
	chatTag: string,
	recipientPubkey: string,
	relays: string[]
): void {
	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, recipientPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(signal), conversationKey);

	const event = finalizeEvent(
		{
			kind: 21423,
			created_at: signal.ts,
			content: encrypted,
			tags: [['t', chatTag]]
		},
		throwSk
	);

	const pool = getPool();
	try {
		pool.publish(relays, event);
	} catch (e) {
		console.warn('[Voice] Signal publish failed:', signal.type, e);
	}
}

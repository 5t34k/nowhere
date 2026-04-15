import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt, getConversationKey } from 'nostr-tools/nip44';
import { getPool } from './relay-pool.js';
import { INNER_EVENT_KIND, wrapContentForSigning, verifyInnerSignature } from './nowhere-signing.js';
import type { Event } from 'nostr-tools/core';
import type { SubCloser } from 'nostr-tools/pool';
import { isValidVoiceSignal } from './forum-voice.js';
import type { VoiceSignal } from './forum-voice.js';

export interface ChatMessage {
	v: number;
	b: string;           // message body
	p: string;           // author pubkey hex
	sp?: string;         // sender's stable session pubkey — included in general messages
	                     // so recipients can discover session pubkeys for private voice calls
	ts: number;          // real timestamp
	sig: string;         // inner rumor signature
	w?: string;          // wrapped signed content (nowhere-scoped)
	room?: string | { name: string; code: string };  // room name or announcement
}

export type ChannelType = 'general' | 'room' | 'private';

export interface RoomConfig {
	name: string;
	accessCode: string;
}

export interface DecryptedChatMessage {
	eventId: string;
	payload: ChatMessage;
	channel: ChannelType;
	roomName?: string;      // which room (for room messages)
	peerPubkey?: string;    // who sent it (for private messages)
}

// ─── Publish Functions ───

export async function publishChatMessage(
	body: string,
	chatTag: string,
	forumPubkey: string,
	forumPrivkey: Uint8Array,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number,
	sessionPubkey?: string
): Promise<void> {
	const now = timestamp || Math.floor(Date.now() / 1000);

	const w = wrappedContent || wrapContentForSigning(body);

	const payload: ChatMessage = {
		v: 1,
		b: body,
		p: authorPubkey,
		...(sessionPubkey ? { sp: sessionPubkey } : {}),
		ts: now,
		sig: '',
		w
	};

	if (nip07Sig) {
		payload.sig = nip07Sig;
	} else if (authorPrivkey) {
		const innerEvent = finalizeEvent(
			{ kind: INNER_EVENT_KIND, created_at: now, content: w, tags: [] },
			authorPrivkey
		);
		payload.sig = innerEvent.sig;
	}

	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, forumPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	const event = finalizeEvent(
		{
			kind: 21423,
			created_at: now,
			content: encrypted,
			tags: [['t', chatTag]]
		},
		throwSk
	);

	const pool = getPool();
	try {
		pool.publish(relays, event);
	} catch {
		// Chat messages are best-effort
	}
}

export async function publishRoomChatMessage(
	body: string,
	chatTag: string,
	roomPubkey: string,
	roomName: string,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number
): Promise<void> {
	const now = timestamp || Math.floor(Date.now() / 1000);

	const w = wrappedContent || wrapContentForSigning(body);

	const payload: ChatMessage = {
		v: 1,
		b: body,
		p: authorPubkey,
		ts: now,
		sig: '',
		w,
		room: roomName
	};

	if (nip07Sig) {
		payload.sig = nip07Sig;
	} else if (authorPrivkey) {
		const innerEvent = finalizeEvent(
			{ kind: INNER_EVENT_KIND, created_at: now, content: w, tags: [] },
			authorPrivkey
		);
		payload.sig = innerEvent.sig;
	}

	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, roomPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	const event = finalizeEvent(
		{
			kind: 21423,
			created_at: now,
			content: encrypted,
			tags: [['t', chatTag]]
		},
		throwSk
	);

	const pool = getPool();
	try {
		pool.publish(relays, event);
	} catch {
		// best-effort
	}
}

export async function publishPrivateChatMessage(
	body: string,
	chatTag: string,
	recipientSessionPubkey: string,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number
): Promise<void> {
	const now = timestamp || Math.floor(Date.now() / 1000);

	const w = wrappedContent || wrapContentForSigning(body);

	const payload: ChatMessage = {
		v: 1,
		b: body,
		p: authorPubkey,
		ts: now,
		sig: '',
		w
	};

	if (nip07Sig) {
		payload.sig = nip07Sig;
	} else if (authorPrivkey) {
		const innerEvent = finalizeEvent(
			{ kind: INNER_EVENT_KIND, created_at: now, content: w, tags: [] },
			authorPrivkey
		);
		payload.sig = innerEvent.sig;
	}

	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, recipientSessionPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	const event = finalizeEvent(
		{
			kind: 21423,
			created_at: now,
			content: encrypted,
			tags: [['t', chatTag]]
		},
		throwSk
	);

	const pool = getPool();
	try {
		pool.publish(relays, event);
	} catch {
		// best-effort
	}
}

export async function publishRoomAnnouncement(
	roomName: string,
	accessCode: string,
	chatTag: string,
	forumPubkey: string,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number
): Promise<void> {
	const now = timestamp || Math.floor(Date.now() / 1000);

	const w = wrappedContent || wrapContentForSigning('room');

	const payload: ChatMessage = {
		v: 1,
		b: '',
		p: authorPubkey,
		ts: now,
		sig: '',
		w,
		room: { name: roomName, code: accessCode }
	};

	if (nip07Sig) {
		payload.sig = nip07Sig;
	} else if (authorPrivkey) {
		const innerEvent = finalizeEvent(
			{ kind: INNER_EVENT_KIND, created_at: now, content: w, tags: [] },
			authorPrivkey
		);
		payload.sig = innerEvent.sig;
	}

	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, forumPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	const event = finalizeEvent(
		{
			kind: 21423,
			created_at: now,
			content: encrypted,
			tags: [['t', chatTag]]
		},
		throwSk
	);

	const pool = getPool();
	try {
		pool.publish(relays, event);
	} catch {
		// best-effort
	}
}

// ─── Subscriber ───

function isValidPayload(payload: ChatMessage): boolean {
	return payload.v === 1 && typeof payload.p === 'string' && payload.p.length > 0 && !('t' in payload);
}

export function subscribeToChatMessages(
	chatTag: string,
	relays: string[],
	forumPrivkey: Uint8Array,
	getRoomKeys: () => Array<{ name: string; privkey: Uint8Array }>,
	mySessionPrivkey: Uint8Array,
	mySessionPubkey: string,
	onMessage: (msg: DecryptedChatMessage) => void,
	onVoiceSignal?: (signal: VoiceSignal) => void
): SubCloser {
	const pool = getPool();
	return pool.subscribeMany(
		relays,
		{ kinds: [21423], '#t': [chatTag] },
		{
			onevent(event: Event) {
				if (event.kind !== 21423) return;

				// 1. Try general (forum key)
				try {
					const ck = getConversationKey(forumPrivkey, event.pubkey);
					const decrypted = nip44Decrypt(event.content, ck);
					const payload = JSON.parse(decrypted);
					if (payload.voice === true && onVoiceSignal && isValidVoiceSignal(payload)) {
						onVoiceSignal(payload);
						return;
					}
					if (isValidPayload(payload)) {
						if (!payload.sig || !payload.w) return;
						if (!verifyInnerSignature(payload.p, payload.sig, payload.w, payload.ts)) return;
						onMessage({ eventId: event.id, payload, channel: 'general' });
						return;
					}
				} catch {
					// not general
				}

				// 2. Try each room key
				const roomKeys = getRoomKeys();
				for (const room of roomKeys) {
					try {
						const ck = getConversationKey(room.privkey, event.pubkey);
						const decrypted = nip44Decrypt(event.content, ck);
						const payload = JSON.parse(decrypted);
						if (payload.voice === true && onVoiceSignal && isValidVoiceSignal(payload)) {
							onVoiceSignal(payload);
							return;
						}
						if (isValidPayload(payload)) {
							if (!payload.sig || !payload.w) continue;
							if (!verifyInnerSignature(payload.p, payload.sig, payload.w, payload.ts)) continue;
							onMessage({ eventId: event.id, payload, channel: 'room', roomName: room.name });
							return;
						}
					} catch {
						// not this room
					}
				}

				// 3. Try private (session key)
				try {
					const ck = getConversationKey(mySessionPrivkey, event.pubkey);
					const decrypted = nip44Decrypt(event.content, ck);
					const payload = JSON.parse(decrypted);
					if (payload.voice === true && onVoiceSignal && isValidVoiceSignal(payload)) {
						onVoiceSignal(payload);
						return;
					}
					if (isValidPayload(payload)) {
						if (!payload.sig || !payload.w) return;
						if (!verifyInnerSignature(payload.p, payload.sig, payload.w, payload.ts)) return;
						// payload.p tells us who sent it
						const peerPubkey = payload.p === mySessionPubkey ? mySessionPubkey : payload.p;
						onMessage({ eventId: event.id, payload, channel: 'private', peerPubkey });
						return;
					}
				} catch {
					// not for us — discard silently
				}
			}
		}
	);
}

// ─── Room Storage ───

export function getStoredRooms(forumFingerprint: string): RoomConfig[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem('nowhere-forum-rooms-' + forumFingerprint);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

export function storeRooms(forumFingerprint: string, rooms: RoomConfig[]): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem('nowhere-forum-rooms-' + forumFingerprint, JSON.stringify(rooms));
	} catch {
		// quota exceeded — ignore
	}
}

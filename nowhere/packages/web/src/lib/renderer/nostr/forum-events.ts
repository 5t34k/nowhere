import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { encrypt as nip44Encrypt, decrypt as nip44Decrypt, getConversationKey } from 'nostr-tools/nip44';
import { publishToRelays, getPool } from './relay-pool.js';
import { INNER_EVENT_KIND, NOWHERE_PREFIX, NOWHERE_CONV_KEY, wrapContentForSigning, verifyInnerSignature } from './nowhere-signing.js';
import type { Event } from 'nostr-tools/core';
import type { SubCloser } from 'nostr-tools/pool';

export interface ForumPost {
	v: number;
	t: string;           // title
	b?: string;          // body text
	l?: string;          // optional link
	p: string;           // author pubkey hex
	ts: number;          // real unix timestamp
	sig: string;         // signature (inner rumor event id)
	w?: string;          // wrapped signed content (nowhere-scoped)
}

export interface ForumReply {
	v: number;
	b: string;           // body
	p: string;           // author pubkey hex
	ts: number;          // real unix timestamp
	sig: string;         // signature (inner rumor event id)
	w?: string;          // wrapped signed content (nowhere-scoped)
	ref?: string;        // optional quoted reply event id
}

export interface DecryptedPost {
	eventId: string;
	payload: ForumPost;
	outerTimestamp: number;
}

export interface DecryptedReply {
	eventId: string;
	payload: ForumReply;
	outerTimestamp: number;
}

function randomTimestampOffset(): number {
	// 0 to -4 days in seconds (only past, never future — relays reject future timestamps)
	return -Math.floor(Math.random() * 4 * 86400);
}

/**
 * Sign inner content by creating a kind:1 event (inner rumor) and using its sig.
 * This leverages nostr-tools' finalizeEvent which handles schnorr signing internally.
 */
function signInnerRumor(content: string, authorPrivkey: Uint8Array, timestamp: number): { sig: string; id: string } {
	const innerEvent = finalizeEvent(
		{
			kind: INNER_EVENT_KIND,
			created_at: timestamp,
			content,
			tags: []
		},
		authorPrivkey
	);
	return { sig: innerEvent.sig, id: innerEvent.id };
}

export async function publishForumPost(
	title: string,
	body: string | undefined,
	link: string | undefined,
	topicTag: string,
	forumPubkey: string,
	forumPrivkey: Uint8Array,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number
): Promise<string> {
	const now = timestamp || Math.floor(Date.now() / 1000);
	const innerContent = JSON.stringify({ t: title, b: body || null, l: link || null, ts: now });

	// Generate wrapped content if not provided (NIP-07 path provides it)
	const w = wrappedContent || wrapContentForSigning(innerContent);

	// Build inner rumor payload
	const payload: ForumPost = {
		v: 1,
		t: title,
		p: authorPubkey,
		ts: now,
		sig: '',
		w
	};
	if (body) payload.b = body;
	if (link) payload.l = link;

	// Sign inner content — NIP-07 sig takes priority, then local key
	if (nip07Sig) {
		payload.sig = nip07Sig;
	} else if (authorPrivkey) {
		const { sig } = signInnerRumor(w, authorPrivkey, now);
		payload.sig = sig;
	}

	// NIP-44 encrypt with forum derived key
	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, forumPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	// Randomize outer timestamp
	const outerTimestamp = now + randomTimestampOffset();

	const event = finalizeEvent(
		{
			kind: 30078,
			created_at: outerTimestamp,
			content: encrypted,
			tags: [['t', topicTag]]
		},
		throwSk
	);

	await publishToRelays(event, relays, 'forum-post');
	return event.id;
}

export async function publishForumReply(
	body: string,
	postTag: string,
	replyPubkey: string,
	replyPrivkey: Uint8Array,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	quotedReplyId?: string,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number
): Promise<string> {
	const now = timestamp || Math.floor(Date.now() / 1000);
	const innerContent = JSON.stringify({ b: body, ts: now });

	// Generate wrapped content if not provided (NIP-07 path provides it)
	const w = wrappedContent || wrapContentForSigning(innerContent);

	const payload: ForumReply = {
		v: 1,
		b: body,
		p: authorPubkey,
		ts: now,
		sig: '',
		w
	};
	if (quotedReplyId) payload.ref = quotedReplyId;

	// Sign inner content — NIP-07 sig takes priority, then local key
	if (nip07Sig) {
		payload.sig = nip07Sig;
	} else if (authorPrivkey) {
		const { sig } = signInnerRumor(w, authorPrivkey, now);
		payload.sig = sig;
	}

	// NIP-44 encrypt with reply derived key
	const throwSk = generateSecretKey();
	const conversationKey = getConversationKey(throwSk, replyPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	const outerTimestamp = now + randomTimestampOffset();

	const event = finalizeEvent(
		{
			kind: 30078,
			created_at: outerTimestamp,
			content: encrypted,
			tags: [['t', postTag]]
		},
		throwSk
	);

	await publishToRelays(event, relays, 'forum-reply');
	return event.id;
}

export function decryptForumPost(event: Event, forumPrivkey: Uint8Array): DecryptedPost | null {
	try {
		const conversationKey = getConversationKey(forumPrivkey, event.pubkey);
		const decrypted = nip44Decrypt(event.content, conversationKey);
		const payload = JSON.parse(decrypted) as ForumPost;
		if (payload.v !== 1 || !payload.t || !payload.p) {
			console.warn('[Nowhere] post decrypt: bad payload fields', { v: payload.v, t: payload.t, p: payload.p });
			return null;
		}

		// Signature verification — reject unsigned/unwrapped
		if (!payload.sig || !payload.w) {
			console.warn('[Nowhere] post decrypt: missing sig or w');
			return null;
		}
		if (!verifyInnerSignature(payload.p, payload.sig, payload.w, payload.ts)) {
			console.warn('[Nowhere] post decrypt: inner signature verification failed for pubkey', payload.p.slice(0, 16));
			return null;
		}

		return {
			eventId: event.id,
			payload,
			outerTimestamp: event.created_at
		};
	} catch (e) {
		console.warn('[Nowhere] post decrypt: exception', e instanceof Error ? e.message : e);
		return null;
	}
}

export function decryptForumReply(event: Event, replyPrivkey: Uint8Array): DecryptedReply | null {
	try {
		const conversationKey = getConversationKey(replyPrivkey, event.pubkey);
		const decrypted = nip44Decrypt(event.content, conversationKey);
		const payload = JSON.parse(decrypted) as ForumReply;
		if (payload.v !== 1 || !payload.b || !payload.p) return null;

		// Signature verification — reject unsigned/unwrapped
		if (!payload.sig || !payload.w) return null;
		if (!verifyInnerSignature(payload.p, payload.sig, payload.w, payload.ts)) return null;

		return {
			eventId: event.id,
			payload,
			outerTimestamp: event.created_at
		};
	} catch {
		return null;
	}
}

// ─── Torrent types ───────────────────────────────────────────────────────────

/**
 * NIP-35-inspired data schema stored as plain JSON inside the NOWHERE encryption layer.
 * This is NOT a kind 2003 Nostr event — NIP-35 is a public indexing spec; our use case
 * is private and forum-scoped. The torrent payload lives inside two encryption layers and
 * cannot be rebroadcast as a conforming NIP-35 event.
 */
export interface TorrentData {
	x: string;           // SHA1 infohash v1 hex
	title: string;
	description?: string;
	files: { path: string; size: number }[];
	trackers: string[];
	category: string;    // lowercase, segments joined with " > " (e.g. "video > movies > 4k")
	refs: string[];      // external DB refs, opaque strings
}

/** Outer forum payload for a torrent (encrypted with forum key, published from random throwaway). */
export interface ForumTorrent {
	v: number;   // = 1
	p: string;   // real author pubkey hex
	ts: number;
	sig: string; // inner sig over w (kind 21423 schnorr sig)
	w: string;   // wrapContentForSigning(JSON.stringify(torrentData))
	             // TorrentData is accessible only by decrypting this NOWHERE-wrapped field
}

export interface DecryptedTorrent {
	eventId: string;
	torrentData: TorrentData;
	authorPubkey: string;
	outerTimestamp: number;
	innerTimestamp: number; // real publish time from inner signed payload (outer is randomised)
	w: string; // retained for reply key derivation (deriveTorrentPostTag / deriveTorrentReplyKeypair)
}

// ─────────────────────────────────────────────────────────────────────────────

export interface TopicEntry {
	topicTag: string;
	topic: string; // human-readable topic name; '' for default
	type?: 'text' | 'torrent'; // defaults to 'text'
}

export interface ReplyEntry {
	postTag: string;
	postId: string;
	replyPrivkey: Uint8Array;
}

export interface ForumSubscriptionOptions {
	topicEntries: TopicEntry[];
	replyEntries: ReplyEntry[];
	forumPrivkey: Uint8Array;
	relays: string[];
	onPost: (post: DecryptedPost, topic: string) => void;
	onReply: (reply: DecryptedReply, postId: string, postTag: string) => void;
	onTorrent?: (torrent: DecryptedTorrent) => void;
}

/**
 * Single unified subscription covering all topics and all known reply threads.
 * One REQ to the relay regardless of how many topics or posts the forum has.
 */
export function subscribeToForum(options: ForumSubscriptionOptions): SubCloser {
	const { topicEntries, replyEntries, forumPrivkey, relays, onPost, onReply, onTorrent } = options;

	const topicByTag = new Map(topicEntries.map(e => [e.topicTag, e]));
	const replyByTag = new Map(replyEntries.map(e => [e.postTag, e]));

	const allTags = [
		...topicEntries.map(e => e.topicTag),
		...replyEntries.map(e => e.postTag)
	];

	if (allTags.length === 0) return { close: () => {} } as SubCloser;

	const pool = getPool();
	return pool.subscribeMany(
		relays,
		{ kinds: [30078], '#t': allTags },
		{
			onevent(event: Event) {
				if (event.kind !== 30078) return;
				const tTag = event.tags.find(t => t[0] === 't')?.[1];
				if (!tTag) return;

				const topicEntry = topicByTag.get(tTag);
				if (topicEntry) {
					if (topicEntry.type === 'torrent') {
						const torrent = decryptForumTorrent(event, forumPrivkey);
						if (torrent) {
							onTorrent?.(torrent);
						} else {
							console.warn('[Nowhere] torrent event failed to decrypt/verify, id:', event.id.slice(0, 8));
						}
					} else {
						console.log('[Nowhere] forum event received for topic', topicEntry.topic || '(default)', event.id.slice(0, 8));
						const post = decryptForumPost(event, forumPrivkey);
						if (post) {
							onPost(post, topicEntry.topic);
						} else {
							console.warn('[Nowhere] post event failed to decrypt/verify, id:', event.id.slice(0, 8));
						}
					}
				} else {
					const entry = replyByTag.get(tTag);
					if (entry) {
						const reply = decryptForumReply(event, entry.replyPrivkey);
						if (reply) onReply(reply, entry.postId, entry.postTag);
					}
				}
			}
		}
	);
}

// ─── Torrent publish / decrypt ────────────────────────────────────────────────

export async function publishForumTorrent(
	torrentData: TorrentData,
	torrentTopicTag: string,
	forumPubkey: string,
	forumPrivkey: Uint8Array,
	relays: string[],
	authorPubkey: string,
	authorPrivkey?: Uint8Array,
	nip07Sig?: string,
	wrappedContent?: string,
	timestamp?: number
): Promise<string> {
	const now = timestamp || Math.floor(Date.now() / 1000);

	// Wrap torrent data inside the NOWHERE encryption layer (same as text posts)
	const w = wrappedContent || wrapContentForSigning(JSON.stringify(torrentData));

	const payload: ForumTorrent = {
		v: 1,
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
	const conversationKey = getConversationKey(throwSk, forumPubkey);
	const encrypted = nip44Encrypt(JSON.stringify(payload), conversationKey);

	const outerTimestamp = now + randomTimestampOffset();
	const event = finalizeEvent(
		{ kind: 30078, created_at: outerTimestamp, content: encrypted, tags: [['t', torrentTopicTag]] },
		throwSk
	);

	await publishToRelays(event, relays, 'forum-torrent');
	return event.id;
}

export function decryptForumTorrent(event: Event, forumPrivkey: Uint8Array): DecryptedTorrent | null {
	try {
		const conversationKey = getConversationKey(forumPrivkey, event.pubkey);
		const decrypted = nip44Decrypt(event.content, conversationKey);
		const payload = JSON.parse(decrypted) as ForumTorrent;

		if (payload.v !== 1 || !payload.p || !payload.sig || !payload.w) {
			console.warn('[Nowhere] torrent decrypt: bad payload fields');
			return null;
		}

		if (!verifyInnerSignature(payload.p, payload.sig, payload.w, payload.ts)) {
			console.warn('[Nowhere] torrent decrypt: inner signature verification failed for pubkey', payload.p.slice(0, 16));
			return null;
		}

		// Unwrap NOWHERE layer: strip prefix, NIP-44 decrypt with shared nowhere key
		if (!payload.w.startsWith(NOWHERE_PREFIX)) {
			console.warn('[Nowhere] torrent decrypt: w missing NOWHERE_PREFIX');
			return null;
		}
		const ciphertext = payload.w.slice(NOWHERE_PREFIX.length);
		const torrentJson = nip44Decrypt(ciphertext, NOWHERE_CONV_KEY);
		const torrentData = JSON.parse(torrentJson) as TorrentData;

		if (!torrentData.x || !torrentData.title) {
			console.warn('[Nowhere] torrent decrypt: missing required fields x/title');
			return null;
		}

		return {
			eventId: event.id,
			torrentData,
			authorPubkey: payload.p,
			outerTimestamp: event.created_at,
			innerTimestamp: payload.ts,
			w: payload.w
		};
	} catch (e) {
		console.warn('[Nowhere] torrent decrypt: exception', e instanceof Error ? e.message : e);
		return null;
	}
}

/** Build a magnet URI from decrypted torrent data. Constructed at display time — never stored. */
export function buildMagnetLink(t: TorrentData): string {
	let url = `magnet:?xt=urn:btih:${t.x}&dn=${encodeURIComponent(t.title)}`;
	for (const tr of t.trackers) {
		url += `&tr=${encodeURIComponent(tr)}`;
	}
	return url;
}

// ─────────────────────────────────────────────────────────────────────────────

export function getSessionKeypair(): { privkey: Uint8Array; pubkey: string } {
	if (typeof sessionStorage === 'undefined') {
		const sk = generateSecretKey();
		return { privkey: sk, pubkey: getPublicKey(sk) };
	}
	const stored = sessionStorage.getItem('nowhere-forum-session-key');
	if (stored) {
		const bytes = new Uint8Array(stored.split(',').map(Number));
		return { privkey: bytes, pubkey: getPublicKey(bytes) };
	}
	const sk = generateSecretKey();
	sessionStorage.setItem('nowhere-forum-session-key', Array.from(sk).join(','));
	return { privkey: sk, pubkey: getPublicKey(sk) };
}

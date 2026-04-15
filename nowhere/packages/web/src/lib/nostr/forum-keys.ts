import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from 'nostr-tools/pure';

const enc = new TextEncoder();

export function deriveForumKeypair(fragment: string) {
	const privkey = hmac(sha256, enc.encode('nowhere-forum'), enc.encode(fragment));
	return { privkey, pubkey: getPublicKey(privkey) };
}

export function deriveTopicTag(forumPrivKey: Uint8Array, topicName: string): string {
	const input = new Uint8Array([
		...enc.encode('nowhere-forum-topic'),
		...forumPrivKey,
		...enc.encode(topicName)
	]);
	return bytesToHex(sha256(input)).slice(0, 32);
}

export function deriveChatTag(forumPrivKey: Uint8Array): string {
	const input = new Uint8Array([
		...enc.encode('nowhere-forum-chat'),
		...forumPrivKey
	]);
	return bytesToHex(sha256(input)).slice(0, 32);
}

export function derivePostTag(postText: string, authorPubkey: string, timestamp: number): string {
	const input = new Uint8Array([
		...enc.encode(postText),
		...enc.encode(authorPubkey),
		...enc.encode(String(timestamp))
	]);
	return bytesToHex(sha256(input)).slice(0, 32);
}

export function deriveReplyKeypair(postText: string, authorPubkey: string, timestamp: number) {
	const input = new Uint8Array([
		...enc.encode(postText),
		...enc.encode(authorPubkey),
		...enc.encode(String(timestamp))
	]);
	const privkey = hmac(sha256, enc.encode('nowhere-reply'), input);
	return { privkey, pubkey: getPublicKey(privkey) };
}

/**
 * Fixed seed used to derive the torrent topic tag.
 * A human-typed topic named "Torrents" derives from the string "Torrents" and produces a
 * completely different tag — no collision possible.
 */
export const TORRENT_TOPIC_SEED = '41cae9db12fee677b38146d20fb2f6bb8828557a6db6692d3d6b1ee8f9d3bb06';

/**
 * Post tag for subscribing to replies on a torrent.
 * w is the NOWHERE-wrapped signed content — fixed once published, same for all decryptors.
 */
export function deriveTorrentPostTag(w: string): string {
	return bytesToHex(sha256(enc.encode(w))).slice(0, 32);
}

/** Reply keypair for torrent reply threads. Uses a different HMAC domain from text replies. */
export function deriveTorrentReplyKeypair(w: string) {
	const privkey = hmac(sha256, enc.encode('nowhere-torrent-reply'), enc.encode(w));
	return { privkey, pubkey: getPublicKey(privkey) };
}

export function deriveRoomKeypair(forumPrivKey: Uint8Array, roomName: string, accessCode: string) {
	const nameBytes = enc.encode(roomName);
	const codeBytes = enc.encode(accessCode);
	const message = new Uint8Array([...forumPrivKey, ...nameBytes, 0, ...codeBytes]);
	const privkey = hmac(sha256, enc.encode('nowhere-chat-room'), message);
	return { privkey, pubkey: getPublicKey(privkey) };
}

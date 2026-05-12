// NIP-46 client adapted from applesauce-signers/NostrConnectSigner (MIT, hzrd149).
// Key reason for our own client over nostr-tools' BunkerSigner: BunkerSigner
// decrypts incoming events as NIP-44 only and silently drops NIP-04 ciphertexts.
// Some signers (e.g. Primal iOS) reply in NIP-04, which made get_public_key hang
// forever. We try NIP-04 then NIP-44 based on ciphertext shape.

import { getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import {
	encrypt as nip44EncryptFn,
	decrypt as nip44DecryptFn,
	getConversationKey
} from 'nostr-tools/nip44';
import { decrypt as nip04DecryptFn } from 'nostr-tools/nip04';
import { hexToBytes } from '@noble/hashes/utils.js';
import type { SimplePool } from 'nostr-tools/pool';

const NOSTR_CONNECT_KIND = 24133;

interface PendingRequest {
	resolve: (value: string) => void;
	reject: (error: Error) => void;
}

interface ResponseBody {
	id?: string;
	result?: string;
	error?: string;
}

interface IncomingEvent {
	pubkey: string;
	content: string;
}

interface SubCloser {
	close: () => void;
}

// NIP-04 ciphertexts end with `?iv=<base64>`; NIP-44 v2 ciphertexts don't.
function isNip04(ciphertext: string): boolean {
	const l = ciphertext.length;
	if (l < 28) return false;
	return (
		ciphertext[l - 28] === '?' &&
		ciphertext[l - 27] === 'i' &&
		ciphertext[l - 26] === 'v' &&
		ciphertext[l - 25] === '='
	);
}

function genId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
	}
	return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

export interface NostrConnectClientOptions {
	pool: SimplePool;
	relays: string[];
	clientSecretHex: string;
	/** Remote signer pubkey, if known (e.g. parsed from a `bunker://` URI). */
	remotePubkey?: string;
	/** Secret embedded in the `nostrconnect://` URI; used to match the connect ack. */
	secret?: string;
	onAuthUrl?: (url: string) => void;
}

/** Minimal NIP-46 ("Nostr Connect") client. */
export class NostrConnectClient {
	pool: SimplePool;
	relays: string[];
	secretKey: Uint8Array;
	clientPubkey: string;
	remotePubkey?: string;
	secret?: string;
	onAuthUrl?: (url: string) => void;

	private pending = new Map<string, PendingRequest>();
	// Request ids that have already fired an auth_url, to avoid firing twice.
	private auths = new Set<string>();
	private subCloser?: SubCloser;
	private closed = false;
	private waitingForSigner: PendingRequest | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(opts: NostrConnectClientOptions) {
		this.pool = opts.pool;
		this.relays = opts.relays;
		this.secretKey = hexToBytes(opts.clientSecretHex);
		this.clientPubkey = getPublicKey(this.secretKey);
		this.remotePubkey = opts.remotePubkey;
		this.secret = opts.secret;
		this.onAuthUrl = opts.onAuthUrl;
	}

	/** Open the relay subscription if not already open. Idempotent. */
	open(): void {
		if (this.subCloser || this.closed) return;
		this.openSubscription();
	}

	private openSubscription(): void {
		if (this.closed) return;
		try {
			const sub = this.pool.subscribe(
				this.relays,
				{ kinds: [NOSTR_CONNECT_KIND], '#p': [this.clientPubkey] },
				{
					onevent: (event: IncomingEvent) => void this.handleEvent(event),
					onclose: () => {
						this.subCloser = undefined;
						// Auto-reconnect with 1s backoff so transient relay drops don't
						// silently break the session.
						if (!this.closed) {
							if (this.retryTimer) clearTimeout(this.retryTimer);
							this.retryTimer = setTimeout(() => {
								this.retryTimer = null;
								this.openSubscription();
							}, 1000);
						}
					}
				}
			);
			this.subCloser = sub as unknown as SubCloser;
		} catch (e) {
			console.warn('[nostr-connect] failed to open subscription, retrying', e);
			if (!this.closed) {
				this.retryTimer = setTimeout(() => {
					this.retryTimer = null;
					this.openSubscription();
				}, 1000);
			}
		}
	}

	close(): void {
		this.closed = true;
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
		if (this.subCloser) {
			try {
				this.subCloser.close();
			} catch {
				/* swallow */
			}
			this.subCloser = undefined;
		}
		if (this.waitingForSigner) {
			this.waitingForSigner.reject(new Error('Closed'));
			this.waitingForSigner = null;
		}
		for (const p of this.pending.values()) {
			p.reject(new Error('Closed'));
		}
		this.pending.clear();
	}

	private async handleEvent(event: IncomingEvent): Promise<void> {
		if (this.remotePubkey && event.pubkey !== this.remotePubkey) return;

		let plaintext: string;
		try {
			if (isNip04(event.content)) {
				plaintext = await nip04DecryptFn(this.secretKey, event.pubkey, event.content);
			} else {
				const convKey = getConversationKey(this.secretKey, event.pubkey);
				plaintext = nip44DecryptFn(event.content, convKey);
			}
		} catch (e) {
			console.warn('[nostr-connect] failed to decrypt incoming event', e);
			return;
		}

		let response: ResponseBody;
		try {
			response = JSON.parse(plaintext);
		} catch {
			return;
		}

		// Connect ack: per spec, result is "ack" or the secret from the URI.
		if (
			!this.remotePubkey &&
			(response.result === 'ack' || (this.secret && response.result === this.secret))
		) {
			this.remotePubkey = event.pubkey;
			this.waitingForSigner?.resolve('connected');
			this.waitingForSigner = null;
			return;
		}

		if (!response.id) return;

		// auth_url: signer wants the user to authenticate at a URL before
		// processing the request. Surface the URL; the real response follows.
		if (response.result === 'auth_url' && response.error) {
			if (!this.auths.has(response.id)) {
				this.auths.add(response.id);
				this.onAuthUrl?.(response.error);
			}
			return;
		}

		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.error) {
			pending.reject(new Error(response.error));
		} else {
			pending.resolve(response.result ?? '');
		}
	}

	/** Wait until the signer publishes its connect ack. Resolves with the remote pubkey. */
	waitForSigner(abort?: AbortSignal): Promise<string> {
		if (this.remotePubkey) return Promise.resolve(this.remotePubkey);
		this.open();
		return new Promise<string>((resolve, reject) => {
			this.waitingForSigner = {
				resolve: () => resolve(this.remotePubkey!),
				reject
			};
			abort?.addEventListener(
				'abort',
				() => {
					this.waitingForSigner?.reject(new Error('Aborted'));
					this.waitingForSigner = null;
					this.close();
				},
				{ once: true }
			);
		});
	}

	private async sendRequest(method: string, params: string[]): Promise<string> {
		if (!this.remotePubkey) throw new Error('No remote signer pubkey set');
		this.open();
		const id = genId();
		const body = { id, method, params };
		const convKey = getConversationKey(this.secretKey, this.remotePubkey);
		const encrypted = nip44EncryptFn(JSON.stringify(body), convKey);
		const event = finalizeEvent(
			{
				kind: NOSTR_CONNECT_KIND,
				created_at: Math.floor(Date.now() / 1000),
				tags: [['p', this.remotePubkey]],
				content: encrypted
			},
			this.secretKey
		);
		const promise = new Promise<string>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
		this.pool.publish(this.relays, event);
		return promise;
	}

	async connect(perms?: string): Promise<string> {
		if (!this.remotePubkey) throw new Error('Cannot connect without remote pubkey');
		return this.sendRequest('connect', [this.remotePubkey, this.secret ?? '', perms ?? '']);
	}

	async getPublicKey(): Promise<string> {
		return this.sendRequest('get_public_key', []);
	}

	async signEvent(template: {
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
		const result = await this.sendRequest('sign_event', [JSON.stringify(template)]);
		return JSON.parse(result);
	}

	async nip44Encrypt(thirdPartyPubkey: string, plaintext: string): Promise<string> {
		return this.sendRequest('nip44_encrypt', [thirdPartyPubkey, plaintext]);
	}

	async nip44Decrypt(thirdPartyPubkey: string, ciphertext: string): Promise<string> {
		return this.sendRequest('nip44_decrypt', [thirdPartyPubkey, ciphertext]);
	}

	async ping(): Promise<string> {
		return this.sendRequest('ping', []);
	}
}

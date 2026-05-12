import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { parseBunkerInput, type BunkerPointer } from 'nostr-tools/nip46';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPool } from '$lib/renderer/nostr/relay-pool.js';
import { NostrConnectClient } from './nostr-connect-client.js';
import {
	type Signer,
	type UnsignedEvent,
	type SignedEvent,
	type PersistedNip46,
	getActiveSigner,
	setActiveSigner,
	readPersistedSigner,
	writePersistedSigner
} from './signer';

// Coracle's bucket relay is the de-facto NIP-46 hub: it's where signers and
// clients across the ecosystem (including Primal iOS, which only subscribes to
// its own preferred set for NIP-46 traffic) reliably meet.
export const DEFAULT_NOSTRCONNECT_RELAYS = ['wss://bucket.coracle.social/'];

const APP_NAME = 'Nowhere';
// Stricter signers treat this list as authoritative and silently drop requests
// for methods not on it, so list every method we'll actually call — including
// `get_public_key`, which permissive signers auto-allow but strict ones don't.
const APP_PERMS = [
	'get_public_key',
	'sign_event:1',
	'sign_event:30078',
	'sign_event:21423',
	'sign_event:22242',
	'sign_event:21426',
	'nip44_encrypt',
	'nip44_decrypt'
];

interface ConnectOptions {
	onAuthUrl?: (url: string) => void;
}

interface NostrConnectHandle {
	uri: string;
	clientSecretHex: string;
	relays: string[];
	signerPromise: Promise<Nip46Signer>;
	abort: () => void;
}

export class Nip46Signer implements Signer {
	readonly type = 'nip46' as const;
	pubkey: string;
	private client: NostrConnectClient;
	private bunkerUri: string;
	private clientSecretHex: string;
	private relays: string[];
	private bunkerPubkey: string;

	constructor(opts: {
		pubkey: string;
		client: NostrConnectClient;
		bunkerUri: string;
		bunkerPubkey: string;
		clientSecretHex: string;
		relays: string[];
	}) {
		this.pubkey = opts.pubkey;
		this.client = opts.client;
		this.bunkerUri = opts.bunkerUri;
		this.bunkerPubkey = opts.bunkerPubkey;
		this.clientSecretHex = opts.clientSecretHex;
		this.relays = opts.relays;
	}

	async getPublicKey(): Promise<string> {
		return this.pubkey;
	}

	async signEvent(event: UnsignedEvent): Promise<SignedEvent> {
		return this.client.signEvent(event) as Promise<SignedEvent>;
	}

	async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
		return this.client.nip44Encrypt(pubkey, plaintext);
	}

	async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
		return this.client.nip44Decrypt(pubkey, ciphertext);
	}

	async disconnect(): Promise<void> {
		try {
			this.client.close();
		} catch {
			/* swallow */
		}
	}

	persist(): void {
		const p: PersistedNip46 = {
			type: 'nip46',
			pubkey: this.pubkey,
			bunkerUri: stripSecretParam(this.bunkerUri),
			bunkerPubkey: this.bunkerPubkey,
			clientSecretHex: this.clientSecretHex,
			relays: this.relays
		};
		writePersistedSigner(p);
	}
}

function stripSecretParam(uri: string): string {
	try {
		const idx = uri.indexOf('?');
		if (idx < 0) return uri;
		const base = uri.slice(0, idx);
		const params = new URLSearchParams(uri.slice(idx + 1));
		params.delete('secret');
		const out = params.toString();
		return out ? `${base}?${out}` : base;
	} catch {
		return uri;
	}
}

function randomSecret(): string {
	const arr = new Uint8Array(8);
	crypto.getRandomValues(arr);
	return bytesToHex(arr);
}

function buildNostrConnectURI(opts: {
	clientPubkey: string;
	relays: string[];
	secret: string;
	name?: string;
	perms?: string[];
}): string {
	const params = new URLSearchParams();
	params.set('secret', opts.secret);
	if (opts.name) params.set('name', opts.name);
	if (opts.perms && opts.perms.length > 0) params.set('perms', opts.perms.join(','));
	for (const r of opts.relays) params.append('relay', r);
	return `nostrconnect://${opts.clientPubkey}?${params.toString()}`;
}

/** Connect via a user-pasted bunker:// URI or NIP-05 (e.g. "alice@nsec.app"). */
export async function connectViaBunkerURI(input: string, opts: ConnectOptions = {}): Promise<Nip46Signer> {
	const trimmed = input.trim();
	if (!trimmed) throw new Error('Enter a bunker URL or name@domain.');
	const bp: BunkerPointer | null = await parseBunkerInput(trimmed);
	if (!bp) throw new Error('Could not parse bunker input. Expected bunker:// URL or name@domain.');
	const sk = generateSecretKey();
	const clientSecretHex = bytesToHex(sk);
	const client = new NostrConnectClient({
		pool: getPool(),
		relays: bp.relays,
		clientSecretHex,
		remotePubkey: bp.pubkey,
		secret: bp.secret ?? undefined,
		onAuthUrl: opts.onAuthUrl
	});
	client.open();
	await client.connect(APP_PERMS.join(','));
	const pubkey = await client.getPublicKey();
	const signer = new Nip46Signer({
		pubkey,
		client,
		bunkerUri: trimmed,
		bunkerPubkey: bp.pubkey,
		clientSecretHex,
		relays: bp.relays
	});
	signer.persist();
	setActiveSigner(signer);
	return signer;
}

/** Build a nostrconnect:// URI for the QR / deeplink flow and start waiting for a signer. */
export function startNostrConnect(opts: ConnectOptions & { relays?: string[] } = {}): NostrConnectHandle {
	const sk = generateSecretKey();
	const clientPubkey = getPublicKey(sk);
	const clientSecretHex = bytesToHex(sk);
	const relays = opts.relays && opts.relays.length ? opts.relays : DEFAULT_NOSTRCONNECT_RELAYS;
	const secret = randomSecret();
	const uri = buildNostrConnectURI({
		clientPubkey,
		relays,
		secret,
		name: APP_NAME,
		perms: APP_PERMS
	});
	const abortCtrl = new AbortController();

	const client = new NostrConnectClient({
		pool: getPool(),
		relays,
		clientSecretHex,
		secret,
		onAuthUrl: opts.onAuthUrl
	});

	const signerPromise = (async () => {
		const remotePubkey = await client.waitForSigner(abortCtrl.signal);
		const pubkey = await client.getPublicKey();
		const signer = new Nip46Signer({
			pubkey,
			client,
			bunkerUri: uri,
			bunkerPubkey: remotePubkey,
			clientSecretHex,
			relays
		});
		signer.persist();
		setActiveSigner(signer);
		return signer;
	})();

	return {
		uri,
		clientSecretHex,
		relays,
		signerPromise,
		abort: () => {
			abortCtrl.abort();
			client.close();
		}
	};
}

// Shared in-flight promise so concurrent callers (the layout's onMount kickoff and
// any ensureSignedIn() racing it) reuse a single connect attempt.
let restoringPromise: Promise<Signer | null> | null = null;

/** Rehydrate the active NIP-46 signer from localStorage. Idempotent under concurrency. */
export async function restoreActiveSigner(): Promise<Signer | null> {
	if (getActiveSigner()) return getActiveSigner();
	if (restoringPromise) return restoringPromise;
	restoringPromise = doRestoreActiveSigner();
	try {
		return await restoringPromise;
	} finally {
		restoringPromise = null;
	}
}

async function doRestoreActiveSigner(): Promise<Signer | null> {
	const persisted = readPersistedSigner();
	if (!persisted) return null;
	try {
		const client = new NostrConnectClient({
			pool: getPool(),
			relays: persisted.relays,
			clientSecretHex: persisted.clientSecretHex,
			remotePubkey: persisted.bunkerPubkey
		});
		client.open();
		// Trust the persisted user pubkey — re-fetching it can trigger a fresh
		// auth prompt on some signers.
		const signer = new Nip46Signer({
			pubkey: persisted.pubkey,
			client,
			bunkerUri: persisted.bunkerUri,
			bunkerPubkey: persisted.bunkerPubkey,
			clientSecretHex: persisted.clientSecretHex,
			relays: persisted.relays
		});
		setActiveSigner(signer);
		return signer;
	} catch (e) {
		console.warn('[nip46] restore failed', e);
		if (typeof localStorage !== 'undefined') localStorage.removeItem('nowhere-signer-active');
		return null;
	}
}

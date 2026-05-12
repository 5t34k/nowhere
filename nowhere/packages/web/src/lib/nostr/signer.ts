import { writable, type Readable } from 'svelte/store';

export interface UnsignedEvent {
	kind: number;
	created_at: number;
	tags: string[][];
	content: string;
}

export interface SignedEvent extends UnsignedEvent {
	id: string;
	pubkey: string;
	sig: string;
}

export type SignerType = 'nip07' | 'nip46';

export interface Signer {
	readonly type: SignerType;
	readonly pubkey: string;
	getPublicKey(): Promise<string>;
	signEvent(event: UnsignedEvent): Promise<SignedEvent>;
	nip44Encrypt(thirdPartyPubkey: string, plaintext: string): Promise<string>;
	nip44Decrypt(thirdPartyPubkey: string, ciphertext: string): Promise<string>;
	disconnect(): Promise<void>;
}

const ACTIVE_KEY = 'nowhere-signer-active';

interface PersistedActiveBase {
	type: SignerType;
	pubkey: string;
}

export interface PersistedNip46 extends PersistedActiveBase {
	type: 'nip46';
	bunkerUri: string;
	bunkerPubkey: string;
	clientSecretHex: string;
	relays: string[];
}

// Only NIP-46 sessions are persisted. Browser extensions are session-only by
// design — writing a pubkey to disk would create an identity record with no
// behavioural benefit, against the project's throwaway-keys stance.
export type PersistedSigner = PersistedNip46;

// Read window.nostr lazily — extensions inject it via a content script that
// can race our bundle on first paint, so a load-time snapshot would miss it.
export function getRealNostr(): typeof window.nostr | undefined {
	return typeof window !== 'undefined' ? window.nostr : undefined;
}

export function hasRealNostrExtension(): boolean {
	return !!getRealNostr();
}

export class Nip07Signer implements Signer {
	readonly type = 'nip07' as const;
	pubkey: string;

	private constructor(pubkey: string) {
		this.pubkey = pubkey;
	}

	static async connect(): Promise<Nip07Signer> {
		const ext = getRealNostr();
		if (!ext) throw new Error('No NIP-07 browser extension detected.');
		const pk = await ext.getPublicKey();
		return new Nip07Signer(pk);
	}

	async getPublicKey(): Promise<string> {
		return this.pubkey;
	}

	async signEvent(event: UnsignedEvent): Promise<SignedEvent> {
		const ext = getRealNostr();
		if (!ext) throw new Error('NIP-07 extension is no longer available.');
		return ext.signEvent(event) as Promise<SignedEvent>;
	}

	async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
		const ext = getRealNostr();
		if (!ext?.nip44) throw new Error('Your NIP-07 extension does not support NIP-44.');
		return ext.nip44.encrypt(pubkey, plaintext);
	}

	async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
		const ext = getRealNostr();
		if (!ext?.nip44) throw new Error('Your NIP-07 extension does not support NIP-44.');
		return ext.nip44.decrypt(pubkey, ciphertext);
	}

	async disconnect(): Promise<void> {
		// nothing to tear down for an extension
	}
}

const activeStore = writable<Signer | null>(null);
let active: Signer | null = null;

export function getActiveSigner(): Signer | null {
	return active;
}

export const activeSigner: Readable<Signer | null> = { subscribe: activeStore.subscribe };

export function setActiveSigner(s: Signer | null): void {
	active = s;
	activeStore.set(s);
	if (typeof localStorage === 'undefined') return;
	if (!s) {
		localStorage.removeItem(ACTIVE_KEY);
		return;
	}
	// nip46 persists via Nip46Signer.persist(), which writes connection material
	// the bare Signer interface doesn't expose. nip07 is intentionally not persisted.
}

export async function signOut(): Promise<void> {
	const s = active;
	if (s) {
		try { await s.disconnect(); } catch { /* swallow */ }
	}
	setActiveSigner(null);
}

export function readPersistedSigner(): PersistedSigner | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(ACTIVE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { type?: string } & Partial<PersistedNip46>;
		if (
			parsed?.type === 'nip46' &&
			parsed.pubkey &&
			parsed.bunkerUri &&
			parsed.bunkerPubkey &&
			parsed.clientSecretHex
		) {
			return parsed as PersistedNip46;
		}
		// Anything else (legacy nip07 records, pre-bunkerPubkey nip46 records,
		// corrupt JSON) is stale and can't be rehydrated reliably.
		localStorage.removeItem(ACTIVE_KEY);
		return null;
	} catch {
		localStorage.removeItem(ACTIVE_KEY);
		return null;
	}
}

export function writePersistedSigner(p: PersistedSigner): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(ACTIVE_KEY, JSON.stringify(p));
}

// Cheap multi-tab sync: when another tab clears the active key, mirror the change here.
// Restore-on-write isn't done for simplicity — a tab signed in via tab A only picks up
// in tab B on the next ensureSignedIn call (which calls restoreActiveSigner).
export function installMultiTabSync(onCleared: () => void): () => void {
	if (typeof window === 'undefined') return () => {};
	const handler = (e: StorageEvent) => {
		if (e.key !== ACTIVE_KEY) return;
		if (e.newValue === null) {
			active = null;
			activeStore.set(null);
			onCleared();
		}
	};
	window.addEventListener('storage', handler);
	return () => window.removeEventListener('storage', handler);
}

// restoreActiveSigner is implemented in nip46-signer.ts because rehydrating a NIP-46
// session involves reconnecting to the bunker — which depends on the NIP-46 module.
// Importers should call that one.

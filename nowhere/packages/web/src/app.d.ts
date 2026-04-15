// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		nostr?: {
			getPublicKey(): Promise<string>;
			signEvent(event: {
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
			}>;
			nip44?: {
				encrypt(pubkey: string, plaintext: string): Promise<string>;
				decrypt(pubkey: string, ciphertext: string): Promise<string>;
			};
		};
	}
}

export {};

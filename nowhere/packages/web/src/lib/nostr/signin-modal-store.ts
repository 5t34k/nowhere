import { writable, type Readable } from 'svelte/store';

interface SignInRequest {
	resolve: (pubkey: string) => void;
	reject: (err: Error) => void;
}

const requestStore = writable<SignInRequest | null>(null);

export const signInRequest: Readable<SignInRequest | null> = { subscribe: requestStore.subscribe };

export function requestSignIn(): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		requestStore.update((existing) => {
			if (existing) existing.reject(new Error('Replaced by a newer sign-in request.'));
			return { resolve, reject };
		});
	});
}

export function resolveSignIn(pubkey: string): void {
	requestStore.update((req) => {
		req?.resolve(pubkey);
		return null;
	});
}

export function cancelSignIn(): void {
	requestStore.update((req) => {
		req?.reject(new Error('Sign-in cancelled.'));
		return null;
	});
}

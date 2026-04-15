import { writable } from 'svelte/store';
import { base64urlToBytes } from '@nowhere/codec';
import { decodeFromHash } from '../stores/site-data.js';

export const hashFragment = writable<string>('');
export const postIdFromHash = writable<string>('');
export const saltFromHash = writable<string>('');

const textDecoder = new TextDecoder();

export function initHashReader(): void {
	function update() {
		let hash = window.location.hash.slice(1); // remove #

		// Extract post-id suffix (~) first — always at the end
		const tildeIdx = hash.indexOf('~');
		let postId = '';
		if (tildeIdx !== -1) {
			postId = hash.slice(tildeIdx + 1);
			hash = hash.slice(0, tildeIdx);
		}

		// Extract salt (*) — between fragment and post-id
		const starIdx = hash.indexOf('*');
		let salt = '';
		let saltB64 = '';
		if (starIdx !== -1) {
			saltB64 = hash.slice(starIdx + 1, starIdx + 1 + 344); // cap at 256 bytes base64url
			try {
				salt = textDecoder.decode(base64urlToBytes(saltB64));
			} catch { salt = ''; }
			hash = hash.slice(0, starIdx);
		}

		postIdFromHash.set(postId);
		saltFromHash.set(salt);
		hashFragment.set(hash);
		decodeFromHash(hash);

		// Clean post-id from URL but keep salt
		if (tildeIdx !== -1) {
			const cleanHash = saltB64 ? hash + '*' + saltB64 : hash;
			window.history.replaceState(null, '', '#' + cleanHash);
		}
	}

	update();
	window.addEventListener('hashchange', update);
}

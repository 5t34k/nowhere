import { writable, derived } from 'svelte/store';
import type { SiteData } from '@nowhere/codec';
import { decode, base64urlToBytes, bytesToBase64url, DecodeError } from '@nowhere/codec';
import { verifySiteSignature } from '../nostr/verify.js';

export const siteData = writable<SiteData | null>(null);
export const decodeError = writable<string | null>(null);
// Set when the fragment is from the deprecated v1 codec (beta period).
// Triggers a different error UI instead of the generic decode error screen.
export const v1Deprecated = writable(false);
export const isLoading = writable(true);
export const siteSigned = writable(false);
export const siteFragment = writable('');

export const hasSite = derived(siteData, ($data) => $data !== null);

function isV1Error(e: unknown): boolean {
	return e instanceof DecodeError && e.code === 'V1_DEPRECATED';
}

export function decodeFromHash(fragment: string): void {
	if (!fragment) {
		siteData.set(null);
		decodeError.set(null);
		v1Deprecated.set(false);
		isLoading.set(false);
		siteSigned.set(false);
		siteFragment.set('');
		return;
	}

	// Fast path: try decoding directly (unsigned URL)
	try {
		const data = decode(fragment);
		siteData.set(data);
		decodeError.set(null);
		v1Deprecated.set(false);
		siteFragment.set(fragment);

		// Verify signature for stores and messages
		if (data.siteType === 'store' || data.siteType === 'message' || data.siteType === 'fundraiser' || data.siteType === 'petition' || data.siteType === 'discussion' || data.siteType === 'event' || data.siteType === 'drop' || data.siteType === 'art') {
			const { signed } = verifySiteSignature(fragment, data.pubkey ?? '');
			siteSigned.set(signed);
		}
		isLoading.set(false);
		return;
	} catch (e) {
		// V1 fragments will never succeed under any path — bail out immediately
		// instead of trying the signed-path retry which would also fail.
		if (isV1Error(e)) {
			siteData.set(null);
			siteSigned.set(false);
			siteFragment.set('');
			decodeError.set(null);
			v1Deprecated.set(true);
			isLoading.set(false);
			return;
		}
		// Other errors: fall through to try stripping signature
	}

	// Signed path: strip trailing 64 bytes and try again
	try {
		const fullBytes = base64urlToBytes(fragment);
		if (fullBytes.length <= 64) {
			throw new Error('Fragment too short');
		}
		const dataBytes = fullBytes.slice(0, fullBytes.length - 64);
		const unsignedFragment = bytesToBase64url(dataBytes);
		const data = decode(unsignedFragment);
		siteData.set(data);
		decodeError.set(null);
		v1Deprecated.set(false);
		siteFragment.set(unsignedFragment);

		// Verify signature for stores and messages
		if (data.siteType === 'store' || data.siteType === 'message' || data.siteType === 'fundraiser' || data.siteType === 'petition' || data.siteType === 'discussion' || data.siteType === 'event' || data.siteType === 'drop' || data.siteType === 'art') {
			const { signed } = verifySiteSignature(fragment, data.pubkey ?? '');
			siteSigned.set(signed);
		}
		isLoading.set(false);
		return;
	} catch (e) {
		// V1 detected on the signed path too — same handling
		if (isV1Error(e)) {
			siteData.set(null);
			siteSigned.set(false);
			siteFragment.set('');
			decodeError.set(null);
			v1Deprecated.set(true);
			isLoading.set(false);
			return;
		}
		// Neither unsigned nor signed decode worked
	}

	// Total failure
	siteData.set(null);
	siteSigned.set(false);
	siteFragment.set('');
	decodeError.set('Failed to decode site data');
	v1Deprecated.set(false);
	isLoading.set(false);
}

// Hash reader calls decodeFromHash directly after reading the URL —
// no auto-subscription here to avoid racing before initHashReader runs.

import { inflateRaw } from 'pako';
import type { SiteData } from './types.js';
import { deserialize } from './schema.js';
import { deserializeMessage } from './message-schema.js';
import { deserializeFundraiser } from './fundraiser-schema.js';
import { deserializePetition } from './petition-schema.js';
import { deserializeEvent } from './event-schema.js';
import { deserializeForum } from './forum-schema.js';
import { deserializeDrop } from './drop-schema.js';
import { deserializeArt } from './art-schema.js';
import { extractVersion } from './version.js';
import { DecodeError } from './errors.js';
import { restore } from './dictionary/index.js';

function base64urlToBytes(b64: string): Uint8Array {
	const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/** Max decompressed payload size (512 KB). Generous for any valid site — prevents decompression bombs. */
const MAX_DECOMPRESSED_BYTES = 512 * 1024;

/** Max base64url fragment length before we even attempt decode. */
const MAX_FRAGMENT_LENGTH = 100_000;

export function decode(fragment: string): SiteData {
	if (!fragment) {
		throw new DecodeError('Empty fragment', 'EMPTY_FRAGMENT');
	}

	if (fragment.length > MAX_FRAGMENT_LENGTH) {
		throw new DecodeError('Fragment exceeds maximum length', 'FRAGMENT_TOO_LONG');
	}

	let decompressed: string;
	try {
		const bytes = base64urlToBytes(fragment);
		const raw = inflateRaw(bytes);
		if (raw.byteLength > MAX_DECOMPRESSED_BYTES) {
			throw new DecodeError('Decompressed data exceeds maximum size', 'SIZE_EXCEEDED');
		}
		decompressed = new TextDecoder().decode(raw);
	} catch (e) {
		if (e instanceof DecodeError) throw e;
		throw new DecodeError('Failed to decompress data', 'DECOMPRESS_FAILED');
	}

	const { siteType, version, data: versioned } = extractVersion(decompressed);
	// V1 fragments are from the beta period before dictionary rebuild — they
	// can no longer be decoded. Use a distinct error code so the renderer can
	// show a specific "beta link" message instead of a generic decode error.
	if (version === 1) {
		throw new DecodeError(
			'Fragment uses the beta v1 codec which has been replaced',
			'V1_DEPRECATED'
		);
	}
	if (version !== 2) {
		throw new DecodeError(`Unsupported version: ${version}`, 'UNSUPPORTED_VERSION');
	}

	if (siteType === 'store') {
		const restored = restore(versioned);
		return { siteType: 'store', ...deserialize(restored) };
	}

	if (siteType === 'event') {
		const restored = restore(versioned);
		return deserializeEvent(restored);
	}

	if (siteType === 'message') {
		const restored = restore(versioned);
		return deserializeMessage(restored);
	}

	if (siteType === 'fundraiser') {
		const restored = restore(versioned);
		return deserializeFundraiser(restored);
	}

	if (siteType === 'petition') {
		const restored = restore(versioned);
		return deserializePetition(restored);
	}

	if (siteType === 'discussion') {
		const restored = restore(versioned);
		return deserializeForum(restored);
	}

	if (siteType === 'drop') {
		const restored = restore(versioned);
		return deserializeDrop(restored);
	}

	if (siteType === 'art') {
		const restored = restore(versioned);
		return deserializeArt(restored);
	}

	throw new DecodeError(`Unsupported site type: ${siteType}`, 'UNSUPPORTED_SITE_TYPE');
}

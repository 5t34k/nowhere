import { deflateRaw } from 'pako';
import type { StoreData, EventData, MessageData, FundraiserData, PetitionData, ForumData, DropData, ArtData } from './types.js';
import { serialize } from './schema.js';
import { serializeEvent } from './event-schema.js';
import { serializeMessage } from './message-schema.js';
import { serializeFundraiser } from './fundraiser-schema.js';
import { serializePetition } from './petition-schema.js';
import { serializeForum } from './forum-schema.js';
import { serializeDrop } from './drop-schema.js';
import { serializeArt } from './art-schema.js';
import { prefixVersion } from './version.js';
import { substitute } from './dictionary/index.js';

export interface EncodeResult {
	fragment: string;
	length: number;
	warn: boolean;
}

function bytesToBase64url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encode(data: StoreData): EncodeResult {
	const serialized = serialize(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'store');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodeEvent(data: EventData): EncodeResult {
	const serialized = serializeEvent(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'event');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodeMessage(data: MessageData): EncodeResult {
	const serialized = serializeMessage(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'message');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodeFundraiser(data: FundraiserData): EncodeResult {
	const serialized = serializeFundraiser(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'fundraiser');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodePetition(data: PetitionData): EncodeResult {
	const serialized = serializePetition(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'petition');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodeForum(data: ForumData): EncodeResult {
	const serialized = serializeForum(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'discussion');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodeDrop(data: DropData): EncodeResult {
	const serialized = serializeDrop(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'drop');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 2000
	};
}

export function encodeArt(data: ArtData): EncodeResult {
	const serialized = serializeArt(data);
	const substituted = substitute(serialized);
	const versioned = prefixVersion(substituted, 'art');
	const compressed = deflateRaw(new TextEncoder().encode(versioned));
	const fragment = bytesToBase64url(compressed);
	return {
		fragment,
		length: fragment.length,
		warn: fragment.length > 1800
	};
}

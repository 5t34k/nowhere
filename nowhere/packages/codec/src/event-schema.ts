import type { EventData } from './types.js';
import {
	escapeStoreName,
	escapeDescription,
	escapeImage,
	unescapeValue,
	findNextUnescaped,
	serializeOptional,
	parseOptional
} from './schema.js';
import { ValidationError, SchemaError } from './errors.js';
import { CURRENT_VERSION } from './version.js';

// ─── Validation ──────────────────────────────────────────────

export function validateEvent(data: EventData): void {
	if (data.pubkey && data.pubkey.length !== 43) {
		throw new ValidationError('Pubkey must be 43 characters (base64url)', 'INVALID_PUBKEY');
	}
	if (!data.name || data.name.trim() === '') {
		throw new ValidationError('Event name cannot be empty', 'EMPTY_NAME');
	}
}

// ─── Serialize ───────────────────────────────────────────────
// Format: pubkey,eventName"description:image<tags

export function serializeEvent(data: EventData): string {
	validateEvent(data);

	const required = (data.pubkey ?? '') + ',' + escapeStoreName(data.name);
	const optional = serializeOptional(
		data.description,
		data.image,
		data.tags,
		escapeDescription,
		escapeImage
	);
	return required + optional;
}

// ─── Deserialize ─────────────────────────────────────────────

export function deserializeEvent(str: string): EventData {
	const commaPos = findNextUnescaped(str, ',', 0);
	if (commaPos === -1) {
		throw new SchemaError('Event must have at least pubkey and name');
	}
	const pubkey = str.slice(0, commaPos);

	const afterComma = str.slice(commaPos + 1);
	const markerPos = findNextUnescaped(afterComma, '":<', 0);
	const nameStr = markerPos === -1 ? afterComma : afterComma.slice(0, markerPos);
	const optionalStr = markerPos === -1 ? '' : afterComma.slice(markerPos);

	const name = unescapeValue(nameStr);
	const { description, image, tags } = parseOptional(optionalStr);

	return {
		version: CURRENT_VERSION,
		siteType: 'event',
		pubkey,
		name,
		description,
		image,
		tags
	};
}

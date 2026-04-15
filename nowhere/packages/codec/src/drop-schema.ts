import type { DropData } from './types.js';
import {
	escapeStoreName,
	escapeDescription,
	unescapeValue,
	findNextUnescaped,
	serializeOptional,
	parseOptional
} from './schema.js';
import { ValidationError } from './errors.js';
import { SchemaError } from './errors.js';
import { CURRENT_VERSION } from './version.js';

// ─── Validation ──────────────────────────────────────────────

export function validateDrop(data: DropData): void {
	if (data.pubkey && data.pubkey.length !== 43) {
		throw new ValidationError('Pubkey must be 43 characters (base64url)', 'INVALID_PUBKEY');
	}
	// name (title) is optional — no requirement
	// description (body) is required
	if (!data.description || data.description.trim() === '') {
		throw new ValidationError('Drop body cannot be empty', 'EMPTY_DESCRIPTION');
	}
}

// ─── Serialize ───────────────────────────────────────────────
// Format: pubkey,name"description<tags
// name = optional title (may be empty string)
// description = the drop body text

export function serializeDrop(data: DropData): string {
	validateDrop(data);

	const required = (data.pubkey ?? '') + ',' + escapeStoreName(data.name);
	const optional = serializeOptional(
		data.description,
		undefined,
		data.tags,
		escapeDescription,
		(v) => v
	);
	return required + optional;
}

// ─── Deserialize ─────────────────────────────────────────────

export function deserializeDrop(str: string): DropData {
	const commaPos = findNextUnescaped(str, ',', 0);
	if (commaPos === -1) {
		throw new SchemaError('Drop must have at least pubkey and name');
	}
	const pubkey = str.slice(0, commaPos);

	const afterComma = str.slice(commaPos + 1);
	const markerPos = findNextUnescaped(afterComma, '":<', 0);
	const nameStr = markerPos === -1 ? afterComma : afterComma.slice(0, markerPos);
	const optionalStr = markerPos === -1 ? '' : afterComma.slice(markerPos);

	const name = unescapeValue(nameStr);
	const { description, tags } = parseOptional(optionalStr);

	return {
		version: CURRENT_VERSION,
		siteType: 'drop',
		pubkey,
		name,
		description,
		tags
	};
}

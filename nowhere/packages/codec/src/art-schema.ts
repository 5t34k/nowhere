import type { ArtData } from './types.js';
import {
	escapeStoreName,
	escapeDescription,
	unescapeValue,
	findNextUnescaped,
	serializeOptional,
	parseOptional
} from './schema.js';
import { ValidationError, SchemaError } from './errors.js';
import { CURRENT_VERSION } from './version.js';

// ─── Validation ──────────────────────────────────────────────

export function validateArt(data: ArtData): void {
	if (data.pubkey && data.pubkey.length !== 43) {
		throw new ValidationError('Pubkey must be 43 characters (base64url)', 'INVALID_PUBKEY');
	}
	if (!data.svg || data.svg.trim() === '') {
		throw new ValidationError('Art SVG cannot be empty', 'EMPTY_SVG');
	}
}

// ─── Serialize ───────────────────────────────────────────────
// Format: pubkey,name"svg<tags
// name = optional display title (may be empty string)
// svg  = the SVG markup (stored in description position)

export function serializeArt(data: ArtData): string {
	validateArt(data);

	const required = (data.pubkey ?? '') + ',' + escapeStoreName(data.name);
	const optional = serializeOptional(
		data.svg,
		undefined,
		data.tags,
		escapeDescription,
		(v) => v
	);
	return required + optional;
}

// ─── Deserialize ─────────────────────────────────────────────

export function deserializeArt(str: string): ArtData {
	const commaPos = findNextUnescaped(str, ',', 0);
	if (commaPos === -1) {
		throw new SchemaError('Art must have at least pubkey and name');
	}
	const pubkey = str.slice(0, commaPos);

	const afterComma = str.slice(commaPos + 1);
	const markerPos = findNextUnescaped(afterComma, '":<', 0);
	const nameStr = markerPos === -1 ? afterComma : afterComma.slice(0, markerPos);
	const optionalStr = markerPos === -1 ? '' : afterComma.slice(markerPos);

	const name = unescapeValue(nameStr);
	const { description: svg, tags } = parseOptional(optionalStr);

	return {
		version: CURRENT_VERSION,
		siteType: 'art',
		pubkey,
		name,
		svg,
		tags
	};
}

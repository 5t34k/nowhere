import type { PetitionData, Tag } from './types.js';
import {
	escapeStoreName,
	escapeDescription,
	escapeImage,
	unescapeValue,
	findNextUnescaped,
	serializeOptional,
	parseOptional
} from './schema.js';
import { ValidationError } from './errors.js';
import { SchemaError } from './errors.js';
import { CURRENT_VERSION } from './version.js';

// ─── Validation ──────────────────────────────────────────────

export function validatePetition(data: PetitionData): void {
	if (!data.pubkey || data.pubkey.length !== 43) {
		throw new ValidationError('Pubkey must be 43 characters (base64url)', 'INVALID_PUBKEY');
	}
	if (!data.name || data.name.trim() === '') {
		throw new ValidationError('Petition title cannot be empty', 'EMPTY_NAME');
	}
}

// ─── Serialize ───────────────────────────────────────────────
// Format: pubkey,petitionTitle"description:image<tags

export function serializePetition(data: PetitionData): string {
	validatePetition(data);

	const required = data.pubkey + ',' + escapeStoreName(data.name);
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

export function deserializePetition(str: string): PetitionData {
	// Split on first unescaped `,` → pubkey, rest
	const commaPos = findNextUnescaped(str, ',', 0);
	if (commaPos === -1) {
		throw new SchemaError('Petition must have at least pubkey and title');
	}
	const pubkey = str.slice(0, commaPos);

	// After comma: name is everything up to first marker or end
	const afterComma = str.slice(commaPos + 1);
	const markerPos = findNextUnescaped(afterComma, '":<', 0);
	const nameStr = markerPos === -1 ? afterComma : afterComma.slice(0, markerPos);
	const optionalStr = markerPos === -1 ? '' : afterComma.slice(markerPos);

	const name = unescapeValue(nameStr);
	const { description, image, tags } = parseOptional(optionalStr);

	return {
		version: CURRENT_VERSION,
		siteType: 'petition',
		pubkey,
		name,
		description,
		image,
		tags
	};
}

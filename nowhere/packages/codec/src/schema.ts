import type { StoreData, Item, Tag } from './types.js';
import { serializeTags, parseTags } from './tags.js';
import { SchemaError, ValidationError } from './errors.js';
import { CURRENT_VERSION } from './version.js';

const ITEM_SEP = '|';
const STORE_SEP = ';';

function encodePrice(price: number): string {
	const cents = Math.round(price * 100);
	return cents.toString(36);
}

function decodePrice(encoded: string): number {
	return parseInt(encoded, 36) / 100;
}

// ─── Per-field escape functions (Proposal B) ─────────────────

// Store name: commas OK (parser splits on first `,` only), escape markers and delimiters
export function escapeStoreName(v: string): string {
	return v
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\q')
		.replace(/:/g, '\\o')
		.replace(/</g, '\\l')
		.replace(/;/g, '\\s');
}

// Item name: must escape `,` (items split on first `,` for price)
function escapeItemName(v: string): string {
	return v
		.replace(/\\/g, '\\\\')
		.replace(/,/g, '\\c')
		.replace(/"/g, '\\q')
		.replace(/:/g, '\\o')
		.replace(/</g, '\\l')
		.replace(/\|/g, '\\p');
}

// Description: after `"` marker, before `:` or `<` or `|` or `;`
export function escapeDescription(v: string): string {
	return v
		.replace(/\\/g, '\\\\')
		.replace(/:/g, '\\o')
		.replace(/</g, '\\l')
		.replace(/\|/g, '\\p')
		.replace(/;/g, '\\s');
}

// Image: after `:` marker, before `<` or `|` or `;`
export function escapeImage(v: string): string {
	return v
		.replace(/\\/g, '\\\\')
		.replace(/</g, '\\l')
		.replace(/\|/g, '\\p')
		.replace(/;/g, '\\s');
}

// Single unescape handles all codes
export function unescapeValue(v: string): string {
	let result = '';
	for (let i = 0; i < v.length; i++) {
		if (v[i] === '\\' && i + 1 < v.length) {
			const next = v[i + 1];
			if (next === 'c') result += ',';
			else if (next === 'p') result += '|';
			else if (next === 's') result += ';';
			else if (next === 'd') result += '{';
			else if (next === 'q') result += '"';
			else if (next === 'o') result += ':';
			else if (next === 'l') result += '<';
			else if (next === '\\') result += '\\';
			else result += '\\' + next;
			i++;
		} else {
			result += v[i];
		}
	}
	return result;
}

// ─── Helper: find next unescaped char ────────────────────────

export function findNextUnescaped(str: string, chars: string, from: number): number {
	for (let i = from; i < str.length; i++) {
		if (str[i] === '\\' && i + 1 < str.length) {
			i++; // skip escaped char
		} else if (chars.includes(str[i])) {
			return i;
		}
	}
	return -1;
}

// ─── Split on unescaped separator ────────────────────────────

function splitEscaped(str: string, sep: string): string[] {
	const parts: string[] = [];
	let current = '';
	for (let i = 0; i < str.length; i++) {
		if (str[i] === '\\' && i + 1 < str.length) {
			current += str[i] + str[i + 1];
			i++;
		} else if (str[i] === sep) {
			parts.push(current);
			current = '';
		} else {
			current += str[i];
		}
	}
	parts.push(current);
	return parts;
}

// ─── Serialize optional fields with prefix markers ───────────

export function serializeOptional(
	desc: string | undefined,
	image: string | undefined,
	tags: Tag[],
	escDesc: (v: string) => string,
	escImg: (v: string) => string
): string {
	let result = '';
	if (desc) result += '"' + escDesc(desc);
	if (image) result += ':' + escImg(image);
	if (tags.length > 0) result += '<' + serializeTags(tags);
	return result;
}

// ─── Parse optional fields from prefix markers ──────────────

export function parseOptional(str: string): {
	description?: string;
	image?: string;
	tags: Tag[];
} {
	let description: string | undefined;
	let image: string | undefined;
	let tags: Tag[] = [];

	// Find positions of unescaped markers in order: ", :, <
	let pos = 0;
	let descStart = -1;
	let imageStart = -1;
	let tagsStart = -1;

	// Scan for markers in order
	for (let i = pos; i < str.length; i++) {
		if (str[i] === '\\' && i + 1 < str.length) {
			i++; // skip escaped
		} else if (str[i] === '"' && descStart === -1 && imageStart === -1 && tagsStart === -1) {
			descStart = i;
		} else if (str[i] === ':' && imageStart === -1 && tagsStart === -1) {
			imageStart = i;
		} else if (str[i] === '<' && tagsStart === -1) {
			tagsStart = i;
		}
	}

	if (descStart !== -1) {
		const end = imageStart !== -1 ? imageStart : tagsStart !== -1 ? tagsStart : str.length;
		description = unescapeValue(str.slice(descStart + 1, end));
	}
	if (imageStart !== -1) {
		const end = tagsStart !== -1 ? tagsStart : str.length;
		image = unescapeValue(str.slice(imageStart + 1, end));
	}
	if (tagsStart !== -1) {
		tags = parseTags(str.slice(tagsStart + 1));
	}

	return { description, image, tags };
}

// ─── Validation ──────────────────────────────────────────────

export function validate(data: StoreData): void {
	if (!data.pubkey || data.pubkey.length !== 43) {
		throw new ValidationError('Pubkey must be 43 characters (base64url)', 'INVALID_PUBKEY');
	}
	for (const item of data.items) {
		if (!item.name || item.name.trim() === '') {
			throw new ValidationError('Item name cannot be empty', 'EMPTY_ITEM_NAME');
		}
		if (item.price < 0) {
			throw new ValidationError('Item price cannot be negative', 'NEGATIVE_PRICE');
		}
	}
}

// ─── Serialize ───────────────────────────────────────────────

function serializeItem(item: Item): string {
	const required = escapeItemName(item.name) + ',' + encodePrice(item.price);
	const optional = serializeOptional(
		item.description,
		item.image,
		item.tags,
		escapeDescription,
		escapeImage
	);
	return required + optional;
}

export function serialize(data: StoreData): string {
	validate(data);

	const required = data.pubkey + ',' + escapeStoreName(data.name);
	const optional = serializeOptional(
		data.description,
		data.image,
		data.tags,
		escapeDescription,
		escapeImage
	);
	const storeStr = required + optional;

	const itemsStr = data.items.map(serializeItem).join(ITEM_SEP);

	return storeStr + STORE_SEP + itemsStr;
}

// ─── Deserialize ─────────────────────────────────────────────

function deserializeItem(str: string): Item {
	// Split on first unescaped `,` → name, rest
	const commaPos = findNextUnescaped(str, ',', 0);
	if (commaPos === -1) {
		throw new SchemaError('Item must have at least name and price');
	}
	const name = unescapeValue(str.slice(0, commaPos));

	// After comma: price is everything up to first marker or end
	const afterComma = str.slice(commaPos + 1);
	const markerPos = findNextUnescaped(afterComma, '":<', 0);
	const priceStr = markerPos === -1 ? afterComma : afterComma.slice(0, markerPos);
	const optionalStr = markerPos === -1 ? '' : afterComma.slice(markerPos);

	const { description, image, tags } = parseOptional(optionalStr);

	return {
		name,
		price: decodePrice(priceStr),
		description,
		image,
		tags
	};
}

export function deserialize(str: string): StoreData {
	// Split on first unescaped `;` → store header + items
	const semiPos = findNextUnescaped(str, STORE_SEP, 0);
	if (semiPos === -1) {
		throw new SchemaError('Missing store/items separator');
	}

	const storeStr = str.slice(0, semiPos);
	const itemsStr = str.slice(semiPos + 1);

	// Store: split on first unescaped `,` → pubkey, rest
	const commaPos = findNextUnescaped(storeStr, ',', 0);
	if (commaPos === -1) {
		throw new SchemaError('Store must have at least pubkey and name');
	}
	const pubkey = storeStr.slice(0, commaPos);

	// After comma: name is everything up to first marker or end
	const afterComma = storeStr.slice(commaPos + 1);
	const markerPos = findNextUnescaped(afterComma, '":<', 0);
	const nameStr = markerPos === -1 ? afterComma : afterComma.slice(0, markerPos);
	const optionalStr = markerPos === -1 ? '' : afterComma.slice(markerPos);

	const name = unescapeValue(nameStr);
	const { description, image, tags } = parseOptional(optionalStr);

	// Items: split on unescaped `|`
	const itemStrings = splitEscaped(itemsStr, ITEM_SEP);
	const items = itemStrings.filter((s) => s.length > 0).map(deserializeItem);

	return {
		version: CURRENT_VERSION,
		pubkey,
		name,
		description,
		image,
		tags,
		items
	};
}

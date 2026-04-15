import type { Tag } from './types.js';
import { phraseToCode, codeToPhrase, sortedPhrasesDesc } from './dictionary/phrases.js';

const STX = '\x02';

const BOOL_TAG_ORDER = 'EeNnAaPpZzJGkdfoyCUuRSLVbB9';
const BOOL_TAG_BITS = new Map<string, number>();
for (let i = 0; i < BOOL_TAG_ORDER.length; i++) {
	BOOL_TAG_BITS.set(BOOL_TAG_ORDER[i], i);
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeBitfield(bits: number): string {
	if (bits >> 24) {
		// 5-char bitfield for bits 24+
		return (
			B64URL[(bits >> 24) & 0x3f] +
			B64URL[(bits >> 18) & 0x3f] +
			B64URL[(bits >> 12) & 0x3f] +
			B64URL[(bits >> 6) & 0x3f] +
			B64URL[bits & 0x3f]
		);
	}
	if (bits >> 18) {
		// 4-char bitfield for bits 18+
		return (
			B64URL[(bits >> 18) & 0x3f] +
			B64URL[(bits >> 12) & 0x3f] +
			B64URL[(bits >> 6) & 0x3f] +
			B64URL[bits & 0x3f]
		);
	}
	return (
		B64URL[(bits >> 12) & 0x3f] +
		B64URL[(bits >> 6) & 0x3f] +
		B64URL[bits & 0x3f]
	);
}

function b64idx(ch: string): number {
	const i = B64URL.indexOf(ch);
	return i >= 0 ? i : 0; // treat invalid chars as 0 instead of -1 (which corrupts via bitwise OR)
}

function decodeBitfield(str: string): number {
	if (str.length >= 5) {
		return (
			(b64idx(str[0]) << 24) |
			(b64idx(str[1]) << 18) |
			(b64idx(str[2]) << 12) |
			(b64idx(str[3]) << 6) |
			b64idx(str[4])
		);
	}
	if (str.length >= 4) {
		return (
			(b64idx(str[0]) << 18) |
			(b64idx(str[1]) << 12) |
			(b64idx(str[2]) << 6) |
			b64idx(str[3])
		);
	}
	return (
		(b64idx(str[0]) << 12) |
		(b64idx(str[1]) << 6) |
		b64idx(str[2])
	);
}

function escapeTagValue(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\{/g, '\\d')
		.replace(/\|/g, '\\p')
		.replace(/;/g, '\\s');
}

function unescapeTagValue(value: string): string {
	let result = '';
	for (let i = 0; i < value.length; i++) {
		if (value[i] === '\\' && i + 1 < value.length) {
			const next = value[i + 1];
			if (next === 'd') {
				result += '{';
			} else if (next === 'p') {
				result += '|';
			} else if (next === 's') {
				result += ';';
			} else if (next === '\\') {
				result += '\\';
			} else {
				result += '\\' + next;
			}
			i++;
		} else {
			result += value[i];
		}
	}
	return result;
}

export function serializeTags(tags: Tag[]): string {
	const boolTags: Tag[] = [];
	const valueTags: Tag[] = [];

	for (const t of tags) {
		if (t.value === undefined && BOOL_TAG_BITS.has(t.key)) {
			boolTags.push(t);
		} else {
			valueTags.push(t);
		}
	}

	const parts: string[] = [];

	// Bitfield when 3+ known booleans, otherwise individual
	if (boolTags.length >= 3) {
		let bits = 0;
		for (const t of boolTags) {
			bits |= 1 << BOOL_TAG_BITS.get(t.key)!;
		}
		parts.push('!' + encodeBitfield(bits));
	} else {
		for (const t of boolTags) {
			parts.push(t.key);
		}
	}

	for (const t of valueTags) {
		if (t.value === undefined) {
			parts.push(t.key);
			continue;
		}

		// Check exact phrase match first
		const exactCode = phraseToCode.get(t.value);
		if (exactCode) {
			parts.push(`${t.key}${STX}${exactCode}`);
			continue;
		}

		// Check prefix match (phrase + \n\n + custom text)
		let matched = false;
		for (const [phrase, code] of sortedPhrasesDesc) {
			if (t.value.startsWith(phrase + '\n\n')) {
				const custom = t.value.slice(phrase.length + 2);
				parts.push(`${t.key}${STX}${code}${escapeTagValue(custom)}`);
				matched = true;
				break;
			}
		}
		if (matched) continue;

		// Compact country codes: strip dots for c/x tags
		if (t.key === 'c' || t.key === 'x') {
			parts.push(`${t.key}${t.value.replace(/\./g, '')}`);
			continue;
		}

		// Normal encoding
		parts.push(`${t.key}${escapeTagValue(t.value)}`);
	}

	return parts.join('{');
}

export function parseTags(str: string): Tag[] {
	if (!str) return [];
	const tags: Tag[] = [];
	const parts: string[] = [];
	let current = '';
	for (let i = 0; i < str.length; i++) {
		if (str[i] === '\\' && i + 1 < str.length) {
			current += str[i] + str[i + 1];
			i++;
		} else if (str[i] === '{') {
			parts.push(current);
			current = '';
		} else {
			current += str[i];
		}
	}
	parts.push(current);

	for (const part of parts) {
		if (part.length === 0) continue;
		const key = part[0];

		// Bitfield tag (3, 4, or 5 base64url chars)
		if (key === '!' && part.length >= 4) {
			const bfLen = part.length >= 6 ? 5 : part.length >= 5 ? 4 : 3;
			const bits = decodeBitfield(part.slice(1, 1 + bfLen));
			for (let i = 0; i < BOOL_TAG_ORDER.length; i++) {
				if (bits & (1 << i)) {
					tags.push({ key: BOOL_TAG_ORDER[i], value: undefined });
				}
			}
			continue;
		}

		const rawValue = part.slice(1);
		let value: string | undefined;
		if (rawValue.length === 0) {
			value = undefined;
		} else if (rawValue[0] === STX) {
			const code = rawValue.slice(1, 3);
			const phrase = codeToPhrase.get(code);
			const rest = rawValue.slice(3);
			if (phrase) {
				value = rest ? phrase + '\n\n' + unescapeTagValue(rest) : phrase;
			} else {
				value = rawValue; // unknown code, preserve as-is
			}
		} else {
			value = unescapeTagValue(rawValue);
		}

		// Re-insert dots for compact country codes
		if ((key === 'c' || key === 'x') && value && value.length > 2 && !value.includes('.')) {
			value = value.match(/.{1,2}/g)!.join('.');
		}

		tags.push({ key, value });
	}
	return tags;
}

export function resolveTags(storeTags: Tag[], itemTags: Tag[]): Tag[] {
	const merged = new Map<string, Tag>();
	for (const tag of storeTags) {
		merged.set(tag.key, tag);
	}
	for (const tag of itemTags) {
		merged.set(tag.key, tag);
	}
	return Array.from(merged.values());
}

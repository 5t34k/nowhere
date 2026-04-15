import { sortedWords, codeToWord } from './words.js';
import { wordToTier2, codeToWordA, codeToWordB, codeToWordC } from './tier2.js';
import { sortedPrefixes, codeToPrefix } from './urls.js';

const SENTINEL = '~';
const SENTINEL_A = '`';
const SENTINEL_B = '|';
const SENTINEL_C = '^';

// Build unified word list (Tier 1 + Tier 2), sorted longest-first
type WordEntry = { word: string; emit: (cap: boolean) => string };
const allWords: WordEntry[] = [];

// Tier 1 words: ~{code} or ~!{code}
for (const [word, code] of sortedWords) {
	allWords.push({
		word,
		emit: (cap) => `${SENTINEL}${cap ? '!' : ''}${code}`
	});
}

// Tier 2 words: {sentinel}{code} or {sentinel}!{code}
for (const [word, { sentinel, code }] of wordToTier2) {
	// Skip if already in Tier 1 (Tier 1 takes priority — shorter encoding)
	if (allWords.some((e) => e.word === word)) continue;
	allWords.push({
		word,
		emit: (cap) => `${sentinel}${cap ? '!' : ''}${code}`
	});
}

// Sort by word length descending for longest-match-first
allWords.sort((a, b) => b.word.length - a.word.length);

// No-space marker: signals "don't insert implicit space after this word code"
const NO_SPACE = '\x01';

// Substitute dictionary words and URL prefixes with short codes.
export function substitute(text: string): string {
	// Strip any SOH chars from input (defensive — never appears in natural text)
	let result = text.replace(/\x01/g, '');

	// Escape all 4 sentinel characters by doubling
	result = result.replace(/[~`|^]/g, (ch) => ch + ch);

	// Substitute URL prefixes (longest-match-first)
	for (const [prefix, code] of sortedPrefixes) {
		const escapedPrefix = prefix.replace(/[~`|^]/g, (ch) => ch + ch);
		while (result.includes(escapedPrefix)) {
			result = result.replace(escapedPrefix, `${SENTINEL}U${code}`);
		}
	}

	// Substitute words (longest-match-first, case-insensitive word boundaries)
	for (const entry of allWords) {
		const pattern = new RegExp(`\\b${escapeRegex(entry.word)}\\b`, 'gi');
		result = result.replace(pattern, (match) => {
			// Only substitute all-lowercase or Title Case — skip camelCase/other mixed case
			const isAllLower = match === match.toLowerCase();
			const isTitleCase =
				match[0] === match[0].toUpperCase() &&
				match[0] !== match[0].toLowerCase() &&
				match.slice(1) === match.slice(1).toLowerCase();
			if (!isAllLower && !isTitleCase) return match;
			return entry.emit(isTitleCase) + NO_SPACE;
		});
	}

	// Post-process: \x01 followed by space → remove both (space becomes implicit on restore)
	// Remaining \x01 (before non-space or end-of-string) stays as no-space marker
	result = result.replace(/\x01 /g, '');

	return result;
}

// Restore dictionary codes back to original words and URLs.
export function restore(text: string): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		const ch = text[i];

		if (ch === SENTINEL) {
			// Tilde sentinel: Tier 1 words, URLs, emojis
			if (i + 1 < text.length && text[i + 1] === SENTINEL) {
				result += '~';
				i += 2;
				continue;
			}
			i++; // skip sentinel

			// Check for capitalization marker
			let capitalize = false;
			if (i < text.length && text[i] === '!') {
				capitalize = true;
				i++;
			}

			if (i >= text.length) break;

			const type = text[i];
			i++;

			if (type === 'U') {
				// URL prefix: single char code
				const code = text[i];
				i++;
				result += codeToPrefix.get(code) ?? `~U${code}`;
			} else {
				// Tier 1 word: type IS the 1-char code
				let word = codeToWord.get(type) ?? `~${type}`;
				if (capitalize) {
					word = word[0].toUpperCase() + word.slice(1);
				}
				result += word;
				// Implicit space: consume no-space marker or insert space
				if (i < text.length && text[i] === NO_SPACE) {
					i++; // consume marker, no space
				} else {
					result += ' ';
				}
			}
		} else if (ch === SENTINEL_A || ch === SENTINEL_B || ch === SENTINEL_C) {
			// Tier 2 sentinels: `, |, ^
			if (i + 1 < text.length && text[i + 1] === ch) {
				// Escaped sentinel — output literal character
				result += ch;
				i += 2;
				continue;
			}
			i++; // skip sentinel

			// Check for capitalization marker
			let capitalize = false;
			if (i < text.length && text[i] === '!') {
				capitalize = true;
				i++;
			}

			// Read 2-char code
			const code = text.slice(i, i + 2);
			i += 2;

			// Look up in the appropriate decoding map
			const map =
				ch === SENTINEL_A ? codeToWordA : ch === SENTINEL_B ? codeToWordB : codeToWordC;
			let word = map.get(code) ?? `${ch}${code}`;
			if (capitalize) {
				word = word[0].toUpperCase() + word.slice(1);
			}
			result += word;
			// Implicit space: consume no-space marker or insert space
			if (i < text.length && text[i] === NO_SPACE) {
				i++; // consume marker, no space
			} else {
				result += ' ';
			}
		} else {
			result += ch;
			i++;
		}
	}
	return result;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

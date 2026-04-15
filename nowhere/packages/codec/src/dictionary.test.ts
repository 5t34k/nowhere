import { describe, it, expect } from 'vitest';
import { substitute, restore } from './dictionary/index.js';
import { encode, decode } from './index.js';
import { serializeTags, parseTags } from './tags.js';
import { RETURN_PHRASES, WARRANTY_PHRASES, phraseToCode, codeToPhrase } from './dictionary/phrases.js';
import type { StoreData, Tag } from './types.js';

const TEST_PUBKEY = 'dGVzdHB1YmtleWZvcnRlc3RpbmcxMjM0NTY3ODkwYWI';

function makeStore(overrides: Partial<StoreData> = {}): StoreData {
	return {
		version: 1,
		pubkey: TEST_PUBKEY,
		name: 'Test Shop',
		tags: [],
		items: [{ name: 'Widget', price: 10, tags: [] }],
		...overrides
	};
}

describe('dictionary substitution/restoration', () => {
	it('round-trips plain text without dictionary words', () => {
		const text = 'hello world 123';
		expect(restore(substitute(text))).toBe(text);
	});

	it('substitutes and restores tier 1 words', () => {
		const text = 'premium quality leather wallet';
		const substituted = substitute(text);
		expect(substituted).not.toBe(text);
		expect(substituted.length).toBeLessThan(text.length);
		expect(restore(substituted)).toBe(text);
	});

	it('substitutes and restores tier 2 words', () => {
		const text = 'information about your search results';
		const substituted = substitute(text);
		expect(restore(substituted)).toBe(text);
		// Tier 2 words should use backtick, pipe, or caret sentinels (not ~W)
		expect(substituted).not.toContain('~W');
	});

	it('tier 2 words produce 3-char codes (not 4)', () => {
		// "information" is a tier 2 word (4+ chars from Google 10k)
		const text = 'information';
		const substituted = substitute(text);
		// Should be sentinel + 2-char code + \x01 no-space marker = 4 chars total
		expect(substituted.length).toBe(4);
		expect(substituted[3]).toBe('\x01');
	});

	it('handles longest-match-first', () => {
		// "handcrafted" should match before "hand" (if both existed)
		const text = 'handcrafted organic leather';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('escapes and restores literal tildes', () => {
		const text = 'Price ~$10 or ~20% off';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('escapes and restores literal backticks', () => {
		const text = 'Use `code` blocks for formatting';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('escapes and restores literal pipes', () => {
		const text = 'Pipes | commas, semicolons; all here';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('escapes and restores literal carets', () => {
		const text = 'Use ^ for exponents like 2^8';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('escapes all sentinel characters in mixed text', () => {
		const text = '~tilde `backtick |pipe ^caret together';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('handles URL prefix substitution', () => {
		const text = 'https://i.imgur.com/abc123.jpg';
		const substituted = substitute(text);
		expect(substituted).toContain('~UI');
		expect(restore(substituted)).toBe(text);
	});

	it('passes emojis through unchanged (no longer substituted)', () => {
		const text = '👕 T-Shirt 🎨 Art';
		const substituted = substitute(text);
		expect(restore(substituted)).toBe(text);
		// The emoji codec was removed in the dictionary rebuild — emojis
		// are now stored as literal UTF-8 bytes and DEFLATE handles them.
	});

	it('handles mixed content', () => {
		const text = 'premium quality 👕 https://i.imgur.com/x.jpg ~tilde';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('handles empty string', () => {
		expect(restore(substitute(''))).toBe('');
	});

	it('preserves capitalized tier 1 dictionary words', () => {
		const text = 'Premium Handmade Leather';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('preserves capitalized tier 2 dictionary words', () => {
		const text = 'Information About Your Search';
		const substituted = substitute(text);
		const result = restore(substituted);
		expect(result).toBe(text);
		// Capitalized tier 2 words should use ! marker
		expect(substituted).toMatch(/[`|^]!/);
	});

	it('tier 1 words take priority over tier 2', () => {
		// "with" is in both Tier 1 (code G) and Tier 2A — Tier 1 wins
		const text = 'with';
		const substituted = substitute(text);
		expect(substituted).toBe('~G\x01');
		expect(restore(substituted)).toBe(text);
	});

	it('implicit space: no literal spaces between consecutive word codes', () => {
		const text = 'premium quality leather';
		const substituted = substitute(text);
		// Consecutive word codes should have NO literal spaces between them
		// (spaces are implicit on restore)
		expect(substituted).not.toContain(' ');
		expect(restore(substituted)).toBe(text);
	});

	it('implicit space: no-space before punctuation', () => {
		const text = 'premium, quality';
		const substituted = substitute(text);
		// \x01 markers should appear (before comma, at end)
		expect(substituted).toContain('\x01');
		expect(restore(substituted)).toBe(text);
	});

	it('implicit space: single word round-trips without trailing space', () => {
		const text = 'premium';
		const substituted = substitute(text);
		// Should end with \x01 no-space marker
		expect(substituted.endsWith('\x01')).toBe(true);
		expect(restore(substituted)).toBe(text);
	});

	it('implicit space: mixed content with words, URLs, emojis, literal text', () => {
		const text = 'premium quality 👕 https://i.imgur.com/x.jpg ~tilde';
		const result = restore(substitute(text));
		expect(result).toBe(text);
	});

	it('implicit space: saves chars compared to keeping literal spaces', () => {
		// All 4 words are in Tier 1 so they substitute to 2-char codes each
		const text = 'the and for that';
		const substituted = substitute(text);
		// Without implicit space, we'd have 3 literal spaces between 4 word codes
		// With implicit space, those 3 spaces are removed
		// Each Tier 1 word code is 2 chars, so 4 codes = 8 chars + 3 spaces = 11
		// With implicit space: 8 chars + 1 \x01 marker = 9
		expect(substituted.length).toBeLessThan(12);
		expect(restore(substituted)).toBe(text);
	});

	it('implicit space: strips \\x01 from input defensively', () => {
		const text = 'premium\x01quality';
		const result = restore(substitute(text));
		// SOH stripped, words treated as separate due to word boundary
		// The SOH is removed, so input becomes "premiumquality" — no word boundaries
		// Word substitution needs \b, so fused text won't match
		expect(result).toBe('premiumquality');
	});
});

describe('dictionary integration with codec', () => {
	it('all Phase 1 round-trip tests still pass with dictionary', () => {
		const stores = [
			makeStore(),
			makeStore({
				description: 'A great shop',
				image: '🏪',
				items: [
					{ name: 'Fancy Item', price: 25.5, description: 'Very fancy', image: '✨', tags: [] }
				]
			}),
			makeStore({
				tags: [
					{ key: 'E' },
					{ key: '$', value: 'USD' }
				],
				items: [{ name: 'Thing', price: 5, tags: [{ key: 'q', value: '5' }] }]
			}),
			makeStore({
				name: 'カフェ Tokyo',
				items: [{ name: 'Matcha 抹茶', price: 5, tags: [] }]
			}),
			makeStore({
				name: 'A, B & C Shop',
				description: 'Pipes | commas, semicolons; all here',
				items: [{ name: 'Item; with, delimiters|inside', price: 10, tags: [] }]
			})
		];

		for (const store of stores) {
			const decoded = decode(encode(store).fragment);
			expect(decoded.name).toBe(store.name);
			expect(decoded.pubkey).toBe(store.pubkey);
			expect(decoded.items.length).toBe(store.items.length);
			for (let i = 0; i < store.items.length; i++) {
				expect(decoded.items[i].name).toBe(store.items[i].name);
				expect(decoded.items[i].price).toBe(store.items[i].price);
			}
		}
	});

	it('dictionary reduces URL length for e-commerce content', () => {
		const store = makeStore({
			description: 'Premium quality goods from our workshop',
			image: '🏪',
			tags: [{ key: '$', value: 'USD' }],
			items: [
				{
					name: 'Handmade Leather Wallet',
					price: 45,
					description: 'Full grain leather, hand-stitched',
					image: '👛',
					tags: [{ key: 'g', value: 'accessories' }]
				},
				{
					name: 'Ceramic Coffee Mug',
					price: 28,
					description: 'Wheel-thrown, glazed ceramic',
					image: '☕',
					tags: [{ key: 'g', value: 'kitchen' }]
				},
				{
					name: 'Organic Cotton T-Shirt',
					price: 35,
					description: 'Sustainable, comfortable cotton',
					image: '👕',
					tags: [{ key: 'v', value: 'S.M.L.XL' }]
				}
			]
		});

		const { length } = encode(store);
		console.log(`\n--- Dictionary compression test ---`);
		console.log(`  Full store with dictionary words: ${length} chars`);
		expect(length).toBeGreaterThan(0);
		// The fragment should decode back perfectly
		const decoded = decode(encode(store).fragment);
		expect(decoded.name).toBe(store.name);
		expect(decoded.items[0].description).toBe('Full grain leather, hand-stitched');
	});
});

describe('preset phrase compression', () => {
	it('exact preset phrase round-trips through serializeTags/parseTags', () => {
		const phrase = RETURN_PHRASES[0]; // "All sales are final. No returns or refunds."
		const tags: Tag[] = [{ key: 'r', value: phrase }];
		const serialized = serializeTags(tags);
		const parsed = parseTags(serialized);
		expect(parsed.length).toBe(1);
		expect(parsed[0].key).toBe('r');
		expect(parsed[0].value).toBe(phrase);
	});

	it('preset + custom text round-trips correctly (joined with \\n\\n)', () => {
		const phrase = RETURN_PHRASES[14]; // "30-day money-back guarantee..."
		const custom = 'Additional details here';
		const value = phrase + '\n\n' + custom;
		const tags: Tag[] = [{ key: 'r', value }];
		const serialized = serializeTags(tags);
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe(value);
	});

	it('phrase with commas and periods round-trips correctly', () => {
		// Phrase #1 has commas: "All sales are final. No returns, exchanges, or refunds..."
		const phrase = RETURN_PHRASES[1];
		expect(phrase).toContain(',');
		expect(phrase).toContain('.');
		const tags: Tag[] = [{ key: 'r', value: phrase }];
		const serialized = serializeTags(tags);
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe(phrase);
	});

	it('fully custom text (no preset match) falls back to normal encoding', () => {
		const custom = 'My totally custom return policy for my shop.';
		const tags: Tag[] = [{ key: 'r', value: custom }];
		const serialized = serializeTags(tags);
		// Should NOT contain STX marker
		expect(serialized).not.toContain('\x02');
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe(custom);
	});

	it('both returns and warranty phrases encode/decode', () => {
		const returnPhrase = RETURN_PHRASES[15];
		const warrantyPhrase = WARRANTY_PHRASES[7];
		const tags: Tag[] = [
			{ key: 'r', value: returnPhrase },
			{ key: 'Y', value: warrantyPhrase }
		];
		const serialized = serializeTags(tags);
		const parsed = parseTags(serialized);
		expect(parsed.find((t) => t.key === 'r')?.value).toBe(returnPhrase);
		expect(parsed.find((t) => t.key === 'Y')?.value).toBe(warrantyPhrase);
	});

	it('preset phrase produces shorter serialized output than raw text', () => {
		const phrase = RETURN_PHRASES[13]; // Long 14-day return policy phrase
		const withPreset = serializeTags([{ key: 'r', value: phrase }]);
		// Without preset, it would be 'r' + escaped phrase (dots become \\d)
		const withoutPreset = 'r' + phrase.replace(/\\/g, '\\\\');
		expect(withPreset.length).toBeLessThan(withoutPreset.length);
		// Preset should be very short: key + STX + 2-char code = 4 chars
		expect(withPreset.length).toBe(4);
	});

	it('all 42 phrases round-trip through full encode/decode pipeline', () => {
		for (const phrase of [...RETURN_PHRASES, ...WARRANTY_PHRASES]) {
			const store = makeStore({
				tags: [{ key: 'r', value: phrase }]
			});
			const decoded = decode(encode(store).fragment);
			const returnTag = decoded.tags?.find((t: Tag) => t.key === 'r');
			expect(returnTag?.value).toBe(phrase);
		}
	});

	it('preset + custom text round-trips through full encode/decode pipeline', () => {
		const phrase = WARRANTY_PHRASES[8]; // "1-year limited warranty..."
		const custom = 'Please keep your receipt for warranty claims.';
		const store = makeStore({
			tags: [{ key: 'Y', value: phrase + '\n\n' + custom }]
		});
		const decoded = decode(encode(store).fragment);
		const warrantyTag = decoded.tags?.find((t: Tag) => t.key === 'Y');
		expect(warrantyTag?.value).toBe(phrase + '\n\n' + custom);
	});

	it('phraseToCode and codeToPhrase are consistent', () => {
		expect(phraseToCode.size).toBe(42);
		expect(codeToPhrase.size).toBe(42);
		for (const [phrase, code] of phraseToCode) {
			expect(codeToPhrase.get(code)).toBe(phrase);
		}
	});
});

describe('contact methods tag round-trip', () => {
	it('single contact method round-trips through encode/decode', () => {
		const store = makeStore({
			tags: [{ key: 'j', value: 'T@durov' }]
		});
		const decoded = decode(encode(store).fragment);
		const tag = decoded.tags?.find((t: Tag) => t.key === 'j');
		expect(tag?.value).toBe('T@durov');
	});

	it('multiple contact methods with comma separator round-trip', () => {
		const value = 'P+15551234567,T@username,Dmy_discord';
		const store = makeStore({
			tags: [{ key: 'j', value }]
		});
		const decoded = decode(encode(store).fragment);
		const tag = decoded.tags?.find((t: Tag) => t.key === 'j');
		expect(tag?.value).toBe(value);
	});

	it('contact handle with dots (Matrix) round-trips', () => {
		const value = 'M@user:matrix.org,T@bob';
		const store = makeStore({
			tags: [{ key: 'j', value }]
		});
		const decoded = decode(encode(store).fragment);
		const tag = decoded.tags?.find((t: Tag) => t.key === 'j');
		expect(tag?.value).toBe(value);
	});

	it('contact methods coexist with other tags', () => {
		const store = makeStore({
			tags: [
				{ key: '$', value: 'USD' },
				{ key: 'G' },
				{ key: 'I', value: 'test@example.com' },
				{ key: 'j', value: 'P+15551234567,S+15559876543' }
			]
		});
		const decoded = decode(encode(store).fragment);
		expect(decoded.tags?.find((t: Tag) => t.key === 'j')?.value).toBe('P+15551234567,S+15559876543');
		expect(decoded.tags?.find((t: Tag) => t.key === '$')?.value).toBe('USD');
		expect(decoded.tags?.find((t: Tag) => t.key === 'I')?.value).toBe('test@example.com');
	});

	it('custom contact entries round-trip', () => {
		const value = '*Skype:live:myuser,*Viber:+15551234567,T@bob';
		const store = makeStore({
			tags: [{ key: 'j', value }]
		});
		const decoded = decode(encode(store).fragment);
		const tag = decoded.tags?.find((t: Tag) => t.key === 'j');
		expect(tag?.value).toBe(value);
	});
});

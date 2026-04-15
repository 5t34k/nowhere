import { describe, it, expect } from 'vitest';
import { encode, decode, validate, serialize, deserialize } from './index.js';
import { resolveTags, serializeTags, parseTags } from './tags.js';
import { formatCurrency } from './currency.js';
import { DecodeError, SchemaError, ValidationError } from './errors.js';
import type { StoreData, Item, Tag } from './types.js';

const TEST_PUBKEY = 'dGVzdHB1YmtleWZvcnRlc3RpbmcxMjM0NTY3ODkwYWI';

function decodeStore(fragment: string): StoreData & { siteType: 'store' } {
	const result = decode(fragment);
	if (result.siteType !== 'store') throw new Error('Expected store');
	return result as StoreData & { siteType: 'store' };
}

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

// ─── Round-trip tests ───────────────────────────────────────

describe('codec round-trip', () => {
	it('1-item minimal store', () => {
		const store = makeStore();
		const { fragment } = encode(store);
		const decoded = decodeStore(fragment);
		expect(decoded.name).toBe('Test Shop');
		expect(decoded.pubkey).toBe(TEST_PUBKEY);
		expect(decoded.items).toHaveLength(1);
		expect(decoded.items[0].name).toBe('Widget');
		expect(decoded.items[0].price).toBe(10);
		expect(decoded.description).toBeUndefined();
		expect(decoded.image).toBeUndefined();
	});

	it('5-item store with descriptions', () => {
		const items: Item[] = [
			{ name: 'T-Shirt', price: 25, description: 'Soft cotton tee', tags: [] },
			{ name: 'Mug', price: 15, description: 'Ceramic coffee mug', tags: [] },
			{ name: 'Sticker Pack', price: 5, description: '10 vinyl stickers', tags: [] },
			{ name: 'Poster', price: 18, description: 'A3 art print', tags: [] },
			{ name: 'eBook', price: 12, description: 'PDF digital download', tags: [] }
		];
		const store = makeStore({
			description: 'Handmade goods and digital art',
			items
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.items).toHaveLength(5);
		expect(decoded.description).toBe('Handmade goods and digital art');
		for (let i = 0; i < items.length; i++) {
			expect(decoded.items[i].name).toBe(items[i].name);
			expect(decoded.items[i].price).toBe(items[i].price);
			expect(decoded.items[i].description).toBe(items[i].description);
		}
	});

	it('10-item names-only store', () => {
		const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
			name: `Item ${i + 1}`,
			price: (i + 1) * 5,
			tags: []
		}));
		const store = makeStore({ items });
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.items).toHaveLength(10);
		for (let i = 0; i < 10; i++) {
			expect(decoded.items[i].name).toBe(`Item ${i + 1}`);
			expect(decoded.items[i].price).toBe((i + 1) * 5);
		}
	});

	it('store with all tag types', () => {
		const store = makeStore({
			tags: [
				{ key: 'E' },
				{ key: 'a' },
				{ key: '$', value: 'USD' },
				{ key: 'L', value: 'US' },
				{ key: 's', value: '500' },
				{ key: 'S', value: '1500' },
				{ key: 'F' }
			],
			items: [
				{
					name: 'Digital Download',
					price: 10,
					tags: [
						{ key: 'd' },
						{ key: 'u', value: 'https://example.com/file.zip' },
						{ key: 'q', value: '100' }
					]
				},
				{
					name: 'Physical Thing',
					price: 30,
					tags: [
						{ key: 'W', value: '250' },
						{ key: 'g', value: 'clothing' },
						{ key: 'v', value: 'S.M.L.XL' },
						{ key: 'f' }
					]
				}
			]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.tags.find((t) => t.key === 'E')).toBeTruthy();
		expect(decoded.tags.find((t) => t.key === '$')?.value).toBe('USD');
		expect(decoded.tags.find((t) => t.key === 'L')?.value).toBe('US');
		expect(decoded.items[0].tags.find((t) => t.key === 'd')).toBeTruthy();
		expect(decoded.items[0].tags.find((t) => t.key === 'u')?.value).toBe(
			'https://example.com/file.zip'
		);
		expect(decoded.items[1].tags.find((t) => t.key === 'v')?.value).toBe('S.M.L.XL');
	});

	it('emoji images', () => {
		const store = makeStore({
			image: '🏪',
			items: [
				{ name: 'T-Shirt', price: 25, image: '👕', tags: [] },
				{ name: 'Book', price: 12, image: '📖', tags: [] },
				{ name: 'Art', price: 50, image: '🎨', tags: [] }
			]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.image).toBe('🏪');
		expect(decoded.items[0].image).toBe('👕');
		expect(decoded.items[1].image).toBe('📖');
		expect(decoded.items[2].image).toBe('🎨');
	});

	it('URL images', () => {
		const store = makeStore({
			image: 'https://i.imgur.com/store.jpg',
			items: [
				{
					name: 'Photo Print',
					price: 20,
					image: 'https://i.imgur.com/abc123.jpg',
					tags: []
				}
			]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.image).toBe('https://i.imgur.com/store.jpg');
		expect(decoded.items[0].image).toBe('https://i.imgur.com/abc123.jpg');
	});

	it('name-your-price items', () => {
		const store = makeStore({
			items: [{ name: 'Tip Jar', price: 0, tags: [{ key: 'y' }] }]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.items[0].price).toBe(0);
		expect(decoded.items[0].tags.find((t) => t.key === 'y')).toBeTruthy();
	});

	it('preserves zero prices', () => {
		const store = makeStore({
			items: [{ name: 'Free Sample', price: 0, tags: [] }]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.items[0].price).toBe(0);
	});

	it('preserves fractional prices', () => {
		const store = makeStore({
			items: [
				{ name: 'Cheap', price: 0.99, tags: [] },
				{ name: 'Mid', price: 49.95, tags: [] },
				{ name: 'Expensive', price: 999.99, tags: [] }
			]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.items[0].price).toBe(0.99);
		expect(decoded.items[1].price).toBe(49.95);
		expect(decoded.items[2].price).toBe(999.99);
	});
});

// ─── Schema edge cases ──────────────────────────────────────

describe('schema edge cases', () => {
	it('handles empty descriptions (omitted)', () => {
		const store = makeStore({
			items: [{ name: 'Thing', price: 5, description: undefined, tags: [] }]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.items[0].description).toBeUndefined();
	});

	it('handles unicode in names and descriptions', () => {
		const store = makeStore({
			name: 'カフェ Tokyo',
			description: 'Café con leche — fresh daily!',
			items: [
				{
					name: 'Matcha Latte 抹茶ラテ',
					price: 5,
					description: 'Organic 有機 matcha from Uji',
					tags: []
				}
			]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.name).toBe('カフェ Tokyo');
		expect(decoded.description).toBe('Café con leche — fresh daily!');
		expect(decoded.items[0].name).toBe('Matcha Latte 抹茶ラテ');
		expect(decoded.items[0].description).toBe('Organic 有機 matcha from Uji');
	});

	it('handles special delimiter characters in content', () => {
		const store = makeStore({
			name: 'A, B & C Shop',
			description: 'Pipes | commas, semicolons; all here',
			items: [
				{
					name: 'Item; with, delimiters|inside',
					price: 10,
					description: 'Backslash \\ test',
					tags: []
				}
			]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.name).toBe('A, B & C Shop');
		expect(decoded.description).toBe('Pipes | commas, semicolons; all here');
		expect(decoded.items[0].name).toBe('Item; with, delimiters|inside');
		expect(decoded.items[0].description).toBe('Backslash \\ test');
	});

	it('serialize/deserialize round-trip without compression', () => {
		const store = makeStore({
			description: 'Test',
			image: '🏪',
			tags: [{ key: '$', value: 'EUR' }],
			items: [
				{ name: 'A', price: 1, tags: [{ key: 'f' }] },
				{ name: 'B', price: 2, description: 'desc', tags: [] }
			]
		});
		const serialized = serialize(store);
		const deserialized = deserialize(serialized);
		expect(deserialized.name).toBe(store.name);
		expect(deserialized.pubkey).toBe(store.pubkey);
		expect(deserialized.description).toBe('Test');
		expect(deserialized.image).toBe('🏪');
		expect(deserialized.items).toHaveLength(2);
	});

	it('prefix markers: tags-only (no desc, no image)', () => {
		const store = makeStore({
			tags: [{ key: 'E' }, { key: '$', value: 'USD' }]
		});
		const serialized = serialize(store);
		expect(serialized).toContain('<');
		expect(serialized).not.toContain('"');
		const deserialized = deserialize(serialized);
		expect(deserialized.tags.find((t) => t.key === '$')?.value).toBe('USD');
		expect(deserialized.description).toBeUndefined();
	});

	it('prefix markers: all optional fields present', () => {
		const store = makeStore({
			description: 'About us',
			image: '🏪',
			tags: [{ key: '$', value: 'EUR' }]
		});
		const serialized = serialize(store);
		expect(serialized).toContain('"About us');
		expect(serialized).toContain(':🏪');
		expect(serialized).toContain('<$EUR');
		const deserialized = deserialize(serialized);
		expect(deserialized.description).toBe('About us');
		expect(deserialized.image).toBe('🏪');
	});

	it('prefix markers: no trailing commas for absent fields', () => {
		const store = makeStore(); // no desc, no image, no tags
		const serialized = serialize(store);
		// Store part should just be pubkey,name with no trailing commas
		const storePart = serialized.split(';')[0];
		expect(storePart).not.toMatch(/,$/);
		expect(storePart).not.toContain(',,');
	});

	it('prefix markers: item with only name and price', () => {
		const store = makeStore({
			items: [{ name: 'Hat', price: 25, tags: [] }]
		});
		const serialized = serialize(store);
		const itemPart = serialized.split(';')[1];
		// Should be just name,price (base36) with no markers
		expect(itemPart).not.toContain('"');
		expect(itemPart).not.toContain(':');
		expect(itemPart).not.toContain('<');
	});

	it('handles colons in descriptions (escaped)', () => {
		const store = makeStore({
			description: 'Hours: 9-5',
			items: [{ name: 'Widget', price: 10, tags: [] }]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.description).toBe('Hours: 9-5');
	});

	it('handles quotes in names (escaped)', () => {
		const store = makeStore({
			name: 'Joe"s Shop',
			items: [{ name: 'Widget', price: 10, tags: [] }]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.name).toBe('Joe"s Shop');
	});

	it('handles < in descriptions (escaped)', () => {
		const store = makeStore({
			description: 'Prices < $50',
			items: [{ name: 'Widget', price: 10, tags: [] }]
		});
		const decoded = decodeStore(encode(store).fragment);
		expect(decoded.description).toBe('Prices < $50');
	});
});

// ─── Tag resolution ─────────────────────────────────────────

describe('tag resolution', () => {
	it('item tags override store tags', () => {
		const storeTags: Tag[] = [{ key: 's', value: '500' }];
		const itemTags: Tag[] = [{ key: 's', value: '300' }];
		const resolved = resolveTags(storeTags, itemTags);
		expect(resolved.find((t) => t.key === 's')?.value).toBe('300');
	});

	it('merges unique tags from both levels', () => {
		const storeTags: Tag[] = [{ key: 'E' }, { key: '$', value: 'USD' }];
		const itemTags: Tag[] = [{ key: 'd' }, { key: 'q', value: '10' }];
		const resolved = resolveTags(storeTags, itemTags);
		expect(resolved).toHaveLength(4);
	});

	it('returns empty for no tags', () => {
		expect(resolveTags([], [])).toEqual([]);
	});
});

// ─── Tag serialization ──────────────────────────────────────

describe('tag serialization', () => {
	it('serializes tags with values', () => {
		const tags: Tag[] = [
			{ key: '$', value: 'USD' },
			{ key: 'q', value: '5' }
		];
		expect(serializeTags(tags)).toBe('$USD{q5');
	});

	it('serializes value-less tags (bitfield for 3+)', () => {
		const tags: Tag[] = [{ key: 'E' }, { key: 'd' }, { key: 'f' }];
		// 3 booleans → bitfield: E=bit0, d=bit13, f=bit14
		// bits = 1 + 8192 + 16384 = 24577 = 0b110000000000001
		const serialized = serializeTags(tags);
		expect(serialized).toMatch(/^!.{3}$/); // ! + 3 base64url chars
		// round-trip
		const parsed = parseTags(serialized);
		expect(parsed).toHaveLength(3);
		expect(parsed.find((t) => t.key === 'E')).toBeTruthy();
		expect(parsed.find((t) => t.key === 'd')).toBeTruthy();
		expect(parsed.find((t) => t.key === 'f')).toBeTruthy();
	});

	it('serializes 1-2 booleans individually (no bitfield)', () => {
		const tags: Tag[] = [{ key: 'E' }, { key: 'd' }];
		expect(serializeTags(tags)).toBe('E{d');
	});

	it('round-trips through parse', () => {
		const tags: Tag[] = [
			{ key: 'E' },
			{ key: '$', value: 'GBP' },
			{ key: 's', value: '1000' },
			{ key: 'B', value: '2:10' }
		];
		const parsed = parseTags(serializeTags(tags));
		expect(parsed).toHaveLength(4);
		expect(parsed[0].key).toBe('E');
		expect(parsed[0].value).toBeUndefined();
		expect(parsed[1].key).toBe('$');
		expect(parsed[1].value).toBe('GBP');
		expect(parsed[3].key).toBe('B');
		expect(parsed[3].value).toBe('2:10');
	});

	it('parses empty string as empty array', () => {
		expect(parseTags('')).toEqual([]);
	});

	it('bitfield round-trips all 18 boolean tags', () => {
		const keys = 'EeNnAaPpZzJGkdfoyC'.split('');
		const tags: Tag[] = keys.map((key) => ({ key, value: undefined }));
		const serialized = serializeTags(tags);
		expect(serialized).toMatch(/^!.{3}$/);
		const parsed = parseTags(serialized);
		expect(parsed).toHaveLength(18);
		for (const key of keys) {
			expect(parsed.find((t) => t.key === key)).toBeTruthy();
		}
	});

	it('bitfield mixed with value tags', () => {
		const tags: Tag[] = [
			{ key: 'E' },
			{ key: 'N' },
			{ key: 'A' },
			{ key: '$', value: 'USD' },
			{ key: 's', value: '500' }
		];
		const serialized = serializeTags(tags);
		expect(serialized).toContain('!');
		expect(serialized).toContain('$USD');
		const parsed = parseTags(serialized);
		expect(parsed.find((t) => t.key === 'E')).toBeTruthy();
		expect(parsed.find((t) => t.key === '$')?.value).toBe('USD');
	});

	it('compact country codes: strips dots on serialize, re-inserts on parse', () => {
		const tags: Tag[] = [{ key: 'c', value: 'US.CA.GB' }];
		const serialized = serializeTags(tags);
		expect(serialized).toBe('cUSCAGB');
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe('US.CA.GB');
	});

	it('compact country codes: single country (no dots)', () => {
		const tags: Tag[] = [{ key: 'c', value: 'US' }];
		const serialized = serializeTags(tags);
		expect(serialized).toBe('cUS');
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe('US');
	});

	it('compact country codes: x tag (excluded countries)', () => {
		const tags: Tag[] = [{ key: 'x', value: 'RU.CN.KP' }];
		const serialized = serializeTags(tags);
		expect(serialized).toBe('xRUCNKP');
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe('RU.CN.KP');
	});

	it('merged escaping: pipes and semicolons in tag values', () => {
		const tags: Tag[] = [{ key: 'b', value: 'a|b;c' }];
		const serialized = serializeTags(tags);
		expect(serialized).not.toContain('|');
		expect(serialized).not.toContain(';');
		const parsed = parseTags(serialized);
		expect(parsed[0].value).toBe('a|b;c');
	});
});

// ─── Currency formatting ────────────────────────────────────

describe('currency formatting', () => {
	it('formats USD', () => {
		expect(formatCurrency(25, 'USD')).toBe('$25');
		expect(formatCurrency(25.5, 'USD')).toBe('$25.50');
	});

	it('formats JPY (no decimals)', () => {
		const result = formatCurrency(1000, 'JPY');
		expect(result).toContain('1,000');
	});

	it('formats sats', () => {
		expect(formatCurrency(50000, 'SAT')).toBe('50,000 sats');
		expect(formatCurrency(50000, 'SATS')).toBe('50,000 sats');
	});

	it('falls back for unknown currency', () => {
		const result = formatCurrency(100, 'XYZ');
		expect(result).toContain('100');
	});
});

// ─── Validation ─────────────────────────────────────────────

describe('validation', () => {
	it('accepts empty items', () => {
		expect(() => validate(makeStore({ items: [] }))).not.toThrow();
	});

	it('rejects invalid pubkey length', () => {
		expect(() => validate(makeStore({ pubkey: 'tooshort' }))).toThrow(ValidationError);
	});

	it('rejects empty item name', () => {
		expect(() =>
			validate(makeStore({ items: [{ name: '', price: 10, tags: [] }] }))
		).toThrow(ValidationError);
	});

	it('rejects negative price', () => {
		expect(() =>
			validate(makeStore({ items: [{ name: 'Bad', price: -5, tags: [] }] }))
		).toThrow(ValidationError);
	});

	it('accepts valid store', () => {
		expect(() => validate(makeStore())).not.toThrow();
	});
});

// ─── Decode errors ──────────────────────────────────────────

describe('decode errors', () => {
	it('rejects empty fragment', () => {
		expect(() => decode('')).toThrow(DecodeError);
	});

	it('rejects garbage data', () => {
		expect(() => decode('garbage')).toThrow();
	});

	it('rejects v1 fragments with V1_DEPRECATED code', async () => {
		// Build a fake v1 fragment by manually constructing one with version=1
		const { deflateRaw } = await import('pako');
		const fakeV1Data = 's1' + 'a'.repeat(43) + ',Test Store';
		const compressed = deflateRaw(new TextEncoder().encode(fakeV1Data));
		let binary = '';
		for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]);
		const fragment = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

		try {
			decode(fragment);
			throw new Error('Expected DecodeError to be thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(DecodeError);
			expect((e as DecodeError).code).toBe('V1_DEPRECATED');
		}
	});
});

// ─── URL length measurement ─────────────────────────────────

describe('URL length measurement', () => {
	it('logs fragment lengths for various store sizes', () => {
		const scenarios = [
			{ label: '1-item minimal', store: makeStore() },
			{
				label: '1-item with desc+emoji',
				store: makeStore({
					description: 'A nice shop',
					image: '🏪',
					items: [
						{
							name: 'Widget',
							price: 10,
							description: 'A great widget',
							image: '⚙️',
							tags: []
						}
					]
				})
			},
			{
				label: '5-item names+prices',
				store: makeStore({
					items: Array.from({ length: 5 }, (_, i) => ({
						name: `Product ${i + 1}`,
						price: (i + 1) * 10,
						tags: []
					}))
				})
			},
			{
				label: '10-item names-only',
				store: makeStore({
					items: Array.from({ length: 10 }, (_, i) => ({
						name: `Item ${i + 1}`,
						price: (i + 1) * 5,
						tags: []
					}))
				})
			},
			{
				label: '5-item full store (desc+tags+images)',
				store: makeStore({
					description: 'Premium handmade goods from our workshop',
					image: '🏪',
					tags: [
						{ key: 'E' },
						{ key: 'a' },
						{ key: '$', value: 'USD' },
						{ key: 'L', value: 'US' },
						{ key: 's', value: '500' }
					],
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
							description: 'Wheel-thrown, glazed',
							image: '☕',
							tags: [{ key: 'g', value: 'kitchen' }]
						},
						{
							name: 'Wooden Cutting Board',
							price: 55,
							description: 'Walnut, edge grain',
							image: '🪵',
							tags: [
								{ key: 'g', value: 'kitchen' },
								{ key: 'W', value: '800' }
							]
						},
						{
							name: 'Knit Beanie',
							price: 22,
							description: 'Merino wool',
							image: '🧶',
							tags: [
								{ key: 'v', value: 'S.M.L' },
								{ key: 'g', value: 'clothing' }
							]
						},
						{
							name: 'Art Print',
							price: 35,
							description: 'Giclée on cotton rag',
							image: '🖼️',
							tags: [{ key: 'g', value: 'art' }]
						}
					]
				})
			}
		];

		console.log('\n--- URL Fragment Lengths (Phase 1, no dictionary) ---');
		for (const { label, store } of scenarios) {
			const { length, warn } = encode(store);
			console.log(`  ${label}: ${length} chars${warn ? ' ⚠️ OVER 2000!' : ''}`);
			expect(length).toBeGreaterThan(0);
		}
		console.log('---');
	});
});

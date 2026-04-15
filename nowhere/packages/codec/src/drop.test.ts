import { describe, it, expect } from 'vitest';
import { encodeDrop, decode } from './index.js';
import { serializeDrop, deserializeDrop, validateDrop } from './drop-schema.js';
import { ValidationError } from './errors.js';
import type { DropData } from './types.js';

const TEST_PUBKEY = 'dGVzdHB1YmtleWZvcnRlc3RpbmcxMjM0NTY3ODkwYWI';

function makeDrop(overrides: Partial<DropData> = {}): DropData {
	return {
		version: 1,
		siteType: 'drop',
		pubkey: TEST_PUBKEY,
		name: '',
		description: 'Hello, world.',
		tags: [],
		...overrides
	};
}

function decodeDrop(fragment: string): DropData {
	const result = decode(fragment);
	if (result.siteType !== 'drop') throw new Error('Expected drop');
	return result as DropData;
}

// ─── Round-trip tests ───────────────────────────────────────

describe('drop codec round-trip', () => {
	it('minimal drop (no title)', () => {
		const drop = makeDrop();
		const { fragment } = encodeDrop(drop);
		const decoded = decodeDrop(fragment);
		expect(decoded.siteType).toBe('drop');
		expect(decoded.pubkey).toBe(TEST_PUBKEY);
		expect(decoded.name).toBe('');
		expect(decoded.description).toBe('Hello, world.');
		expect(decoded.tags).toHaveLength(0);
	});

	it('drop with title', () => {
		const drop = makeDrop({ name: 'My Drop Title' });
		const { fragment } = encodeDrop(drop);
		const decoded = decodeDrop(fragment);
		expect(decoded.name).toBe('My Drop Title');
		expect(decoded.description).toBe('Hello, world.');
	});

	it('drop with long body text', () => {
		const body = 'Line 1\nLine 2\nLine 3\n'.repeat(50);
		const drop = makeDrop({ description: body });
		const { fragment } = encodeDrop(drop);
		const decoded = decodeDrop(fragment);
		expect(decoded.description).toBe(body);
	});

	it('drop with unicode content', () => {
		const body = 'Привет мир\n日本語テスト\nArabic: مرحبا';
		const drop = makeDrop({ description: body });
		const { fragment } = encodeDrop(drop);
		const decoded = decodeDrop(fragment);
		expect(decoded.description).toBe(body);
	});

	it('drop with special characters in body', () => {
		const body = 'price: $100\nurl: https://example.com\nkey=value | pipe | semicolon;';
		const drop = makeDrop({ description: body });
		const { fragment } = encodeDrop(drop);
		const decoded = decodeDrop(fragment);
		expect(decoded.description).toBe(body);
	});

	it('drop with title and tags', () => {
		const drop = makeDrop({
			name: 'Signed Drop',
			tags: [{ key: 'v', value: 'abc123' }]
		});
		const { fragment } = encodeDrop(drop);
		const decoded = decodeDrop(fragment);
		expect(decoded.name).toBe('Signed Drop');
		expect(decoded.tags).toHaveLength(1);
		expect(decoded.tags[0].key).toBe('v');
		expect(decoded.tags[0].value).toBe('abc123');
	});
});

// ─── Validation tests ────────────────────────────────────────

describe('drop validation', () => {
	it('rejects short pubkey', () => {
		expect(() => validateDrop(makeDrop({ pubkey: 'tooshort' }))).toThrow(ValidationError);
	});

	it('allows absent pubkey', () => {
		expect(() => validateDrop(makeDrop({ pubkey: undefined }))).not.toThrow();
	});

	it('allows empty pubkey string', () => {
		expect(() => validateDrop(makeDrop({ pubkey: '' }))).not.toThrow();
	});

	it('rejects empty description', () => {
		expect(() => validateDrop(makeDrop({ description: '' }))).toThrow(ValidationError);
	});

	it('rejects whitespace-only description', () => {
		expect(() => validateDrop(makeDrop({ description: '   ' }))).toThrow(ValidationError);
	});

	it('allows empty name (title is optional)', () => {
		expect(() => validateDrop(makeDrop({ name: '' }))).not.toThrow();
	});
});

// ─── Serialize/deserialize tests ────────────────────────────

describe('drop serialize/deserialize', () => {
	it('round-trips without title', () => {
		const drop = makeDrop();
		const serialized = serializeDrop(drop);
		const deserialized = deserializeDrop(serialized);
		expect(deserialized.name).toBe('');
		expect(deserialized.description).toBe('Hello, world.');
	});

	it('round-trips with title containing special chars', () => {
		const drop = makeDrop({ name: 'Title: with "quotes" and <brackets>' });
		const serialized = serializeDrop(drop);
		const deserialized = deserializeDrop(serialized);
		expect(deserialized.name).toBe('Title: with "quotes" and <brackets>');
	});
});

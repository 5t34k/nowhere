import { describe, it, expect } from 'vitest';
import { encodeMessage, decode } from './index.js';
import { serializeMessage, deserializeMessage, validateMessage } from './message-schema.js';
import { ValidationError } from './errors.js';
import type { MessageData } from './types.js';

const TEST_PUBKEY = 'dGVzdHB1YmtleWZvcnRlc3RpbmcxMjM0NTY3ODkwYWI';

function makeMessage(overrides: Partial<MessageData> = {}): MessageData {
	return {
		version: 1,
		siteType: 'message',
		pubkey: TEST_PUBKEY,
		name: 'Alice',
		tags: [],
		...overrides
	};
}

function decodeMessage(fragment: string): MessageData {
	const result = decode(fragment);
	if (result.siteType !== 'message') throw new Error('Expected message');
	return result as MessageData;
}

// ─── Round-trip tests ───────────────────────────────────────

describe('message codec round-trip', () => {
	it('minimal message (pubkey + name only)', () => {
		const msg = makeMessage();
		const { fragment } = encodeMessage(msg);
		const decoded = decodeMessage(fragment);
		expect(decoded.siteType).toBe('message');
		expect(decoded.name).toBe('Alice');
		expect(decoded.pubkey).toBe(TEST_PUBKEY);
		expect(decoded.description).toBeUndefined();
		expect(decoded.image).toBeUndefined();
		expect(decoded.tags).toHaveLength(0);
	});

	it('message with description (markdown body)', () => {
		const msg = makeMessage({
			description: '# Hello World\n\nThis is a **bold** statement.'
		});
		const { fragment } = encodeMessage(msg);
		const decoded = decodeMessage(fragment);
		expect(decoded.description).toBe('# Hello World\n\nThis is a **bold** statement.');
	});

	it('message with avatar URL and tags', () => {
		const msg = makeMessage({
			image: 'https://example.com/avatar.png',
			tags: [
				{ key: 't', value: 'My Title' },
				{ key: 'l', value: 'alice@getalby.com' },
				{ key: 'G' }
			]
		});
		const { fragment } = encodeMessage(msg);
		const decoded = decodeMessage(fragment);
		expect(decoded.image).toBe('https://example.com/avatar.png');
		expect(decoded.tags).toHaveLength(3);
		expect(decoded.tags.find(t => t.key === 't')?.value).toBe('My Title');
		expect(decoded.tags.find(t => t.key === 'l')?.value).toBe('alice@getalby.com');
		expect(decoded.tags.some(t => t.key === 'G')).toBe(true);
	});

	it('message with emoji avatar', () => {
		const msg = makeMessage({ image: '🦊' });
		const { fragment } = encodeMessage(msg);
		const decoded = decodeMessage(fragment);
		expect(decoded.image).toBe('🦊');
	});

	it('markdown body with special characters', () => {
		const body = 'Prices: $10, $20 | Options: A;B\nUse `code` and "quotes"';
		const msg = makeMessage({ description: body });
		const { fragment } = encodeMessage(msg);
		const decoded = decodeMessage(fragment);
		expect(decoded.description).toBe(body);
	});

	it('message with all optional fields', () => {
		const msg = makeMessage({
			description: 'Full message with **everything**.',
			image: '🌟',
			tags: [
				{ key: 't', value: 'Important Announcement' },
				{ key: 'j', value: 'T@alice_dev' },
				{ key: 'I', value: 'alice@example.com' },
				{ key: 'V', value: '5' }
			]
		});
		const { fragment } = encodeMessage(msg);
		const decoded = decodeMessage(fragment);
		expect(decoded.name).toBe('Alice');
		expect(decoded.description).toBe('Full message with **everything**.');
		expect(decoded.image).toBe('🌟');
		expect(decoded.tags).toHaveLength(4);
	});
});

// ─── Serialization tests ────────────────────────────────────

describe('message serialize/deserialize', () => {
	it('round-trips through serialize/deserialize', () => {
		const msg = makeMessage({
			description: 'Hello world',
			image: '😎',
			tags: [{ key: 't', value: 'Test' }]
		});
		const serialized = serializeMessage(msg);
		const deserialized = deserializeMessage(serialized);
		expect(deserialized.pubkey).toBe(msg.pubkey);
		expect(deserialized.name).toBe(msg.name);
		expect(deserialized.description).toBe(msg.description);
		expect(deserialized.image).toBe(msg.image);
		expect(deserialized.tags[0].key).toBe('t');
		expect(deserialized.tags[0].value).toBe('Test');
	});

	it('handles author name with special characters', () => {
		const msg = makeMessage({ name: 'Alice "The" Great' });
		const serialized = serializeMessage(msg);
		const deserialized = deserializeMessage(serialized);
		expect(deserialized.name).toBe('Alice "The" Great');
	});
});

// ─── Validation tests ───────────────────────────────────────

describe('message validation', () => {
	it('rejects invalid pubkey', () => {
		const msg = makeMessage({ pubkey: 'tooshort' });
		expect(() => validateMessage(msg)).toThrow(ValidationError);
	});

	it('rejects empty name', () => {
		const msg = makeMessage({ name: '' });
		expect(() => validateMessage(msg)).toThrow(ValidationError);
	});

	it('rejects whitespace-only name', () => {
		const msg = makeMessage({ name: '   ' });
		expect(() => validateMessage(msg)).toThrow(ValidationError);
	});

	it('accepts valid minimal message', () => {
		const msg = makeMessage();
		expect(() => validateMessage(msg)).not.toThrow();
	});
});

// ─── URL length measurement ─────────────────────────────────

describe('message URL length', () => {
	it('minimal message produces short fragment', () => {
		const msg = makeMessage();
		const { fragment, length } = encodeMessage(msg);
		expect(length).toBe(fragment.length);
		expect(length).toBeLessThan(200);
	});

	it('warns when fragment exceeds 2000 chars', () => {
		// Use crypto random bytes encoded as hex — incompressible
		const bytes = new Uint8Array(3000);
		crypto.getRandomValues(bytes);
		const longBody = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
		const msg = makeMessage({ description: longBody });
		const result = encodeMessage(msg);
		expect(result.warn).toBe(true);
	});
});

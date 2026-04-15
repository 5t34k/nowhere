import { describe, it, expect } from 'vitest';
import { encodeForum, decode } from './index.js';
import { serializeForum, deserializeForum, validateForum } from './forum-schema.js';
import { ValidationError } from './errors.js';
import type { ForumData } from './types.js';

const TEST_PUBKEY = 'dGVzdHB1YmtleWZvcnRlc3RpbmcxMjM0NTY3ODkwYWI';

function makeForum(overrides: Partial<ForumData> = {}): ForumData {
	return {
		version: 1,
		siteType: 'discussion',
		pubkey: TEST_PUBKEY,
		name: 'Test Forum',
		tags: [],
		...overrides
	};
}

function decodeForum(fragment: string): ForumData {
	const result = decode(fragment);
	if (result.siteType !== 'discussion') throw new Error('Expected discussion');
	return result as ForumData;
}

// ─── Round-trip tests ───────────────────────────────────────

describe('forum codec round-trip', () => {
	it('minimal forum (pubkey + name only)', () => {
		const forum = makeForum();
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.siteType).toBe('discussion');
		expect(decoded.name).toBe('Test Forum');
		expect(decoded.pubkey).toBe(TEST_PUBKEY);
		expect(decoded.description).toBeUndefined();
		expect(decoded.image).toBeUndefined();
		expect(decoded.tags).toHaveLength(0);
	});

	it('forum with description', () => {
		const forum = makeForum({
			description: 'A forum for **discussing** things.'
		});
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.description).toBe('A forum for **discussing** things.');
	});

	it('forum with all optional fields', () => {
		const forum = makeForum({
			description: 'Welcome to the forum.',
			image: 'https://example.com/banner.png',
			tags: [
				{ key: 'i', value: '1' },
				{ key: 'H', value: '0' },
				{ key: 'n', value: 'wss://relay.example.com' }
			]
		});
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.name).toBe('Test Forum');
		expect(decoded.description).toBe('Welcome to the forum.');
		expect(decoded.image).toBe('https://example.com/banner.png');
		expect(decoded.tags).toHaveLength(3);
	});

	it('forum with all forum-specific tags', () => {
		const forum = makeForum({
			tags: [
				{ key: 'i', value: '2' },
				{ key: 'H', value: '1' },
				{ key: 'm', value: 'rs' },
				{ key: 'O', value: 'General\\pTech\\pRandom' },
				{ key: 'X', value: 'spam,scam' },
				{ key: 'n', value: 'wss://relay1.com,wss://relay2.com' },
				{ key: 'W', value: '0' },
				{ key: '3', value: '1' }
			]
		});
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.tags).toHaveLength(8);
		expect(decoded.tags.find(t => t.key === 'i')?.value).toBe('2');
		expect(decoded.tags.find(t => t.key === 'H')?.value).toBe('1');
		expect(decoded.tags.find(t => t.key === 'm')?.value).toBe('rs');
		expect(decoded.tags.find(t => t.key === 'O')?.value).toBe('General\\pTech\\pRandom');
		expect(decoded.tags.find(t => t.key === 'X')?.value).toBe('spam,scam');
		expect(decoded.tags.find(t => t.key === 'n')?.value).toBe('wss://relay1.com,wss://relay2.com');
		expect(decoded.tags.find(t => t.key === 'W')?.value).toBe('0');
		expect(decoded.tags.find(t => t.key === '3')?.value).toBe('1');
	});
});

// ─── Serialization tests ────────────────────────────────────

describe('forum serialize/deserialize', () => {
	it('round-trips through serialize/deserialize', () => {
		const forum = makeForum({
			description: 'Hello forum',
			image: 'https://example.com/img.png',
			tags: [{ key: 'i', value: '0' }]
		});
		const serialized = serializeForum(forum);
		const deserialized = deserializeForum(serialized);
		expect(deserialized.pubkey).toBe(forum.pubkey);
		expect(deserialized.name).toBe(forum.name);
		expect(deserialized.description).toBe(forum.description);
		expect(deserialized.image).toBe(forum.image);
		expect(deserialized.tags[0].key).toBe('i');
		expect(deserialized.tags[0].value).toBe('0');
	});

	it('handles forum name with special characters', () => {
		const forum = makeForum({ name: 'My "Cool" Forum: Part 1' });
		const serialized = serializeForum(forum);
		const deserialized = deserializeForum(serialized);
		expect(deserialized.name).toBe('My "Cool" Forum: Part 1');
	});

	it('handles topics with escaped pipes', () => {
		const forum = makeForum({
			tags: [{ key: 'O', value: 'Tech\\pMusic\\pArt' }]
		});
		const serialized = serializeForum(forum);
		const deserialized = deserializeForum(serialized);
		expect(deserialized.tags.find(t => t.key === 'O')?.value).toBe('Tech\\pMusic\\pArt');
	});
});

// ─── Validation tests ───────────────────────────────────────

describe('forum validation', () => {
	it('rejects invalid pubkey', () => {
		const forum = makeForum({ pubkey: 'tooshort' });
		expect(() => validateForum(forum)).toThrow(ValidationError);
	});

	it('rejects empty name', () => {
		const forum = makeForum({ name: '' });
		expect(() => validateForum(forum)).toThrow(ValidationError);
	});

	it('rejects whitespace-only name', () => {
		const forum = makeForum({ name: '   ' });
		expect(() => validateForum(forum)).toThrow(ValidationError);
	});

	it('accepts valid minimal forum', () => {
		const forum = makeForum();
		expect(() => validateForum(forum)).not.toThrow();
	});
});

// ─── Tag-specific tests ─────────────────────────────────────

describe('forum tag handling', () => {
	it('identity mode tag', () => {
		for (const mode of ['0', '1', '2']) {
			const forum = makeForum({ tags: [{ key: 'i', value: mode }] });
			const { fragment } = encodeForum(forum);
			const decoded = decodeForum(fragment);
			expect(decoded.tags.find(t => t.key === 'i')?.value).toBe(mode);
		}
	});

	it('privacy mode tag', () => {
		for (const mode of ['0', '1']) {
			const forum = makeForum({ tags: [{ key: 'H', value: mode }] });
			const { fragment } = encodeForum(forum);
			const decoded = decodeForum(fragment);
			expect(decoded.tags.find(t => t.key === 'H')?.value).toBe(mode);
		}
	});

	it('relay list tag', () => {
		const relays = 'wss://r1.com,wss://r2.com,wss://r3.com';
		const forum = makeForum({ tags: [{ key: 'n', value: relays }] });
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.tags.find(t => t.key === 'n')?.value).toBe(relays);
	});

	it('WoT depth tags (separate for posts and replies)', () => {
		const forum = makeForum({
			tags: [
				{ key: 'W', value: '0' },
				{ key: '3', value: '2' }
			]
		});
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.tags.find(t => t.key === 'W')?.value).toBe('0');
		expect(decoded.tags.find(t => t.key === '3')?.value).toBe('2');
	});

	it('banned words tag', () => {
		const forum = makeForum({ tags: [{ key: 'X', value: 'spam,scam,phishing' }] });
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.tags.find(t => t.key === 'X')?.value).toBe('spam,scam,phishing');
	});

	it('post size limit tag (base-36)', () => {
		const forum = makeForum({ tags: [{ key: 'm', value: 'rs' }] });
		const { fragment } = encodeForum(forum);
		const decoded = decodeForum(fragment);
		expect(decoded.tags.find(t => t.key === 'm')?.value).toBe('rs');
		expect(parseInt('rs', 36)).toBe(1000);
	});
});

// ─── URL length measurement ─────────────────────────────────

describe('forum URL length', () => {
	it('minimal forum produces short fragment', () => {
		const forum = makeForum();
		const { fragment, length } = encodeForum(forum);
		expect(length).toBe(fragment.length);
		expect(length).toBeLessThan(200);
	});
});

import { describe, it, expect } from 'vitest';
import { encodeEvent, decode } from './index.js';
import { serializeEvent, deserializeEvent, validateEvent } from './event-schema.js';
import { ValidationError } from './errors.js';
import type { EventData } from './types.js';

const TEST_PUBKEY = 'dGVzdHB1YmtleWZvcnRlc3RpbmcxMjM0NTY3ODkwYWI';

function makeEvent(overrides: Partial<EventData> = {}): EventData {
	return {
		version: 1,
		siteType: 'event',
		pubkey: TEST_PUBKEY,
		name: 'Test Event',
		tags: [],
		...overrides
	};
}

function decodeEvent(fragment: string): EventData {
	const result = decode(fragment);
	if (result.siteType !== 'event') throw new Error('Expected event');
	return result as EventData;
}

// ─── Round-trip tests ───────────────────────────────────────

describe('event codec round-trip', () => {
	it('minimal event (pubkey + name only)', () => {
		const event = makeEvent();
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.siteType).toBe('event');
		expect(decoded.name).toBe('Test Event');
		expect(decoded.pubkey).toBe(TEST_PUBKEY);
		expect(decoded.description).toBeUndefined();
		expect(decoded.image).toBeUndefined();
		expect(decoded.tags).toHaveLength(0);
	});

	it('event with description', () => {
		const event = makeEvent({ description: 'An evening of music and art.' });
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.description).toBe('An evening of music and art.');
	});

	it('event with primary image', () => {
		const event = makeEvent({ image: 'https://example.com/poster.jpg' });
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.image).toBe('https://example.com/poster.jpg');
	});

	it('event with all optional top-level fields', () => {
		const event = makeEvent({
			description: 'Come one, come all.',
			image: 'https://example.com/banner.png',
			tags: [
				{ key: 'D', value: '202609201930' },
				{ key: 'L', value: 'The Roundhouse' },
				{ key: 'T', value: 'u' }
			]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.name).toBe('Test Event');
		expect(decoded.description).toBe('Come one, come all.');
		expect(decoded.image).toBe('https://example.com/banner.png');
		expect(decoded.tags).toHaveLength(3);
	});

	it('event with all core tags', () => {
		const event = makeEvent({
			tags: [
				{ key: 'D', value: '202609201930' },
				{ key: 'd', value: '202609210200' },
				{ key: 'L', value: 'Fabric London' },
				{ key: 'l', value: '77a Charterhouse St, London EC1M 6HJ' },
				{ key: 'O', value: 'https://stream.example.com/live' },
				{ key: 'o', value: 'Beat Society' },
				{ key: 'b', value: 'Three floors of techno. No phones on the dancefloor.' },
				{ key: 't', value: 'An underground institution returns.' }
			]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags).toHaveLength(8);
		expect(decoded.tags.find(t => t.key === 'D')?.value).toBe('202609201930');
		expect(decoded.tags.find(t => t.key === 'd')?.value).toBe('202609210200');
		expect(decoded.tags.find(t => t.key === 'L')?.value).toBe('Fabric London');
		expect(decoded.tags.find(t => t.key === 'l')?.value).toBe('77a Charterhouse St, London EC1M 6HJ');
		expect(decoded.tags.find(t => t.key === 'O')?.value).toBe('https://stream.example.com/live');
		expect(decoded.tags.find(t => t.key === 'o')?.value).toBe('Beat Society');
	});

	it('event with admission tags', () => {
		const event = makeEvent({
			tags: [
				{ key: '$', value: '1500' },
				{ key: 'K', value: 'GBP' },
				{ key: 'r', value: 'https://tickets.example.com/event-123' }
			]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags.find(t => t.key === '$')?.value).toBe('1500');
		expect(decoded.tags.find(t => t.key === 'K')?.value).toBe('GBP');
		expect(decoded.tags.find(t => t.key === 'r')?.value).toBe('https://tickets.example.com/event-123');
	});

	it('free event (admission = 0)', () => {
		const event = makeEvent({ tags: [{ key: '$', value: '0' }] });
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags.find(t => t.key === '$')?.value).toBe('0');
	});

	it('event with lineup (pipe-separated)', () => {
		const event = makeEvent({
			tags: [{ key: 'P', value: 'Surgeon\\pBlawan\\pRegis' }]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags.find(t => t.key === 'P')?.value).toBe('Surgeon\\pBlawan\\pRegis');
	});

	it('event with secondary images (pipe-separated)', () => {
		const event = makeEvent({
			tags: [{ key: '2', value: 'https://example.com/a.jpg\\phttps://example.com/b.jpg' }]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags.find(t => t.key === '2')?.value).toBe(
			'https://example.com/a.jpg\\phttps://example.com/b.jpg'
		);
	});

	it('event with appearance tags', () => {
		const event = makeEvent({
			tags: [
				{ key: 'T', value: 'd' },
				{ key: 'C', value: 'DC2626' }
			]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags.find(t => t.key === 'T')?.value).toBe('d');
		expect(decoded.tags.find(t => t.key === 'C')?.value).toBe('DC2626');
	});

	it('all 7 preset codes round-trip', () => {
		for (const preset of ['g', 'u', 'd', 'w', 'r', 'm', 'b']) {
			const event = makeEvent({ tags: [{ key: 'T', value: preset }] });
			const { fragment } = encodeEvent(event);
			const decoded = decodeEvent(fragment);
			expect(decoded.tags.find(t => t.key === 'T')?.value).toBe(preset);
		}
	});

	it('event with details tags', () => {
		const event = makeEvent({
			tags: [
				{ key: 'q', value: '250' },
				{ key: 'R', value: '18+' },
				{ key: 'v', value: 'Smart casual' },
				{ key: 'A', value: '7pm Doors\n8pm Support\n9pm Headline' }
			]
		});
		const { fragment } = encodeEvent(event);
		const decoded = decodeEvent(fragment);
		expect(decoded.tags.find(t => t.key === 'q')?.value).toBe('250');
		expect(decoded.tags.find(t => t.key === 'R')?.value).toBe('18+');
		expect(decoded.tags.find(t => t.key === 'v')?.value).toBe('Smart casual');
		expect(decoded.tags.find(t => t.key === 'A')?.value).toBe('7pm Doors\n8pm Support\n9pm Headline');
	});
});

// ─── Serialization tests ────────────────────────────────────

describe('event serialize/deserialize', () => {
	it('round-trips through serialize/deserialize', () => {
		const event = makeEvent({
			description: 'A night to remember',
			image: 'https://example.com/img.png',
			tags: [{ key: 'T', value: 'u' }]
		});
		const serialized = serializeEvent(event);
		const deserialized = deserializeEvent(serialized);
		expect(deserialized.pubkey).toBe(event.pubkey);
		expect(deserialized.name).toBe(event.name);
		expect(deserialized.description).toBe(event.description);
		expect(deserialized.image).toBe(event.image);
		expect(deserialized.tags[0].key).toBe('T');
		expect(deserialized.tags[0].value).toBe('u');
	});

	it('handles event name with special characters', () => {
		const event = makeEvent({ name: 'Nowhere Festival: "The Return"' });
		const serialized = serializeEvent(event);
		const deserialized = deserializeEvent(serialized);
		expect(deserialized.name).toBe('Nowhere Festival: "The Return"');
	});

	it('handles lineup with escaped pipes', () => {
		const event = makeEvent({
			tags: [{ key: 'P', value: 'Four Tet\\pKode9\\pSarah Davachi' }]
		});
		const serialized = serializeEvent(event);
		const deserialized = deserializeEvent(serialized);
		expect(deserialized.tags.find(t => t.key === 'P')?.value).toBe(
			'Four Tet\\pKode9\\pSarah Davachi'
		);
	});

	it('serialized format starts with pubkey,name', () => {
		const event = makeEvent({ name: 'Summer Solstice' });
		const serialized = serializeEvent(event);
		expect(serialized.startsWith(TEST_PUBKEY + ',')).toBe(true);
	});
});

// ─── Validation tests ───────────────────────────────────────

describe('event validation', () => {
	it('rejects invalid pubkey', () => {
		const event = makeEvent({ pubkey: 'tooshort' });
		expect(() => validateEvent(event)).toThrow(ValidationError);
	});

	it('allows absent pubkey', () => {
		const event = makeEvent({ pubkey: undefined });
		expect(() => validateEvent(event)).not.toThrow();
	});

	it('allows empty pubkey string', () => {
		const event = makeEvent({ pubkey: '' });
		expect(() => validateEvent(event)).not.toThrow();
	});

	it('rejects empty name', () => {
		const event = makeEvent({ name: '' });
		expect(() => validateEvent(event)).toThrow(ValidationError);
	});

	it('rejects whitespace-only name', () => {
		const event = makeEvent({ name: '   ' });
		expect(() => validateEvent(event)).toThrow(ValidationError);
	});

	it('accepts valid minimal event', () => {
		const event = makeEvent();
		expect(() => validateEvent(event)).not.toThrow();
	});

	it('accepts event with all optional fields', () => {
		const event = makeEvent({
			description: 'Valid event',
			image: 'https://example.com/img.jpg',
			tags: [{ key: 'D', value: '202609201930' }]
		});
		expect(() => validateEvent(event)).not.toThrow();
	});
});

// ─── URL length measurement ─────────────────────────────────

describe('event URL length', () => {
	it('minimal event produces short fragment', () => {
		const event = makeEvent();
		const { fragment, length } = encodeEvent(event);
		expect(length).toBe(fragment.length);
		expect(length).toBeLessThan(200);
	});

	it('fully-loaded event stays within reasonable bounds', () => {
		const event = makeEvent({
			description: 'Three floors of music across the weekend.',
			image: 'https://example.com/festival-banner.jpg',
			tags: [
				{ key: 'D', value: '202607181800' },
				{ key: 'd', value: '202607202359' },
				{ key: 'L', value: 'Victoria Park, London' },
				{ key: 'l', value: 'Grove Rd, Bow, London E3 5TB' },
				{ key: 'o', value: 'Field Day Festival' },
				{ key: 'b', value: 'Field Day returns to Victoria Park with three days of boundary-pushing music.' },
				{ key: 'T', value: 'm' },
				{ key: 'C', value: 'F59E0B' },
				{ key: '$', value: '7500' },
				{ key: 'K', value: 'GBP' },
				{ key: 'P', value: 'Four Tet\\pAphex Twin\\pCarolyn' },
				{ key: 'q', value: '15000' }
			]
		});
		const { fragment, length } = encodeEvent(event);
		expect(length).toBe(fragment.length);
		expect(length).toBeLessThan(2000);
	});
});

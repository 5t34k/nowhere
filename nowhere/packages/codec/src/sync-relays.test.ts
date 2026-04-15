import { describe, it, expect } from 'vitest';
import {
	normalizeRelayUrl,
	uniqueRelays,
	collectOrderRelays,
	groupRelaysBySince,
	mergeEvents,
	cleanSyncTimes,
	buildRelaySyncInfo
} from './sync-relays.js';

// ─── normalizeRelayUrl ──────────────────────────────────────────────────

describe('normalizeRelayUrl', () => {
	it('lowercases', () => {
		expect(normalizeRelayUrl('wss://Relay.Damus.IO')).toBe('wss://relay.damus.io');
	});

	it('strips trailing slashes', () => {
		expect(normalizeRelayUrl('wss://relay.damus.io/')).toBe('wss://relay.damus.io');
		expect(normalizeRelayUrl('wss://relay.damus.io///')).toBe('wss://relay.damus.io');
	});

	it('handles already-normalized URLs', () => {
		expect(normalizeRelayUrl('wss://nos.lol')).toBe('wss://nos.lol');
	});
});

// ─── uniqueRelays ───────────────────────────────────────────────────────

describe('uniqueRelays', () => {
	it('deduplicates after normalization', () => {
		expect(uniqueRelays([
			'wss://relay.damus.io',
			'wss://Relay.Damus.IO/',
			'wss://nos.lol'
		])).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
	});

	it('preserves first-seen order', () => {
		expect(uniqueRelays([
			'wss://b.com',
			'wss://a.com',
			'wss://b.com'
		])).toEqual(['wss://b.com', 'wss://a.com']);
	});

	it('returns empty for empty input', () => {
		expect(uniqueRelays([])).toEqual([]);
	});
});

// ─── collectOrderRelays ─────────────────────────────────────────────────

describe('collectOrderRelays', () => {
	const fallback = ['wss://default1.com', 'wss://default2.com'];

	it('extracts relays from tag 2', () => {
		const stores = [
			[{ key: '2', value: 'wss://a.com,wss://b.com' }],
			[{ key: '2', value: 'wss://b.com,wss://c.com' }]
		];
		expect(collectOrderRelays(stores, fallback)).toEqual([
			'wss://a.com', 'wss://b.com', 'wss://c.com'
		]);
	});

	it('uses fallback when tag 2 is missing', () => {
		const stores = [
			[{ key: '$', value: 'USD' }]
		];
		expect(collectOrderRelays(stores, fallback)).toEqual(fallback);
	});

	it('mixes tag and fallback stores', () => {
		const stores = [
			[{ key: '2', value: 'wss://custom.com' }],
			[{ key: '$', value: 'USD' }]
		];
		expect(collectOrderRelays(stores, fallback)).toEqual([
			'wss://custom.com', 'wss://default1.com', 'wss://default2.com'
		]);
	});

	it('deduplicates across stores and fallback', () => {
		const stores = [
			[{ key: '2', value: 'wss://default1.com,wss://x.com' }],
			[{ key: '$', value: 'USD' }] // uses fallback which includes default1
		];
		expect(collectOrderRelays(stores, fallback)).toEqual([
			'wss://default1.com', 'wss://x.com', 'wss://default2.com'
		]);
	});
});

// ─── groupRelaysBySince ─────────────────────────────────────────────────

describe('groupRelaysBySince', () => {
	it('groups all relays together when all have the same sync time', () => {
		const syncTimes = {
			'wss://a.com': 1700000000000,
			'wss://b.com': 1700000000000,
			'wss://c.com': 1700000000000
		};
		const groups = groupRelaysBySince(
			['wss://a.com', 'wss://b.com', 'wss://c.com'],
			syncTimes,
			1699000000
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].relays).toEqual(['wss://a.com', 'wss://b.com', 'wss://c.com']);
		// since = floor(1700000000000/1000) - 60 = 1699999940
		expect(groups[0].since).toBe(1699999940);
	});

	it('splits new relay into its own group with windowStart', () => {
		const syncTimes = {
			'wss://a.com': 1700000000000,
			'wss://b.com': 1700000000000
		};
		const windowStart = 1697000000;
		const groups = groupRelaysBySince(
			['wss://a.com', 'wss://b.com', 'wss://c.com'],
			syncTimes,
			windowStart
		);
		expect(groups).toHaveLength(2);
		// Incremental group first (higher since)
		expect(groups[0].relays).toEqual(['wss://a.com', 'wss://b.com']);
		// New relay gets the full window
		expect(groups[1].relays).toEqual(['wss://c.com']);
		expect(groups[1].since).toBe(windowStart);
	});

	it('puts never-synced relays with undefined since when all-history', () => {
		const groups = groupRelaysBySince(
			['wss://new.com'],
			{},
			undefined
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].since).toBeUndefined();
		expect(groups[0].relays).toEqual(['wss://new.com']);
	});

	it('sorts defined-since groups before undefined-since', () => {
		const syncTimes = { 'wss://a.com': 1700000000000 };
		const groups = groupRelaysBySince(
			['wss://a.com', 'wss://new.com'],
			syncTimes,
			undefined
		);
		expect(groups).toHaveLength(2);
		expect(groups[0].since).toBeDefined(); // incremental first
		expect(groups[1].since).toBeUndefined(); // all-history last
	});

	it('handles different sync times creating multiple incremental groups', () => {
		const syncTimes = {
			'wss://a.com': 1700000000000,
			'wss://b.com': 1699000000000
		};
		const groups = groupRelaysBySince(
			['wss://a.com', 'wss://b.com'],
			syncTimes,
			1697000000
		);
		expect(groups).toHaveLength(2);
		// a.com has higher since (more recent) — comes first
		expect(groups[0].relays).toEqual(['wss://a.com']);
		expect(groups[1].relays).toEqual(['wss://b.com']);
	});
});

// ─── mergeEvents ────────────────────────────────────────────────────────

describe('mergeEvents', () => {
	it('deduplicates by id across batches', () => {
		const a = [{ id: '1', data: 'a' }, { id: '2', data: 'a' }];
		const b = [{ id: '2', data: 'b' }, { id: '3', data: 'b' }];
		const merged = mergeEvents([a, b]);
		expect(merged.map((e) => e.id)).toEqual(['1', '2', '3']);
		// First-seen wins
		expect(merged[1].data).toBe('a');
	});

	it('handles empty batches', () => {
		expect(mergeEvents([[], []])).toEqual([]);
		expect(mergeEvents([])).toEqual([]);
	});

	it('handles single batch', () => {
		const batch = [{ id: '1' }, { id: '2' }];
		expect(mergeEvents([batch])).toEqual(batch);
	});
});

// ─── cleanSyncTimes ─────────────────────────────────────────────────────

describe('cleanSyncTimes', () => {
	it('keeps only relays in the active set', () => {
		const syncTimes = {
			'wss://a.com': 100,
			'wss://b.com': 200,
			'wss://old.com': 300
		};
		expect(cleanSyncTimes(syncTimes, ['wss://a.com', 'wss://b.com']))
			.toEqual({ 'wss://a.com': 100, 'wss://b.com': 200 });
	});

	it('normalizes keys during cleanup', () => {
		const syncTimes = { 'wss://A.COM/': 100 };
		expect(cleanSyncTimes(syncTimes, ['wss://a.com']))
			.toEqual({ 'wss://a.com': 100 });
	});

	it('returns empty for no overlap', () => {
		expect(cleanSyncTimes({ 'wss://old.com': 100 }, ['wss://new.com']))
			.toEqual({});
	});
});

// ─── buildRelaySyncInfo ─────────────────────────────────────────────────

describe('buildRelaySyncInfo', () => {
	const fallback = ['wss://default.com'];

	it('maps relays to their stores', () => {
		const stores = [
			{ id: 'store1', tags: [{ key: '2', value: 'wss://a.com,wss://b.com' }] },
			{ id: 'store2', tags: [{ key: '2', value: 'wss://b.com,wss://c.com' }] }
		];
		const syncTimes = { 'wss://a.com': 100, 'wss://b.com': 200 };
		const info = buildRelaySyncInfo(stores, syncTimes, fallback);

		expect(info).toHaveLength(3);
		const a = info.find((i) => i.url === 'wss://a.com')!;
		expect(a.stores).toEqual(['store1']);
		expect(a.lastSync).toBe(100);

		const b = info.find((i) => i.url === 'wss://b.com')!;
		expect(b.stores).toEqual(['store1', 'store2']);
		expect(b.lastSync).toBe(200);

		const c = info.find((i) => i.url === 'wss://c.com')!;
		expect(c.stores).toEqual(['store2']);
		expect(c.lastSync).toBeNull();
	});

	it('uses fallback relays for stores without tag 2', () => {
		const stores = [
			{ id: 'store1', tags: [{ key: '$', value: 'USD' }] }
		];
		const info = buildRelaySyncInfo(stores, {}, fallback);
		expect(info).toHaveLength(1);
		expect(info[0].url).toBe('wss://default.com');
		expect(info[0].stores).toEqual(['store1']);
	});
});

import { SimplePool } from 'nostr-tools/pool';
import type { Event } from 'nostr-tools/core';
import type { Filter } from 'nostr-tools/filter';
import type { Tag } from '@nowhere/codec';
import {
	DEFAULT_ORDER_RELAYS,
	DEFAULT_INVENTORY_RELAYS,
	DEFAULT_FORUM_EVENT_RELAYS,
	DEFAULT_FORUM_PROFILE_RELAYS,
	DEFAULT_PETITION_RELAYS
} from './constants.js';
import type { ForumCache } from './forum-cache.js';
import { loadProfile, saveProfile, isProfileFresh } from './profile-cache.js';

// --- Local test relay toggle ---
// Set to true to route ALL relay traffic to a local-only relay.
// Nothing leaves your machine. Start it first: cd ~/Documents/bucket && yarn start
// NOTE: Mutually exclusive with USE_PTR_RELAY — only set one to true at a time.
export const USE_LOCAL_RELAY = false;
const LOCAL_RELAY_URL = 'ws://localhost:3334';

// --- Private Test Relay (PTR) toggle ---
// Set to true to route all relay traffic to a single private test relay.
// Profile fetching is the only exception — it still uses production relays
// because the test relay will not have profile data.
// NOTE: Mutually exclusive with USE_LOCAL_RELAY — only set one to true at a time.
export const USE_PTR_RELAY = false;
const PTR_RELAY_URL = 'wss://relay.example.com';

// PTR-mode fallback for profile lookups only. The private test relay has no
// profile data, so fetchProfile must still hit real relays when USE_PTR_RELAY
// is on. Not used for anything else.
const PTR_PROFILE_FALLBACK = [
	'wss://relay.damus.io',
	'wss://nos.lol',
	'wss://relay.primal.net'
];

let pool: SimplePool | null = null;

export function getPool(): SimplePool {
	if (!pool) {
		pool = new SimplePool();
	}
	return pool;
}

export async function fetchEvent(
	filter: Filter,
	relays: string[]
): Promise<Event | null> {
	const p = getPool();
	const r = USE_LOCAL_RELAY ? [LOCAL_RELAY_URL] : USE_PTR_RELAY ? [PTR_RELAY_URL] : relays;
	return p.get(r, filter);
}

export async function fetchEvents(
	filter: Filter,
	relays: string[]
): Promise<Event[]> {
	const p = getPool();
	const r = USE_LOCAL_RELAY ? [LOCAL_RELAY_URL] : USE_PTR_RELAY ? [PTR_RELAY_URL] : relays;
	return p.querySync(r, filter);
}

/**
 * NIP-45 COUNT: ask each relay for a count matching the filter.
 * Returns the highest count reported by any relay (they may differ).
 * Falls back to fetching events and counting if no relay supports COUNT.
 */
export async function countEvents(
	filter: Filter,
	relays: string[]
): Promise<number> {
	const p = getPool();
	const r = USE_LOCAL_RELAY ? [LOCAL_RELAY_URL] : USE_PTR_RELAY ? [PTR_RELAY_URL] : relays;

	const countWithTimeout = (url: string): Promise<number> =>
		Promise.race([
			(async () => {
				const relay = await p.ensureRelay(url);
				return relay.count([filter], {});
			})(),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('COUNT timeout')), 4000)
			)
		]);

	const counts = await Promise.allSettled(r.map(countWithTimeout));

	let anySucceeded = false;
	let max = 0;
	for (const result of counts) {
		if (result.status === 'fulfilled') {
			anySucceeded = true;
			if (result.value > max) max = result.value;
		}
	}

	if (anySucceeded) return max;

	// No relay supported COUNT — fall back to fetching events
	const events = await p.querySync(r, filter);
	return events.length;
}

export async function publishToRelays(event: Event, relays: string[], label: string): Promise<void> {
	const p = getPool();
	const allRelays = USE_LOCAL_RELAY
		? [LOCAL_RELAY_URL]
		: USE_PTR_RELAY
			? [PTR_RELAY_URL]
			: [...new Set(relays)];

	console.log(`[Nowhere] Publishing ${label} (kind:${event.kind}, id:${event.id.slice(0, 8)}...) to ${allRelays.length} relays:`, allRelays);

	const pubPromises = p.publish(allRelays, event);

	// pool.publish resolves connection failures with a string like
	// "connection failure: ..." instead of rejecting.  Filter those out
	// so we only count genuine relay confirmations.
	const results = await Promise.allSettled(pubPromises);

	results.forEach((r, i) => {
		const relay = allRelays[i] ?? 'unknown';
		if (r.status === 'fulfilled' && !String(r.value).startsWith('connection failure')) {
			console.log(`[Nowhere]   confirmed: ${relay}`);
		} else {
			const reason = r.status === 'rejected' ? String(r.reason) : String((r as PromiseFulfilledResult<string>).value);
			console.warn(`[Nowhere]   failed: ${relay} - ${reason}`);
		}
	});

	const confirmed = results.filter(
		(r) => r.status === 'fulfilled' && !String(r.value).startsWith('connection failure')
	);

	console.log(`[Nowhere] ${label}: ${confirmed.length}/${allRelays.length} relays confirmed`);

	if (confirmed.length === 0) {
		const reasons = results.map((r) =>
			r.status === 'rejected' ? String(r.reason) : String((r as PromiseFulfilledResult<string>).value)
		);
		throw new Error(`Failed to publish to any relay: ${reasons.join('; ')}`);
	}
}

const PROFILE_RELAY = 'wss://relay.primal.net';
const PROFILE_FETCH_TIMEOUT_MS = 4000;

const profileCache = new Map<string, Promise<Event | null>>();

function resolveProfileRelays(profileRelays: string[] | undefined): string[] {
	return USE_LOCAL_RELAY ? [PROFILE_RELAY] : USE_PTR_RELAY ? PTR_PROFILE_FALLBACK : (profileRelays ?? []);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
	]);
}

function makeCachedEvent(pubkey: string, content: string, fetchedAt: number): Event {
	return {
		id: '',
		pubkey,
		created_at: Math.floor(fetchedAt / 1000),
		kind: 0,
		tags: [],
		content,
		sig: ''
	};
}

export function fetchProfile(
	filter: Filter,
	profileRelays: string[] | undefined,
	forumCache?: ForumCache
): Promise<Event | null> {
	const pubkey = filter.authors?.[0];

	if (pubkey && profileCache.has(pubkey)) {
		return profileCache.get(pubkey)!;
	}

	if (pubkey && forumCache) {
		const cached = loadProfile(forumCache, pubkey);
		if (cached && isProfileFresh(cached)) {
			const resolved = Promise.resolve(makeCachedEvent(pubkey, cached.content, cached.fetchedAt));
			profileCache.set(pubkey, resolved);
			return resolved;
		}
	}

	const p = getPool();
	const r = resolveProfileRelays(profileRelays);
	const promise = withTimeout(p.get(r, filter), PROFILE_FETCH_TIMEOUT_MS, null)
		.catch(() => null)
		.then((event) => {
			if (event && pubkey && forumCache) {
				saveProfile(forumCache, pubkey, event.content);
			}
			return event;
		});

	if (pubkey) {
		profileCache.set(pubkey, promise);
	}
	return promise;
}

/**
 * Batched profile fetch. Resolves cached+fresh entries instantly, dedupes
 * in-flight requests via the session map, and issues ONE relay query for
 * the remainder. Individual fetchProfile() calls that run concurrently
 * will dedupe into the batched promise.
 */
export async function fetchProfiles(
	pubkeys: string[],
	profileRelays: string[] | undefined,
	forumCache?: ForumCache
): Promise<Map<string, Event | null>> {
	const result = new Map<string, Event | null>();
	const distinct = Array.from(new Set(pubkeys.filter(Boolean)));
	const needFetch: string[] = [];
	const inFlight: Array<[string, Promise<Event | null>]> = [];

	for (const pk of distinct) {
		if (profileCache.has(pk)) {
			inFlight.push([pk, profileCache.get(pk)!]);
			continue;
		}
		if (forumCache) {
			const cached = loadProfile(forumCache, pk);
			if (cached && isProfileFresh(cached)) {
				const event = makeCachedEvent(pk, cached.content, cached.fetchedAt);
				const resolved = Promise.resolve(event);
				profileCache.set(pk, resolved);
				result.set(pk, event);
				continue;
			}
		}
		needFetch.push(pk);
	}

	if (needFetch.length > 0) {
		const p = getPool();
		const r = resolveProfileRelays(profileRelays);
		const batchPromise = withTimeout(
			p.querySync(r, { kinds: [0], authors: needFetch, limit: needFetch.length }),
			PROFILE_FETCH_TIMEOUT_MS,
			[] as Event[]
		).catch(() => [] as Event[]);

		// Create a per-pubkey resolver so individual fetchProfile() calls
		// made before the batch resolves share the same underlying promise.
		const resolvers = new Map<string, (event: Event | null) => void>();
		for (const pk of needFetch) {
			const perPk = new Promise<Event | null>((resolve) => {
				resolvers.set(pk, resolve);
			});
			profileCache.set(pk, perPk);
		}

		const events = await batchPromise;
		const byPubkey = new Map<string, Event>();
		for (const ev of events) {
			// Keep the newest kind 0 per author if the relay returns multiple.
			const existing = byPubkey.get(ev.pubkey);
			if (!existing || ev.created_at > existing.created_at) {
				byPubkey.set(ev.pubkey, ev);
			}
		}

		for (const pk of needFetch) {
			const ev = byPubkey.get(pk) ?? null;
			result.set(pk, ev);
			resolvers.get(pk)?.(ev);
			if (ev && forumCache) {
				saveProfile(forumCache, pk, ev.content);
			}
		}
	}

	for (const [pk, promise] of inFlight) {
		result.set(pk, await promise);
	}

	return result;
}

function getRelaysFromTag(tags: Tag[], key: string): string[] {
	const tag = tags.find((t) => t.key === key);
	if (!tag?.value) return [];
	return tag.value.split(',').map((r) => r.trim()).filter(Boolean);
}

// Tag '1' = primary relays (inventory for store, events for forum, signatures for petition)
// Tag '2' = secondary relays (orders for store, profiles for forum)

export function getInventoryRelays(storeTags: Tag[]): string[] {
	if (USE_LOCAL_RELAY) return [LOCAL_RELAY_URL];
	if (USE_PTR_RELAY) return [PTR_RELAY_URL];
	const tagRelays = getRelaysFromTag(storeTags, '1');
	return tagRelays.length > 0 ? tagRelays : [...DEFAULT_INVENTORY_RELAYS];
}

export function getOrderRelays(storeTags: Tag[]): string[] {
	if (USE_LOCAL_RELAY) return [LOCAL_RELAY_URL];
	if (USE_PTR_RELAY) return [PTR_RELAY_URL];
	const tagRelays = getRelaysFromTag(storeTags, '2');
	return tagRelays.length > 0 ? tagRelays : [...DEFAULT_ORDER_RELAYS];
}

export function getForumRelays(forumTags: Tag[]): string[] {
	if (USE_LOCAL_RELAY) return [LOCAL_RELAY_URL];
	if (USE_PTR_RELAY) return [PTR_RELAY_URL];
	const tagRelays = getRelaysFromTag(forumTags, '1');
	return tagRelays.length > 0 ? tagRelays : [...DEFAULT_FORUM_EVENT_RELAYS];
}

export function getForumProfileRelays(forumTags: Tag[]): string[] {
	if (USE_LOCAL_RELAY) return [PROFILE_RELAY];
	if (USE_PTR_RELAY) return [...PTR_PROFILE_FALLBACK];
	const tagRelays = getRelaysFromTag(forumTags, '2');
	return tagRelays.length > 0 ? tagRelays : [...DEFAULT_FORUM_PROFILE_RELAYS];
}

export function getPetitionRelays(petitionTags: Tag[]): string[] {
	if (USE_LOCAL_RELAY) return [LOCAL_RELAY_URL];
	if (USE_PTR_RELAY) return [PTR_RELAY_URL];
	const tagRelays = getRelaysFromTag(petitionTags, '1');
	return tagRelays.length > 0 ? tagRelays : [...DEFAULT_PETITION_RELAYS];
}

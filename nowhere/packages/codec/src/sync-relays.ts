/**
 * Pure utility functions for relay-aware order syncing.
 *
 * No Nostr, DOM, or Svelte dependencies — just strings and numbers,
 * so everything is trivially testable with vitest.
 */

/** Lowercase + strip trailing slash so the same relay doesn't appear twice. */
export function normalizeRelayUrl(url: string): string {
	return url.toLowerCase().replace(/\/+$/, '');
}

/** Deduplicate and normalize a list of relay URLs. */
export function uniqueRelays(urls: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of urls) {
		const n = normalizeRelayUrl(raw);
		if (!seen.has(n)) {
			seen.add(n);
			out.push(n);
		}
	}
	return out;
}

/**
 * Collect all order relay URLs across loaded stores, deduplicated and normalized.
 *
 * `storeTags` is an array of per-store tag arrays. Each store's tags may
 * contain a `2` tag with comma-separated relay URLs. If absent, `fallback`
 * relays are used for that store.
 */
export function collectOrderRelays(
	storeTags: { key: string; value?: string }[][],
	fallback: string[]
): string[] {
	const all: string[] = [];
	for (const tags of storeTags) {
		const tag = tags.find((t) => t.key === '2');
		if (tag?.value) {
			all.push(...tag.value.split(',').map((r) => r.trim()).filter(Boolean));
		} else {
			all.push(...fallback);
		}
	}
	return uniqueRelays(all);
}

export interface RelayGroup {
	relays: string[];
	since: number | undefined;
}

/**
 * Group relays by their effective `since` timestamp so relays that share
 * the same window can be queried in a single pool call.
 *
 * - Relays present in `syncTimes` with a timestamp use that timestamp
 *   minus `bufferSec` as their `since`.
 * - Relays absent from `syncTimes` (never synced) use `windowStart`
 *   (the full time-window `since`, or undefined for all-history).
 *
 * Returns groups sorted largest-since-first (most recent window first)
 * so the common incremental case is processed first.
 */
export function groupRelaysBySince(
	relayUrls: string[],
	syncTimes: Record<string, number>,
	windowStart: number | undefined,
	bufferSec: number = 60
): RelayGroup[] {
	const buckets = new Map<string, string[]>();

	for (const url of relayUrls) {
		const ts = syncTimes[url];
		let since: number | undefined;
		if (ts != null && ts > 0) {
			since = Math.floor(ts / 1000) - bufferSec;
		} else {
			since = windowStart;
		}
		const key = since == null ? 'all' : String(since);
		let list = buckets.get(key);
		if (!list) {
			list = [];
			buckets.set(key, list);
		}
		list.push(url);
	}

	const groups: RelayGroup[] = [];
	for (const [key, relays] of buckets) {
		groups.push({
			relays,
			since: key === 'all' ? undefined : Number(key)
		});
	}

	// Sort: defined since descending (most recent first), undefined last
	groups.sort((a, b) => {
		if (a.since == null && b.since == null) return 0;
		if (a.since == null) return 1;
		if (b.since == null) return -1;
		return b.since - a.since;
	});

	return groups;
}

/**
 * Deduplicate events across multiple batches by `id`.
 * Returns a single flat array with no duplicates, preserving first-seen order.
 */
export function mergeEvents<T extends { id: string }>(batches: T[][]): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const batch of batches) {
		for (const ev of batch) {
			if (!seen.has(ev.id)) {
				seen.add(ev.id);
				out.push(ev);
			}
		}
	}
	return out;
}

/**
 * Remove relay entries from `syncTimes` that are no longer referenced
 * by any loaded store. Prevents unbounded growth.
 */
export function cleanSyncTimes(
	syncTimes: Record<string, number>,
	activeRelays: string[]
): Record<string, number> {
	const active = new Set(activeRelays.map(normalizeRelayUrl));
	const cleaned: Record<string, number> = {};
	for (const [url, ts] of Object.entries(syncTimes)) {
		if (active.has(normalizeRelayUrl(url))) {
			cleaned[normalizeRelayUrl(url)] = ts;
		}
	}
	return cleaned;
}

/**
 * Build a human-readable summary of relay sync state for debugging UI.
 */
export interface RelaySyncInfo {
	url: string;
	lastSync: number | null;
	stores: string[];
}

export function buildRelaySyncInfo(
	storeEntries: { id: string; tags: { key: string; value: string }[] }[],
	syncTimes: Record<string, number>,
	fallback: string[]
): RelaySyncInfo[] {
	const relayStores = new Map<string, string[]>();

	for (const store of storeEntries) {
		const tag = store.tags.find((t) => t.key === '2');
		const urls = tag?.value
			? tag.value.split(',').map((r) => normalizeRelayUrl(r.trim())).filter(Boolean)
			: fallback.map(normalizeRelayUrl);
		for (const url of urls) {
			let list = relayStores.get(url);
			if (!list) {
				list = [];
				relayStores.set(url, list);
			}
			list.push(store.id);
		}
	}

	const infos: RelaySyncInfo[] = [];
	for (const [url, stores] of relayStores) {
		infos.push({
			url,
			lastSync: syncTimes[url] ?? null,
			stores
		});
	}
	return infos.sort((a, b) => a.url.localeCompare(b.url));
}

import { getPool } from './relay-pool.js';
import type { Event } from 'nostr-tools';

const BATCH_SIZE = 500;

// Module-level cache — persists for the lifetime of the session.
// Any pubkey's follow list is fetched at most once, shared across all buildWotSet calls.
const followGraphCache = new Map<string, Set<string>>();
const inFlightByPubkey = new Map<string, Promise<void>>();

async function doFetch(pubkeys: string[], relays: string[]): Promise<void> {
	const pool = getPool();
	for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
		const chunk = pubkeys.slice(i, i + BATCH_SIZE);
		let events: Event[] = [];
		try {
			events = await pool.querySync(relays, { kinds: [3], authors: chunk });
		} catch {
			// fall through — cache empty sets so we don't retry
		}

		const latestByAuthor = new Map<string, Event>();
		for (const event of events) {
			const existing = latestByAuthor.get(event.pubkey);
			if (!existing || event.created_at > existing.created_at) {
				latestByAuthor.set(event.pubkey, event);
			}
		}

		for (const pk of chunk) {
			const event = latestByAuthor.get(pk);
			const follows = new Set<string>();
			if (event) {
				for (const tag of event.tags) {
					if (tag[0] === 'p' && tag[1]) follows.add(tag[1]);
				}
			}
			followGraphCache.set(pk, follows);
			inFlightByPubkey.delete(pk);
		}
	}
}

// Ensures follow lists for all given pubkeys are in followGraphCache.
// Deduplicates: cached pubkeys are skipped; in-flight pubkeys are awaited rather than re-fetched.
async function ensureFollowLists(pubkeys: string[], relays: string[]): Promise<void> {
	const toAwait: Promise<void>[] = [];
	const toFetch: string[] = [];

	for (const pk of pubkeys) {
		if (followGraphCache.has(pk)) continue;
		if (inFlightByPubkey.has(pk)) {
			toAwait.push(inFlightByPubkey.get(pk)!);
		} else {
			toFetch.push(pk);
		}
	}

	if (toFetch.length > 0) {
		const fetchPromise = doFetch(toFetch, relays);
		for (const pk of toFetch) inFlightByPubkey.set(pk, fetchPromise);
		toAwait.push(fetchPromise);
	}

	if (toAwait.length > 0) await Promise.all(toAwait);
}

const MAX_WOT_DEPTH = 3;

export async function buildWotSet(
	creatorPubkey: string,
	depth: number,
	relays: string[]
): Promise<Set<string>> {
	const allowed = new Set<string>();
	allowed.add(creatorPubkey);

	depth = Math.min(depth, MAX_WOT_DEPTH);
	if (depth === 0) return allowed;

	// BFS traversal — one batched fetch per depth level, reusing cached data across calls
	let frontier = new Set<string>([creatorPubkey]);
	const fetched = new Set<string>(); // pubkeys whose follow lists we've already used this run

	for (let d = 0; d < depth; d++) {
		const toProcess = Array.from(frontier).filter(pk => !fetched.has(pk));
		if (toProcess.length === 0) break;

		await ensureFollowLists(toProcess, relays);
		for (const pk of toProcess) fetched.add(pk);

		const nextFrontier = new Set<string>();
		for (const pk of toProcess) {
			const follows = followGraphCache.get(pk);
			if (!follows) continue;
			for (const f of follows) {
				if (!allowed.has(f)) {
					nextFrontier.add(f);
					allowed.add(f);
				}
			}
		}

		frontier = nextFrontier;
		if (frontier.size === 0) break;
	}

	console.log('[Nowhere] WoT set built:', allowed.size, 'pubkeys');
	return allowed;
}

export function passesModeration(
	authorPubkey: string,
	text: string,
	wotSet: Set<string> | null,
	bannedWords: string[]
): boolean {
	// Check WoT
	if (wotSet && !wotSet.has(authorPubkey)) {
		console.warn('[Nowhere] WoT blocked post from', authorPubkey.slice(0, 16), '— not in trust set of', wotSet.size, 'pubkeys');
		return false;
	}

	// Check banned words (case-insensitive)
	if (bannedWords.length > 0) {
		const lower = text.toLowerCase();
		for (const word of bannedWords) {
			if (word && lower.includes(word.toLowerCase())) {
				return false;
			}
		}
	}

	return true;
}

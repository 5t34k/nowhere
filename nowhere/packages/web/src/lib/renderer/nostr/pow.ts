/**
 * NIP-13 Proof of Work for Nostr events.
 * Iterates a nonce until the event ID has the required number of leading zero bits.
 */

import { getEventHash } from 'nostr-tools/pure';

export interface UnsignedEvent {
	kind: number;
	created_at: number;
	tags: string[][];
	content: string;
	pubkey: string;
}

export function countLeadingZeroBits(hex: string): number {
	let count = 0;
	for (const ch of hex) {
		const nibble = parseInt(ch, 16);
		if (nibble === 0) {
			count += 4;
		} else {
			// Count leading zeros of this nibble
			if (nibble < 2) count += 3;
			else if (nibble < 4) count += 2;
			else if (nibble < 8) count += 1;
			break;
		}
	}
	return count;
}

export async function applyPoW(
	event: UnsignedEvent,
	difficulty: number,
	onProgress?: (nonce: number) => void
): Promise<UnsignedEvent & { id: string }> {
	// Remove any existing nonce tag
	const tags = event.tags.filter((t) => t[0] !== 'nonce');

	let nonce = 0;
	const BATCH_SIZE = 2000;
	while (true) {
		for (let i = 0; i < BATCH_SIZE; i++) {
			const candidate = {
				...event,
				tags: [...tags, ['nonce', String(nonce), String(difficulty)]]
			};
			const id = getEventHash(candidate as any);
			if (countLeadingZeroBits(id) >= difficulty) {
				return { ...candidate, id };
			}
			nonce++;
		}
		// Yield to the browser so the UI stays responsive
		onProgress?.(nonce);
		await new Promise((r) => setTimeout(r, 0));
	}
}

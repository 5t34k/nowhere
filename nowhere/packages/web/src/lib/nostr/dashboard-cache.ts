import { nip44Encrypt, nip44Decrypt } from '$lib/nostr/nip07.js';
import type { OrderMessage } from '$lib/renderer/payment/order.js';
import type { StatusPayload } from '$lib/nostr/inventory.js';

export type OrderStatus = 'new' | 'confirmed' | 'processing' | 'fulfilled' | 'refunded' | 'no_payment';

export interface DashboardCache {
	storeFragments?: string[];
	orders?: OrderMessage[];
	orderStatuses: Record<string, OrderStatus>;
	confirmedOrderIds: string[];
	hiddenOrderIds?: string[];
	orderNotes: Record<string, string>;
	relaySyncTimes?: Record<string, number>;
	inventoryStatus?: Record<string, StatusPayload>;
	historicalRates?: Record<string, { satsPerUnit: number; source: string }>;
	uiPrefs: {
		tab: string;
		ordersFilter: string;
	};
}

const CACHE_KEY = 'nw-store-dashboard';

export async function saveCache(cache: DashboardCache, sellerPubkey: string): Promise<void> {
	const encrypted = await nip44Encrypt(sellerPubkey, JSON.stringify(cache));
	localStorage.setItem(CACHE_KEY, encrypted);
}

export async function loadCache(sellerPubkey: string): Promise<DashboardCache | null> {
	const encrypted = localStorage.getItem(CACHE_KEY);
	if (!encrypted) return null;
	try {
		const plaintext = await nip44Decrypt(sellerPubkey, encrypted);
		return JSON.parse(plaintext) as DashboardCache;
	} catch {
		return null;
	}
}

export function clearCache(): void {
	localStorage.removeItem(CACHE_KEY);
}

export function hasCachedSession(): boolean {
	return localStorage.getItem(CACHE_KEY) !== null;
}

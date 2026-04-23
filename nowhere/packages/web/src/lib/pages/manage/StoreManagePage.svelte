<script lang="ts">
	import { onMount } from 'svelte';
	import { decode, decryptFragment, collectOrderRelays, groupRelaysBySince, mergeEvents, cleanSyncTimes, base64urlToHex, type StoreData, type Item, type Tag } from '@nowhere/codec';
	import type { Event as NostrEvent } from 'nostr-tools/core';
	import { fetchEvents } from '$lib/renderer/nostr/relay-pool.js';
	import { NOWHERE_T_TAG, NOWHERE_DTAG_PREFIX, DEFAULT_ORDER_RELAYS } from '$lib/renderer/nostr/constants.js';
	import { getHistoricalRate, primeHistoricalRateCache, exportHistoricalRateCache } from '$lib/payment/historical-rate.js';
	import { fiatToSats } from '$lib/renderer/payment/exchange-rate.js';
	import {
		publishStatus,
		fetchStatus,
		type StatusPayload,
		type StockLevel
	} from '$lib/nostr/inventory.js';
	import {
		saveCache,
		loadCache,
		clearCache,
		hasCachedSession,
		type OrderStatus
	} from '$lib/nostr/dashboard-cache.js';
	import type { OrderMessage } from '$lib/renderer/payment/order.js';
	import {
		computeShipping,
		computeDiscount,
		type CartItem
	} from '$lib/renderer/stores/cart.js';
	import { hasNostrExtension, hasNip44Support, getPublicKey } from '$lib/nostr/nip07.js';
	import { computeLookupHash } from '$lib/nostr/inventory-keys.js';
	import { RENDERER_ORIGIN } from '$lib/config.js';

	// ─── Types ───────────────────────────────────────────────────────────────

	type Tab = 'overview' | 'orders' | 'hidden' | 'inventory' | 'status' | 'stores' | 'settings' | 'verify';
	type OrdersFilter = 'all' | 'confirmed';

	interface DecryptedOrder {
		event: NostrEvent;
		order: OrderMessage;
	}

	interface OrderVerification {
		loading: boolean;
		error: string | null;
		expectedSubtotal: number;
		expectedShipping: number;
		expectedTotal: number;
		// Sats payment path
		historicalSatsPerUnit: number | null;
		rateSource: string;
		expectedSats: number | null;
		// Fiat payment path
		expectedPaymentAmount: number | null;
		paymentCurrencyLabel: string | null;
		paymentAmountMatch: boolean | null;
		paymentRateSource: string | null;
		subtotalMatch: boolean | null;
		shippingMatch: boolean | null;
		totalMatch: boolean | null;
	}

	interface LoadedStore {
		fragment: string;
		data: StoreData;
		name: string;
		currency: string;
		pubkeyHex: string;
	}

	// ─── Bech32 / npub ───────────────────────────────────────────────────────

	const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

	function bech32Polymod(values: number[]): number {
		const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
		let chk = 1;
		for (const v of values) {
			const b = chk >> 25;
			chk = ((chk & 0x1ffffff) << 5) ^ v;
			for (let i = 0; i < 5; i++) {
				if ((b >> i) & 1) chk ^= GEN[i];
			}
		}
		return chk;
	}

	function bech32HrpExpand(hrp: string): number[] {
		const result: number[] = [];
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) >> 5);
		result.push(0);
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) & 31);
		return result;
	}

	function bech32Checksum(hrp: string, data: number[]): number[] {
		const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
		const polymod = bech32Polymod(values) ^ 1;
		const checksum: number[] = [];
		for (let i = 0; i < 6; i++) {
			checksum.push((polymod >> (5 * (5 - i))) & 31);
		}
		return checksum;
	}

	function hexToNpub(hex: string): string {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		}
		const words: number[] = [];
		let acc = 0;
		let bits = 0;
		for (const b of bytes) {
			acc = (acc << 8) | b;
			bits += 8;
			while (bits >= 5) {
				bits -= 5;
				words.push((acc >> bits) & 0x1f);
			}
		}
		if (bits > 0) {
			words.push((acc << (5 - bits)) & 0x1f);
		}
		const checksum = bech32Checksum('npub', words);
		const allWords = [...words, ...checksum];
		let result = 'npub1';
		for (const w of allWords) {
			result += BECH32_ALPHABET[w];
		}
		return result;
	}

	// ─── Auth ────────────────────────────────────────────────────────────────

	let connected = $state(false);
	let sellerPubkey = $state('');
	const sellerNpub = $derived(sellerPubkey ? hexToNpub(sellerPubkey) : '');
	let connectError = $state('');
	let connecting = $state(false);
	let hasCached = $state(false);

	// ─── Stores ──────────────────────────────────────────────────────────────

	let loadedStores = $state(new Map<string, LoadedStore>());
	let storeUrlInput = $state('');
	let storeLoadError = $state('');
	let storeLoadSuccess = $state('');
	let storeDecryptMode = $state(false);
	let storeDecryptPassword = $state('');
	let storeShowPassword = $state(false);
	let storeDecryptError = $state('');
	let storeDecrypting = $state(false);
	let storePendingFragment = $state('');
	let selectedInventoryStoreId = $state<string | null>(null);
	let importInput = $state('');
	let importResult = $state('');
	let exportCopied = $state(false);
	let jsonCopied = $state(false);

	// ─── Cache ───────────────────────────────────────────────────────────────

	let cacheEnabled = $state(false);
	let cacheOrderData = $state(true);
	let cacheStoreUrls = $state(true);
	let cacheOrderList = $state(true);
	let cacheInventoryStatus = $state(true);
	let cachedInventoryStatus = $state<Record<string, StatusPayload>>({});
	let ordersFromCache = $state(false);

	// ─── Navigation ──────────────────────────────────────────────────────────

	let activeTab = $state<Tab>('overview');
	let sidebarOpen = $state(false);

	function setTab(tab: Tab) {
		activeTab = tab;
		sidebarOpen = false;
		if (cacheEnabled) persistCache();
	}

	// ─── Orders ──────────────────────────────────────────────────────────────

	let orders = $state<DecryptedOrder[]>([]);
	let syncing = $state(false);
	let syncError = $state('');
	let relaySyncTimes = $state<Record<string, number>>({});
	const lastSyncTime = $derived(Math.max(0, ...Object.values(relaySyncTimes)));
	let decryptErrors = $state(0);
	let ordersFilter = $state<OrdersFilter>('all');
	let storeFilter = $state<string | null>(null); // null = all stores
	let orderIdFilter = $state('');
	let fetchByIdOpen = $state(false);
	let fetchByIdInput = $state('');
	let fetchingById = $state(false);
	let fetchByIdError = $state('');
	let fetchByIdResult = $state('');

	// ─── Order detail ─────────────────────────────────────────────────────────

	let selectedOrderId = $state<string | null>(null);
	let orderVerification = $state<OrderVerification | null>(null);

	// ─── Order management (in-memory, optionally cached) ─────────────────────

	let orderStatuses = $state<Record<string, OrderStatus>>({});
	let orderNotes = $state<Record<string, string>>({});
	let confirmedOrderIds = $state<Set<string>>(new Set());
	let hiddenOrderIds = $state<Set<string>>(new Set());
	let selectedOrderIds = $state<Set<string>>(new Set());

	// ─── Reconciliation ──────────────────────────────────────────────────────

	let reconcileOpen = $state(false);
	let reconcileText = $state('');
	let reconcileResult = $state('');

	// ─── Inventory ───────────────────────────────────────────────────────────

	let itemLevels = $state<Record<string, StockLevel>>({});
	let variantLevels = $state<Record<string, Record<string, StockLevel>>>({});
	let expandedItems = $state<Set<number>>(new Set());
	let inventoryExpanded = $state(false);
	let lowWarn        = $state(false);
	let lowFieldName   = $state(false);
	let lowFieldEmail  = $state(false);
	let lowFieldPhone  = $state(false);
	let lowFieldAddress = $state(false);
	let lowFieldNostr  = $state(false);
	let lowFieldNotes  = $state(false);
	let lowRefund      = $state(false);
	let publishing = $state(false);
	let fetchingStatus = $state(false);
	let publishResult = $state('');

	// ─── Settings (store status) ─────────────────────────────────────────────

	let notice = $state('');
	let closedMsg = $state('');
	let redirectUrl = $state('');

	// ─── Standalone verify tab ────────────────────────────────────────────────

	let verifyJson = $state('');
	let verifyReceivedSats = $state('');
	let verifyResult = $state<{ ok: boolean; verification: OrderVerification | null } | null>(null);
	let verifyOrder = $state<OrderMessage | null>(null);
	let verifying2 = $state(false);

	const verifyOrderStore = $derived(
		verifyOrder ? (loadedStores.get(verifyOrder.storeId) ?? null) : null
	);

	function handleReceiptFileUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			verifyJson = (reader.result as string).trim();
			verifyResult = null;
		};
		reader.readAsText(file);
	}

	// ─── Derived ─────────────────────────────────────────────────────────────

	// Selected store for inventory/status tabs
	const selectedInventoryStore = $derived(
		selectedInventoryStoreId ? (loadedStores.get(selectedInventoryStoreId) ?? null) : null
	);

	// Aliases used by inventory/status functions — derived from selected inventory store
	const storeData      = $derived(selectedInventoryStore?.data ?? null);
	const storeFragment  = $derived(selectedInventoryStore?.fragment ?? '');
	const storeCurrency  = $derived(selectedInventoryStore?.currency ?? 'USD');
	const storePubkeyHex = $derived(selectedInventoryStore?.pubkeyHex ?? '');
	const storeLoaded    = $derived(loadedStores.size > 0);

	const selectedOrder = $derived(
		orders.find((o) => o.order.orderId === selectedOrderId) ?? null
	);

	// Store for the currently open order detail
	const selectedOrderStore = $derived(
		selectedOrder ? (loadedStores.get(selectedOrder.order.storeId) ?? null) : null
	);

	const visibleOrders = $derived(
		orders.filter((o) => !hiddenOrderIds.has(o.order.orderId))
	);

	const storeFilteredOrders = $derived(
		storeFilter === null
			? visibleOrders
			: visibleOrders.filter((o) => o.order.storeId === storeFilter)
	);

	const hiddenOrders = $derived(
		storeFilter === null
			? orders.filter((o) => hiddenOrderIds.has(o.order.orderId))
			: orders.filter((o) => hiddenOrderIds.has(o.order.orderId) && o.order.storeId === storeFilter)
	);

	const filteredOrders = $derived(
		ordersFilter === 'confirmed'
			? storeFilteredOrders.filter((o) => confirmedOrderIds.has(o.order.orderId))
			: storeFilteredOrders
	);

	const storeFilteredConfirmedCount = $derived(
		storeFilteredOrders.filter((o) => confirmedOrderIds.has(o.order.orderId)).length
	);

	const sortedOrders = $derived(
		[...filteredOrders].sort((a, b) => b.order.timestamp - a.order.timestamp)
	);

	const idFilterTokens = $derived(
		orderIdFilter
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean)
	);

	const displayedOrders = $derived(
		idFilterTokens.length > 0
			? sortedOrders.filter((o) =>
					idFilterTokens.some((tok) => o.order.orderId.toLowerCase().startsWith(tok))
				)
			: sortedOrders
	);

	const newOrderCount = $derived(
		visibleOrders.filter(
			(o) =>
				!confirmedOrderIds.has(o.order.orderId) &&
				(!orderStatuses[o.order.orderId] || orderStatuses[o.order.orderId] === 'new')
		).length
	);

	const confirmedRevenue = $derived(
		orders
			.filter((o) => confirmedOrderIds.has(o.order.orderId))
			.reduce((sum, o) => sum + o.order.total / 100, 0)
	);

	const uniqueCurrencies = $derived(
		new Set([...loadedStores.values()].map((s) => s.currency))
	);

	const revenueCurrencyLabel = $derived(
		uniqueCurrencies.size === 1 ? [...uniqueCurrencies][0] : '—'
	);

	const lowStockCount = $derived(
		Object.values(itemLevels).filter((v) => v <= 1).length
	);

	const inventoryStores = $derived(
		[...loadedStores.entries()].filter(([, s]) => s.data.tags.some((t: Tag) => t.key === 'k'))
	);

	const inventoryEnabled = $derived(inventoryStores.length > 0);

	// ─── Effects ─────────────────────────────────────────────────────────────

	// Auto-select first inventory-enabled store when one becomes available
	$effect(() => {
		const ids = inventoryStores.map(([id]) => id);
		if (selectedInventoryStoreId === null || !ids.includes(selectedInventoryStoreId)) {
			selectedInventoryStoreId = ids[0] ?? null;
		}
	});

	// Reset inventory/status state when the selected inventory store changes
	$effect(() => {
		const store = selectedInventoryStore;
		if (!store) {
			itemLevels = {};
			variantLevels = {};
			return;
		}
		const levels: Record<string, StockLevel> = {};
		for (let i = 0; i < store.data.items.length; i++) {
			levels[String(i)] = 3;
		}
		itemLevels = levels;
		variantLevels = {};
		notice = '';
		closedMsg = '';
		redirectUrl = '';
	});

	// ─── Auth ─────────────────────────────────────────────────────────────────

	function signOut() {
		connected = false;
		sellerPubkey = '';
		orders = [];
		loadedStores = new Map();
		selectedInventoryStoreId = null;
		selectedOrderId = null;
		orderVerification = null;
		orderStatuses = {};
		orderNotes = {};
		confirmedOrderIds = new Set();
		hiddenOrderIds = new Set();
		relaySyncTimes = {};
		ordersFromCache = false;
		cacheEnabled = false;
		activeTab = 'overview';
	}

	async function connect() {
		connecting = true;
		connectError = '';
		if (!hasNostrExtension()) {
			connectError = 'No Nostr signing extension found. Install Alby, nos2x, or similar.';
			connecting = false;
			return;
		}
		if (!hasNip44Support()) {
			connectError = 'Your extension does not support NIP-44 encryption.';
			connecting = false;
			return;
		}
		try {
			sellerPubkey = await getPublicKey();
			connected = true;
			if (hasCached) await restoreCache();
		} catch (e) {
			connectError = `Connection failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			connecting = false;
		}
	}

	async function restoreCache() {
		try {
			const cache = await loadCache(sellerPubkey);
			if (!cache) return;
			cacheEnabled = true;
			// Detect which sub-options were active when this cache was saved
			cacheOrderData = !!(cache.orderStatuses || cache.confirmedOrderIds || cache.orderNotes);
			cacheStoreUrls = !!(cache.storeFragments);
			cacheOrderList = !!(cache.orders);
			cacheInventoryStatus = !!(cache.inventoryStatus);
			if (cache.inventoryStatus) cachedInventoryStatus = cache.inventoryStatus;
			if (cache.historicalRates) primeHistoricalRateCache(cache.historicalRates);
			orderStatuses = cache.orderStatuses ?? {};
			confirmedOrderIds = new Set(cache.confirmedOrderIds ?? []);
			hiddenOrderIds = new Set(cache.hiddenOrderIds ?? []);
			orderNotes = cache.orderNotes ?? {};
			if (cache.uiPrefs?.tab) activeTab = cache.uiPrefs.tab as Tab;
			if (cache.uiPrefs?.ordersFilter) ordersFilter = cache.uiPrefs.ordersFilter as OrdersFilter;
			if (cache.storeFragments) {
				for (const f of cache.storeFragments) {
					addStoreFromFragment(f);
					storeLoadError = ''; // suppress per-fragment errors during restore
				}
			}
			if (cache.relaySyncTimes) relaySyncTimes = cache.relaySyncTimes;
			if (cache.orders?.length) {
				orders = cache.orders.map((o) => ({ event: {} as NostrEvent, order: o }));
				ordersFromCache = true;
			}
		} catch {
			// Cache unreadable — start fresh
		}
	}

	// ─── Store management ────────────────────────────────────────────────────

	function addStoreFromFragment(fragment: string): boolean {
		try {
			const data = decode(fragment) as StoreData;
			if (!data.items) {
				storeLoadError = 'This URL is not a store.';
				return false;
			}
			const pubkeyHex = base64urlToHex(data.pubkey);
			if (connected && sellerPubkey && pubkeyHex !== sellerPubkey) {
				storeLoadError = 'This store belongs to a different key.';
				return false;
			}
			const storeId = computeLookupHash(fragment);
			if (loadedStores.has(storeId)) {
				storeLoadError = 'Store already loaded.';
				return false;
			}
			loadedStores.set(storeId, {
				fragment,
				data,
				name: data.name,
				currency: data.tags.find((t: Tag) => t.key === '$')?.value ?? 'USD',
				pubkeyHex
			});
			loadedStores = new Map(loadedStores);
			if (cacheEnabled && cacheStoreUrls) persistCache();
			return true;
		} catch (e) {
			storeLoadError = `Failed to load store: ${e instanceof Error ? e.message : String(e)}`;
			return false;
		}
	}

	function loadSingleStore() {
		storeLoadError = '';
		storeLoadSuccess = '';
		storeDecryptMode = false;
		storeDecryptPassword = '';
		storeDecryptError = '';
		storePendingFragment = '';
		if (!storeUrlInput.trim()) return;
		let fragment = storeUrlInput.trim();
		const hashIdx = fragment.indexOf('#');
		if (hashIdx !== -1) fragment = fragment.slice(hashIdx + 1);
		const starIdx = fragment.indexOf('*');
		if (starIdx !== -1) fragment = fragment.slice(0, starIdx);
		// Pre-check: try decode to detect encrypted fragments before running full validation
		try {
			decode(fragment);
		} catch {
			storePendingFragment = fragment;
			storeDecryptMode = true;
			return;
		}
		if (addStoreFromFragment(fragment)) {
			storeLoadSuccess = `Loaded: ${[...loadedStores.values()].at(-1)!.name}`;
			storeUrlInput = '';
		}
	}

	async function tryDecryptStore() {
		storeDecryptError = '';
		storeDecrypting = true;
		try {
			const decrypted = await decryptFragment(storePendingFragment, storeDecryptPassword);
			if (addStoreFromFragment(decrypted)) {
				storeLoadSuccess = `Loaded: ${[...loadedStores.values()].at(-1)!.name}`;
				storeUrlInput = '';
				storeDecryptMode = false;
				storeDecryptPassword = '';
				storePendingFragment = '';
			} else {
				// addStoreFromFragment set storeLoadError — surface it as decrypt error
				storeDecryptError = storeLoadError;
				storeLoadError = '';
			}
		} catch {
			storeDecryptError = 'Incorrect password.';
		} finally {
			storeDecrypting = false;
		}
	}

	let confirmRemoveStoreId = $state<string | null>(null);
	let copiedStoreId = $state<string | null>(null);

	function removeStore(storeId: string) {
		loadedStores.delete(storeId);
		loadedStores = new Map(loadedStores);
		confirmRemoveStoreId = null;
		if (selectedInventoryStoreId === storeId) {
			const remaining = [...loadedStores.entries()]
				.filter(([id, s]) => id !== storeId && s.data.tags.some((t: Tag) => t.key === 'k'));
			selectedInventoryStoreId = remaining[0]?.[0] ?? null;
		}
		if (cacheEnabled && cacheStoreUrls) persistCache();
	}

	function storeUrl(store: { fragment: string }) {
		return `${RENDERER_ORIGIN}/s#${store.fragment}`;
	}

	async function copyStoreUrl(storeId: string, store: { fragment: string }) {
		await navigator.clipboard.writeText(storeUrl(store));
		copiedStoreId = storeId;
		setTimeout(() => (copiedStoreId = null), 2000);
	}

	async function copyOrderJson(order: OrderMessage) {
		try {
			await navigator.clipboard.writeText(JSON.stringify(order, null, 2));
			jsonCopied = true;
			setTimeout(() => (jsonCopied = false), 2000);
		} catch {
			// Clipboard unavailable — silently ignore
		}
	}

	async function copyExport() {
		const csv = [...loadedStores.values()].map((s) => s.fragment).join(',');
		try {
			await navigator.clipboard.writeText(csv);
			exportCopied = true;
			setTimeout(() => (exportCopied = false), 2000);
		} catch {
			importInput = csv;
		}
	}

	function runImport() {
		storeLoadError = '';
		importResult = '';
		if (!importInput.trim()) return;
		const fragments = importInput.split(',').map((s) => s.trim()).filter(Boolean);
		let added = 0;
		let failed = 0;
		for (const f of fragments) {
			let fragment = f;
			const hashIdx = fragment.indexOf('#');
			if (hashIdx !== -1) fragment = fragment.slice(hashIdx + 1);
			const starIdx = fragment.indexOf('*');
			if (starIdx !== -1) fragment = fragment.slice(0, starIdx);
			const ok = addStoreFromFragment(fragment);
			storeLoadError = '';
			if (ok) added++;
			else failed++;
		}
		importResult = `${added} added${failed > 0 ? `, ${failed} failed` : ''}`;
		if (added > 0) importInput = '';
	}

	// ─── Orders ───────────────────────────────────────────────────────────────

	let scanDays: number | null | undefined = $state(undefined);
	let scanMenuOpen = $state(false);
	let syncProgress = $state('');

	function getStoreOrderRelays(): string[] {
		const storeTags = [...loadedStores.values()].map((s) => s.data.tags);
		return collectOrderRelays(storeTags, [...DEFAULT_ORDER_RELAYS]);
	}

	async function paginateRelayGroup(
		relays: string[],
		sinceTs: number | undefined,
		label: string
	): Promise<NostrEvent[]> {
		const PAGE_LIMIT = 5000;
		const seen = new Set<string>();
		const all: NostrEvent[] = [];
		let until: number | undefined;
		let page = 0;

		while (true) {
			const filter: Record<string, unknown> = {
				kinds: [30078],
				'#t': [NOWHERE_T_TAG],
				limit: PAGE_LIMIT
			};
			if (sinceTs != null) filter.since = sinceTs;
			if (until != null) filter.until = until;

			page++;
			syncProgress = `${label}: page ${page}…`;
			const batch = await fetchEvents(filter as any, relays);
			if (batch.length === 0) break;

			const fresh = batch.filter((e) => !seen.has(e.id));
			for (const e of fresh) seen.add(e.id);
			all.push(...fresh);

			const oldest = batch.reduce((min, e) => Math.min(min, e.created_at), Infinity);
			const nextUntil = oldest - 1;
			if (until != null && nextUntil >= until) break;
			if (sinceTs != null && nextUntil < sinceTs) break;
			until = nextUntil;
		}

		return all;
	}

	async function syncOrders(days: number | null = 30) {
		if (!connected || !window.nostr?.nip44) return;
		syncing = true;
		syncError = '';
		syncProgress = 'Fetching events…';
		decryptErrors = 0;

		const allRelays = getStoreOrderRelays();
		const incremental = cacheEnabled && cacheOrderList && Object.keys(relaySyncTimes).length > 0;
		const windowStart = days != null
			? Math.floor(Date.now() / 1000) - days * 24 * 60 * 60
			: undefined;

		const groups = incremental
			? groupRelaysBySince(allRelays, relaySyncTimes, windowStart)
			: [{ relays: allRelays, since: windowStart }];

		const found: DecryptedOrder[] = [];
		const succeededRelays: string[] = [];

		try {
			const allBatches: NostrEvent[][] = [];

			for (let g = 0; g < groups.length; g++) {
				const group = groups[g];
				const isIncremental = incremental && group.since !== windowStart;
				const label = groups.length === 1
					? (isIncremental ? 'Incremental fetch' : `Fetching (${group.relays.length} relays)`)
					: `Group ${g + 1}/${groups.length} (${group.relays.length} relay${group.relays.length > 1 ? 's' : ''}${isIncremental ? ', incremental' : ''})`;

				try {
					const events = await paginateRelayGroup(group.relays, group.since, label);
					allBatches.push(events);
					succeededRelays.push(...group.relays);
				} catch (e) {
					// Log but continue — other groups may succeed
					console.warn(`[Nowhere] Relay group failed (${group.relays.join(', ')}):`, e);
				}
			}

			const merged = mergeEvents(allBatches);

			if (merged.length > 0) {
				syncProgress = `Decrypting ${merged.length} events…`;
				for (let i = 0; i < merged.length; i++) {
					try {
						const plaintext = await window.nostr!.nip44!.decrypt(merged[i].pubkey, merged[i].content);
						const parsed = JSON.parse(plaintext);
						if (parsed.orderId) found.push({ event: merged[i], order: parsed as OrderMessage });
					} catch {
						decryptErrors++;
					}
					if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
				}
			}

			if (incremental) {
				const existingIds = new Set(orders.map((o) => o.order.orderId));
				for (const o of found) {
					if (!existingIds.has(o.order.orderId)) orders.push(o);
				}
				orders = orders.sort((a, b) => b.order.timestamp - a.order.timestamp);
			} else {
				orders = found.sort((a, b) => b.order.timestamp - a.order.timestamp);
			}

			// Only record sync time for relays that actually responded
			const now = Date.now();
			for (const url of succeededRelays) {
				relaySyncTimes[url] = now;
			}
			relaySyncTimes = cleanSyncTimes({ ...relaySyncTimes }, allRelays);

			ordersFromCache = false;
			if (cacheEnabled && cacheOrderList) persistCache();
		} catch (e) {
			syncError = `Scan failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			syncing = false;
			syncProgress = '';
		}
	}

	async function fetchOrdersById() {
		if (!connected || !window.nostr?.nip44) return;
		const raw = fetchByIdInput.trim();
		if (!raw) return;

		// Parse IDs: split on commas, newlines, or whitespace
		const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
		if (ids.length === 0) return;

		fetchingById = true;
		fetchByIdError = '';
		fetchByIdResult = '';
		const found: DecryptedOrder[] = [];
		let errors = 0;

		try {
			// Batch into groups of 50 to stay within relay filter limits
			const BATCH = 50;
			for (let i = 0; i < ids.length; i += BATCH) {
				const batch = ids.slice(i, i + BATCH);
				const dtags = batch.map((id) => `${NOWHERE_DTAG_PREFIX}/${id}`);
				const events = await fetchEvents({ kinds: [30078], '#d': dtags }, getStoreOrderRelays());
				for (const event of events) {
					try {
						const plaintext = await window.nostr!.nip44!.decrypt(event.pubkey, event.content);
						const parsed = JSON.parse(plaintext);
						if (parsed.orderId) found.push({ event, order: parsed as OrderMessage });
					} catch {
						errors++;
					}
				}
			}

			// Merge into existing orders, avoiding duplicates
			const existingIds = new Set(orders.map((o) => o.order.orderId));
			let added = 0;
			for (const o of found) {
				if (!existingIds.has(o.order.orderId)) {
					orders.push(o);
					added++;
				}
			}
			orders = orders.sort((a, b) => b.order.timestamp - a.order.timestamp);

			const notFound = ids.length - found.length;
			fetchByIdResult = `${found.length} found, ${added} new` +
				(notFound > 0 ? `, ${notFound} not found` : '') +
				(errors > 0 ? `, ${errors} could not be decrypted` : '');

			if (added > 0) {
				ordersFromCache = false;
				if (cacheEnabled && cacheOrderList) persistCache();
			}
		} catch (e) {
			fetchByIdError = `Fetch failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			fetchingById = false;
		}
	}

	// ─── Order detail ─────────────────────────────────────────────────────────

	function openOrder(orderId: string) {
		selectedOrderId = orderId;
		orderVerification = null;
		verifySelectedOrder();
	}

	function closeOrder() {
		selectedOrderId = null;
		orderVerification = null;
	}

	async function verifySelectedOrder() {
		if (!selectedOrder) return;
		const { order } = selectedOrder;
		const store = loadedStores.get(order.storeId);

		if (!store) {
			orderVerification = {
				loading: false,
				error: 'Load this store URL to verify items.',
				expectedSubtotal: 0,
				expectedShipping: 0,
				expectedTotal: 0,
				historicalSatsPerUnit: null,
				rateSource: '',
				expectedSats: null,
				expectedPaymentAmount: null,
				paymentCurrencyLabel: null,
				paymentAmountMatch: null,
				paymentRateSource: null,
				subtotalMatch: null,
				shippingMatch: null,
				totalMatch: null
			};
			return;
		}

		orderVerification = {
			loading: true,
			error: null,
			expectedSubtotal: 0,
			expectedShipping: 0,
			expectedTotal: 0,
			historicalSatsPerUnit: null,
			rateSource: '',
			expectedSats: null,
			expectedPaymentAmount: null,
			paymentCurrencyLabel: null,
			paymentAmountMatch: null,
			paymentRateSource: null,
			subtotalMatch: null,
			shippingMatch: null,
			totalMatch: null
		};

		try {
			const cartItems: CartItem[] = order.items
				.filter((oi) => store.data.items[oi.i])
				.map((oi) => ({
					item: store.data.items[oi.i],
					itemIndex: oi.i,
					qty: oi.qty,
					selectedVariant: oi.v
				}));

			const rawSubtotal = cartItems.reduce((sum, ci) => sum + ci.item.price * ci.qty, 0);
			const discount = computeDiscount(cartItems, store.data.tags).amount;
			const expectedSubtotal = Math.round((rawSubtotal - discount) * 100) / 100;
			const expectedShipping = computeShipping(cartItems, store.data.tags, order.buyer?.country);
			const expectedTotal = Math.round((expectedSubtotal + expectedShipping) * 100) / 100;

			const subtotalMatch = Math.abs(order.subtotal / 100 - expectedSubtotal) < 0.02;
			const shippingMatch = Math.abs(order.shipping / 100 - expectedShipping) < 0.02;
			const totalMatch = Math.abs(order.total / 100 - expectedTotal) < 0.02;

			let historicalSatsPerUnit: number | null = null;
			let rateSource = '';
			let expectedSats: number | null = null;
			let expectedPaymentAmount: number | null = null;
			let paymentCurrencyLabel: string | null = null;
			let paymentAmountMatch: boolean | null = null;
			let paymentRateSource: string | null = null;

			const payCur = order.paymentCurrency?.toUpperCase();
			const isSatsPayment = !payCur || payCur === 'BTC' || payCur === 'SATS' || payCur === 'SAT';

			if (isSatsPayment) {
				try {
					const rate = await getHistoricalRate(store.currency, order.timestamp);
					historicalSatsPerUnit = rate.satsPerUnit;
					rateSource = rate.source;
					expectedSats = fiatToSats(expectedTotal, rate.satsPerUnit);
				} catch {
					rateSource = 'unavailable';
				}
			} else {
				// Fiat payment: derive expected amount via BTC pivot
				// expectedPayment = expectedTotal × (satsPerStoreUnit / satsPerPayUnit)
				paymentCurrencyLabel = order.paymentCurrency!;
				try {
					const [storeRate, payRate] = await Promise.all([
						getHistoricalRate(store.currency, order.timestamp),
						getHistoricalRate(order.paymentCurrency!, order.timestamp)
					]);
					expectedPaymentAmount = Math.round((expectedTotal * storeRate.satsPerUnit / payRate.satsPerUnit) * 100) / 100;
					paymentAmountMatch = order.paymentAmount != null
						? Math.abs(order.paymentAmount / 100 - expectedPaymentAmount) / expectedPaymentAmount <= 0.01
						: null;
					paymentRateSource = [storeRate.source, payRate.source]
						.filter((s, i, a) => s !== 'native' && a.indexOf(s) === i)
						.join('+') || 'native';
				} catch {
					paymentRateSource = 'unavailable';
				}
			}

			orderVerification = {
				loading: false,
				error: null,
				expectedSubtotal,
				expectedShipping,
				expectedTotal,
				historicalSatsPerUnit,
				rateSource,
				expectedSats,
				expectedPaymentAmount,
				paymentCurrencyLabel,
				paymentAmountMatch,
				paymentRateSource,
				subtotalMatch,
				shippingMatch,
				totalMatch
			};
			if (cacheEnabled && (cacheOrderList || cacheOrderData)) persistCache();
		} catch (e) {
			orderVerification = {
				...orderVerification!,
				loading: false,
				error: `Verification error: ${e instanceof Error ? e.message : String(e)}`
			};
		}
	}

	function setOrderStatus(orderId: string, status: OrderStatus) {
		orderStatuses = { ...orderStatuses, [orderId]: status };
		if (cacheEnabled) persistCache();
	}

	function setOrderNote(orderId: string, note: string) {
		orderNotes = { ...orderNotes, [orderId]: note };
		if (cacheEnabled) persistCache();
	}

	function confirmPayment(orderId: string) {
		confirmedOrderIds = new Set([...confirmedOrderIds, orderId]);
		if (!orderStatuses[orderId] || orderStatuses[orderId] === 'new') {
			orderStatuses = { ...orderStatuses, [orderId]: 'confirmed' };
		}
		if (cacheEnabled) persistCache();
	}

	function unconfirmPayment(orderId: string) {
		const next = new Set(confirmedOrderIds);
		next.delete(orderId);
		confirmedOrderIds = next;
		if (cacheEnabled) persistCache();
	}

	function hideOrder(orderId: string) {
		hiddenOrderIds = new Set([...hiddenOrderIds, orderId]);
		if (selectedOrderId === orderId) closeOrder();
		if (cacheEnabled) persistCache();
	}

	function hideSelectedOrders() {
		for (const id of selectedOrderIds) {
			hiddenOrderIds = new Set([...hiddenOrderIds, id]);
			if (selectedOrderId === id) closeOrder();
		}
		selectedOrderIds = new Set();
		if (cacheEnabled) persistCache();
	}

	function unhideOrder(orderId: string) {
		const next = new Set(hiddenOrderIds);
		next.delete(orderId);
		hiddenOrderIds = next;
		if (cacheEnabled) persistCache();
	}

	// ─── Reconciliation ───────────────────────────────────────────────────────

	function runReconciliation() {
		const matches = reconcileText.matchAll(/\b([0-9a-f]{15})\b/gi);
		const found = new Set<string>();
		for (const m of matches) found.add(m[1].toLowerCase());

		let matched = 0;
		const orderIdSet = new Set(orders.map((o) => o.order.orderId));
		for (const id of found) {
			if (orderIdSet.has(id)) {
				confirmedOrderIds = new Set([...confirmedOrderIds, id]);
				if (!orderStatuses[id] || orderStatuses[id] === 'new') {
					orderStatuses = { ...orderStatuses, [id]: 'confirmed' };
				}
				matched++;
			}
		}

		reconcileResult =
			matched === 0
				? 'No matching order IDs found in the pasted text.'
				: `${matched} order${matched !== 1 ? 's' : ''} marked as payment confirmed.`;

		if (cacheEnabled && matched > 0) persistCache();
	}

	// ─── Inventory ────────────────────────────────────────────────────────────

	function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
		const clean: Record<string, unknown> = Object.create(null);
		for (const [key, value] of Object.entries(obj)) {
			if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
			clean[key] = value;
		}
		return clean;
	}

	function applyStatus(status: StatusPayload) {
		notice = status.notice ?? '';
		closedMsg = status.closed ?? '';
		redirectUrl = status.redirect ?? '';
		itemLevels = cleanObject(status.items ?? {}) as Record<string, StockLevel>;
		variantLevels = cleanObject(status.variants ?? {}) as Record<string, Record<string, StockLevel>>;
		lowWarn = status.low?.warn ?? false;
		const f = (status.low?.fields ?? '').split(',').map((s) => s.trim()).filter(Boolean);
		lowFieldName    = f.includes('name');
		lowFieldEmail   = f.includes('email');
		lowFieldPhone   = f.includes('phone');
		lowFieldAddress = f.includes('address');
		lowFieldNostr   = f.includes('nostr');
		lowFieldNotes   = f.includes('notes');
		lowRefund = status.low?.refund ?? false;
	}

	async function loadInventoryStatus() {
		if (!storeFragment || !storePubkeyHex || !storeData) return;
		fetchingStatus = true;
		publishResult = '';
		try {
			const status = await fetchStatus(storeFragment, storePubkeyHex, storeData.tags);
			if (status) {
				applyStatus(status);
				if (cacheEnabled && cacheInventoryStatus) {
					cachedInventoryStatus = { ...cachedInventoryStatus, [storeFragment]: status };
					persistCache();
				}
				publishResult = 'Current status loaded from network.';
			} else {
				publishResult = 'No existing status found.';
			}
		} catch (e) {
			publishResult = `Failed to load: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			fetchingStatus = false;
		}
	}

	async function publishInventory() {
		if (!storeFragment || !storeData) return;
		publishing = true;
		publishResult = '';
		try {
			const payload: StatusPayload = { v: 1 };
			if (notice.trim()) payload.notice = notice.trim();
			if (closedMsg.trim()) payload.closed = closedMsg.trim();
			if (redirectUrl.trim()) payload.redirect = redirectUrl.trim();

			const changedItems: Record<string, StockLevel> = {};
			for (const [k, v] of Object.entries(itemLevels)) {
				if (v !== 3) changedItems[k] = v;
			}
			if (Object.keys(changedItems).length > 0) payload.items = changedItems;

			const changedVariants: Record<string, Record<string, StockLevel>> = {};
			for (const [idx, variants] of Object.entries(variantLevels)) {
				const changed: Record<string, StockLevel> = {};
				for (const [vName, level] of Object.entries(variants)) {
					if (level !== 3) changed[vName] = level;
				}
				if (Object.keys(changed).length > 0) changedVariants[idx] = changed;
			}
			if (Object.keys(changedVariants).length > 0) payload.variants = changedVariants;

			const lowFieldsStr = [
				lowFieldName    && 'name',
				lowFieldEmail   && 'email',
				lowFieldPhone   && 'phone',
				lowFieldAddress && 'address',
				lowFieldNostr   && 'nostr',
				lowFieldNotes   && 'notes',
			].filter(Boolean).join(',');
			if (lowWarn || lowFieldsStr || lowRefund) {
				payload.low = {};
				if (lowWarn) payload.low.warn = true;
				if (lowFieldsStr) payload.low.fields = lowFieldsStr;
				if (lowRefund) payload.low.refund = true;
			}

			await publishStatus(payload, storeFragment, storeData.tags);
			if (cacheEnabled && cacheInventoryStatus) {
				cachedInventoryStatus = { ...cachedInventoryStatus, [storeFragment]: payload };
				persistCache();
			}
			publishResult = 'Changes published successfully.';
		} catch (e) {
			publishResult = `Publish failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			publishing = false;
		}
	}

	function getItemVariants(item: Item): string[] {
		const vTag = item.tags.find((t: Tag) => t.key === 'v');
		if (!vTag?.value) return [];
		return vTag.value
			.split('.')
			.map((v) => v.trim())
			.filter(Boolean);
	}

	// ─── Standalone verify ────────────────────────────────────────────────────

	async function runStandaloneVerify() {
		if (!verifyJson.trim()) return;
		verifying2 = true;
		verifyResult = null;
		verifyOrder = null;

		const emptyVerification: OrderVerification = {
			loading: false, error: null,
			expectedSubtotal: 0, expectedShipping: 0, expectedTotal: 0,
			historicalSatsPerUnit: null, rateSource: '',
			expectedSats: null, expectedPaymentAmount: null,
			paymentCurrencyLabel: null, paymentAmountMatch: null,
			paymentRateSource: null, subtotalMatch: null,
			shippingMatch: null, totalMatch: null
		};

		try {
			const parsed = JSON.parse(verifyJson.trim());
			let order: OrderMessage;

			if (parsed.v === 1 && typeof parsed.p === 'string' && typeof parsed.c === 'string') {
				// Receipt format: { v: 1, p: <hex ephemeral pubkey>, c: <NIP-44 ciphertext of full event JSON> }
				if (!window.nostr?.nip44) throw new Error('NIP-44 extension required to decrypt receipt.');
				const eventJson = await window.nostr.nip44.decrypt(parsed.p, parsed.c);
				const event = JSON.parse(eventJson);
				if (!event.pubkey || !event.content) throw new Error('Invalid receipt: decrypted content is not a Nostr event.');
				const plaintext = await window.nostr.nip44.decrypt(event.pubkey, event.content);
				order = JSON.parse(plaintext) as OrderMessage;
			} else if (parsed.pubkey && typeof parsed.content === 'string' && parsed.kind) {
				// Raw Nostr event format
				if (!window.nostr?.nip44) throw new Error('NIP-44 extension required to decrypt event.');
				const plaintext = await window.nostr.nip44.decrypt(parsed.pubkey, parsed.content);
				order = JSON.parse(plaintext) as OrderMessage;
			} else {
				// Raw order JSON (plain OrderMessage)
				order = parsed as OrderMessage;
			}

			if (!order.orderId || !order.items) throw new Error('Invalid order format');
			verifyOrder = order;

			const store = loadedStores.get(order.storeId);
			if (!store) {
				verifyResult = { ok: false, verification: { ...emptyVerification, error: 'Store not loaded — add this store URL in Settings to verify amounts.' } };
				verifying2 = false;
				return;
			}

			const cartItems: CartItem[] = order.items
				.filter((oi) => store.data.items[oi.i])
				.map((oi) => ({
					item: store.data.items[oi.i],
					itemIndex: oi.i,
					qty: oi.qty,
					selectedVariant: oi.v
				}));

			const rawSubtotal = cartItems.reduce((sum, ci) => sum + ci.item.price * ci.qty, 0);
			const discount = computeDiscount(cartItems, store.data.tags).amount;
			const expectedSubtotal = Math.round((rawSubtotal - discount) * 100) / 100;
			const expectedShipping = computeShipping(cartItems, store.data.tags, order.buyer?.country);
			const expectedTotal = Math.round((expectedSubtotal + expectedShipping) * 100) / 100;

			const subtotalMatch = Math.abs(order.subtotal / 100 - expectedSubtotal) < 0.02;
			const shippingMatch = Math.abs(order.shipping / 100 - expectedShipping) < 0.02;
			const totalMatch = Math.abs(order.total / 100 - expectedTotal) < 0.02;
			let ok = subtotalMatch && shippingMatch && totalMatch;

			let historicalSatsPerUnit: number | null = null;
			let rateSource = '';
			let expectedSats: number | null = null;
			let expectedPaymentAmount: number | null = null;
			let paymentCurrencyLabel: string | null = null;
			let paymentAmountMatch: boolean | null = null;
			let paymentRateSource: string | null = null;

			const payCur = order.paymentCurrency?.toUpperCase();
			const isSatsPayment = !payCur || payCur === 'BTC' || payCur === 'SATS' || payCur === 'SAT';

			if (isSatsPayment) {
				try {
					const rate = await getHistoricalRate(store.currency, order.timestamp);
					historicalSatsPerUnit = rate.satsPerUnit;
					rateSource = rate.source;
					expectedSats = fiatToSats(expectedTotal, rate.satsPerUnit);
					if (verifyReceivedSats.trim()) {
						const received = parseInt(verifyReceivedSats.trim());
						if (!isNaN(received)) {
							const diff = Math.abs(received - expectedSats) / expectedSats;
							if (diff > 0.02) ok = false;
						}
					}
				} catch {
					rateSource = 'unavailable';
				}
			} else {
				paymentCurrencyLabel = order.paymentCurrency!;
				try {
					const [storeRate, payRate] = await Promise.all([
						getHistoricalRate(store.currency, order.timestamp),
						getHistoricalRate(order.paymentCurrency!, order.timestamp)
					]);
					expectedPaymentAmount = Math.round((expectedTotal * storeRate.satsPerUnit / payRate.satsPerUnit) * 100) / 100;
					paymentAmountMatch = order.paymentAmount != null
						? Math.abs(order.paymentAmount / 100 - expectedPaymentAmount) / expectedPaymentAmount <= 0.01
						: null;
					if (paymentAmountMatch === false) ok = false;
					paymentRateSource = [storeRate.source, payRate.source]
						.filter((s, i, a) => s !== 'native' && a.indexOf(s) === i)
						.join('+') || 'native';
				} catch {
					paymentRateSource = 'unavailable';
				}
			}

			verifyResult = {
				ok,
				verification: {
					loading: false, error: null,
					expectedSubtotal, expectedShipping, expectedTotal,
					historicalSatsPerUnit, rateSource, expectedSats,
					expectedPaymentAmount, paymentCurrencyLabel,
					paymentAmountMatch, paymentRateSource,
					subtotalMatch, shippingMatch, totalMatch
				}
			};
		} catch (e) {
			verifyResult = { ok: false, verification: { ...emptyVerification, error: e instanceof Error ? e.message : String(e) } };
		} finally {
			verifying2 = false;
		}
	}

	// ─── CSV export ───────────────────────────────────────────────────────────

	const KNOWN_BUYER_KEYS = ['name', 'email', 'phone', 'street', 'city', 'state', 'postal', 'country', 'nostr', 'notes'];

	function csvCell(value: string): string {
		if (value.includes(',') || value.includes('"') || value.includes('\n')) {
			return '"' + value.replace(/"/g, '""') + '"';
		}
		return value;
	}

	function exportOrdersCSV() {
		const rows = [...sortedOrders]; // already filtered and sorted
		if (rows.length === 0) return;

		// Discover extra buyer keys across all rows
		const extraKeys = new Set<string>();
		for (const { order } of rows) {
			for (const key of Object.keys(order.buyer ?? {})) {
				if (!KNOWN_BUYER_KEYS.includes(key)) extraKeys.add(key);
			}
		}
		const extraKeyCols = [...extraKeys].sort();

		const fixedHeaders = [
			'Date', 'Order ID', 'Store', 'Status', 'Confirmed',
			'Name', 'Email', 'Phone', 'Street', 'City', 'State', 'Postal', 'Country', 'Nostr', 'Notes',
			'Items', 'Subtotal', 'Shipping', 'Total', 'Store Currency',
			'Payment Method', 'Payment Currency', 'Payment Amount'
		];
		const headers = [...fixedHeaders, ...extraKeyCols];

		const csvRows: string[] = [headers.map(csvCell).join(',')];

		for (const { order } of rows) {
			const store = getOrderStore(order);
			const b = order.buyer ?? {};
			const cells = [
				formatDate(order.timestamp),
				order.orderId,
				store?.name ?? order.storeId,
				getStatusLabel(order.orderId),
				confirmedOrderIds.has(order.orderId) ? 'Yes' : 'No',
				b.name ?? '',
				b.email ?? '',
				b.phone ?? '',
				b.street ?? '',
				b.city ?? '',
				b.state ?? '',
				b.postal ?? '',
				b.country ?? '',
				b.nostr ?? '',
				b.notes ?? '',
				itemsSummary(order),
				formatAmount(order.subtotal),
				formatAmount(order.shipping),
				formatAmount(order.total),
				store?.currency ?? '',
				order.paymentMethod ?? '',
				order.paymentCurrency ?? '',
				order.paymentAmount != null ? formatAmount(order.paymentAmount) : '',
				...extraKeyCols.map((k) => b[k] ?? '')
			];
			csvRows.push(cells.map(csvCell).join(','));
		}

		const csv = csvRows.join('\r\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const filterLabel = ordersFilter === 'confirmed' ? '-confirmed' : '';
		const storeLabel = storeFilter ? `-${loadedStores.get(storeFilter)?.name.replace(/\s+/g, '-').toLowerCase() ?? storeFilter}` : '';
		a.download = `orders${storeLabel}${filterLabel}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ─── Cache persistence ────────────────────────────────────────────────────

	let cacheSaveTimer: ReturnType<typeof setTimeout>;

	function persistCache() {
		clearTimeout(cacheSaveTimer);
		cacheSaveTimer = setTimeout(async () => {
			try {
				await saveCache(
					{
						...(cacheStoreUrls && { storeFragments: [...loadedStores.values()].map((s) => s.fragment) }),
						...(cacheOrderList && orders.length > 0 && { orders: orders.map((d) => d.order) }),
						...(cacheOrderList && Object.keys(relaySyncTimes).length > 0 && { relaySyncTimes }),
						orderStatuses: cacheOrderData ? orderStatuses : {},
						confirmedOrderIds: cacheOrderData ? [...confirmedOrderIds] : [],
						hiddenOrderIds: cacheOrderData ? [...hiddenOrderIds] : [],
						orderNotes: cacheOrderData ? orderNotes : {},
						...(cacheInventoryStatus && Object.keys(cachedInventoryStatus).length > 0 && { inventoryStatus: cachedInventoryStatus }),
						...((cacheOrderList || cacheOrderData) && { historicalRates: exportHistoricalRateCache() }),
						uiPrefs: { tab: activeTab, ordersFilter }
					},
					sellerPubkey
				);
			} catch {
				// Silent — extension may have been disconnected
			}
		}, 800);
	}

	async function enableCache() {
		cacheEnabled = true;
		persistCache();
	}

	let confirmClearCache = $state(false);

	function disableCache() {
		cacheEnabled = false;
		cacheOrderData = true;
		cacheStoreUrls = true;
		cacheOrderList = true;
		cacheInventoryStatus = true;
		cachedInventoryStatus = {};
		confirmClearCache = false;
		clearCache();
	}

	// Auto-apply cached inventory status when a store is selected
	$effect(() => {
		const frag = storeFragment;
		if (frag && cachedInventoryStatus[frag]) {
			applyStatus(cachedInventoryStatus[frag]);
		}
	});

	// ─── Keyboard handling ────────────────────────────────────────────────────

	$effect(() => {
		function onKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				if (selectedOrderId) closeOrder();
				else if (reconcileOpen) reconcileOpen = false;
			}
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	onMount(() => {
		hasCached = hasCachedSession();
	});

	/* Manage pages are light-mode only. Host apps may have set `html[data-theme="dark"]`
	   (e.g. nowhr's /app toggle); force light while mounted and restore on unmount. */
	onMount(() => {
		const html = document.documentElement;
		const prev = html.dataset.theme;
		html.dataset.theme = 'light';
		return () => {
			if (prev === undefined) delete html.dataset.theme;
			else html.dataset.theme = prev;
		};
	});

	// ─── Helpers ──────────────────────────────────────────────────────────────

	function getOrderStore(order: OrderMessage): LoadedStore | null {
		return loadedStores.get(order.storeId) ?? null;
	}

	function formatDate(ts: number): string {
		return new Date(ts * 1000).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatAmount(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	function getStatusLabel(orderId: string): OrderStatus {
		return orderStatuses[orderId] ?? 'new';
	}

	function itemsSummary(order: OrderMessage): string {
		const store = getOrderStore(order);
		if (!store) return `${order.items.length} item${order.items.length !== 1 ? 's' : ''}`;
		return order.items
			.map((oi) => {
				const item = store.data.items[oi.i];
				const name = item?.name ?? `Item #${oi.i}`;
				return oi.qty > 1 ? `${oi.qty}× ${name}` : name;
			})
			.join(', ');
	}

	const stockLabels: Record<number, string> = {
		3: 'In Stock',
		2: 'Low Stock',
		1: 'Out of Stock',
		0: 'Discontinued'
	};

	const statusColors: Record<OrderStatus, string> = {
		new: 'badge-gray',
		confirmed: 'badge-blue',
		processing: 'badge-amber',
		fulfilled: 'badge-green',
		refunded: 'badge-red',
		no_payment: 'badge-red'
	};

	const statusLabels: Record<OrderStatus, string> = {
		new: 'New',
		confirmed: 'Confirmed',
		processing: 'Processing',
		fulfilled: 'Fulfilled',
		refunded: 'Refunded',
		no_payment: 'No Payment'
	};

	// Options shown in the status dropdown — 'confirmed' is set via the confirm button only
	const dropdownStatusOptions: [OrderStatus, string][] = [
		['new', 'New'],
		['processing', 'Processing'],
		['fulfilled', 'Fulfilled'],
		['refunded', 'Refunded'],
		['no_payment', 'No Payment']
	];

	const tabTitles: Record<Tab, string> = {
		overview: 'Overview',
		orders: 'Orders',
		hidden: 'Hidden Orders',
		inventory: 'Inventory',
		status: 'Store Status',
		stores: 'My Stores',
		settings: 'Settings',
		verify: 'Manual Verification'
	};

import ManageNav from './ManageNav.svelte';
</script>

<svelte:head>
	<title>{storeLoaded ? `${loadedStores.size === 1 ? [...loadedStores.values()][0].name : `${loadedStores.size} stores`} · Dashboard` : 'Store Dashboard'} · nowhere</title>
</svelte:head>

{#if !connected}
<!-- ── Auth screen ───────────────────────────────────────────────────────── -->
<div class="signin-root">
	<ManageNav />
	<div class="signin-content">
		<div class="signin-brand">
			<span class="signin-brand-mark">nowhere</span>
			<span class="signin-brand-type">Store</span>
		</div>
		<h1 class="signin-heading">Connect your<br><em>extension.</em></h1>
		<button class="signin-btn" onclick={connect} disabled={connecting}>
			{connecting ? 'Connecting…' : 'Connect Extension →'}
		</button>
		{#if hasCached}
			<p class="signin-hint">A saved session was found. Connect to restore it.</p>
		{/if}
		{#if connectError}
			<p class="signin-error">{connectError}</p>
		{/if}
	</div>
</div><!-- signin-root -->

{:else}
<!-- ── Dashboard ─────────────────────────────────────────────────────────── -->
<div class="manage-page">
	<nav class="manage-nav">
		<button
			class="nav-menu-toggle"
			aria-label="Toggle navigation"
			aria-expanded={sidebarOpen}
			onclick={() => (sidebarOpen = !sidebarOpen)}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="20" height="20">
				<line x1="3" y1="6" x2="21" y2="6" />
				<line x1="3" y1="12" x2="21" y2="12" />
				<line x1="3" y1="18" x2="21" y2="18" />
			</svg>
		</button>
		<a href="/" class="logo">nowhere</a>
		<a href="/manage" class="nav-link">Manage</a>
		<a href="/create/store" class="nav-link">Store Builder</a>
		<button class="btn-signout" onclick={signOut}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14">
				<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
				<polyline points="16 17 21 12 16 7" />
				<line x1="21" y1="12" x2="9" y2="12" />
			</svg>
			<span class="btn-label">Sign out</span>
		</button>
	</nav>
	<div class="dashboard">
		{#if sidebarOpen}
			<button
				class="sidebar-backdrop"
				aria-label="Close navigation"
				onclick={() => (sidebarOpen = false)}
			></button>
		{/if}
		<!-- Sidebar -->
		<aside class="sidebar" class:is-open={sidebarOpen}>
			<div class="sidebar-top">
				<div class="store-pill">
					{#if loadedStores.size === 0}
						<span class="store-name store-name-muted">No stores loaded</span>
					{:else if loadedStores.size === 1}
						<span class="store-name">{[...loadedStores.values()][0].name}</span>
						<span class="store-currency">{[...loadedStores.values()][0].currency}</span>
					{:else}
						<span class="store-name">{loadedStores.size} stores</span>
					{/if}
				</div>
			</div>

			<nav class="sidebar-nav">
				<button
					class="nav-item"
					class:active={activeTab === 'overview'}
					onclick={() => setTab('overview')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<rect x="3" y="3" width="7" height="7" rx="1.5" />
						<rect x="14" y="3" width="7" height="7" rx="1.5" />
						<rect x="3" y="14" width="7" height="7" rx="1.5" />
						<rect x="14" y="14" width="7" height="7" rx="1.5" />
					</svg>
					Overview
				</button>

				<button
					class="nav-item"
					class:active={activeTab === 'stores'}
					onclick={() => setTab('stores')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						<polyline points="9 22 9 12 15 12 15 22" />
					</svg>
					My Stores
				</button>

				<button
					class="nav-item"
					class:active={activeTab === 'orders'}
					onclick={() => setTab('orders')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
						<path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
					</svg>
					Orders
					{#if newOrderCount > 0}
						<span class="nav-badge">{newOrderCount}</span>
					{/if}
				</button>

				{#if hiddenOrderIds.size > 0}
					<button
						class="nav-item"
						class:active={activeTab === 'hidden'}
						onclick={() => setTab('hidden')}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
							<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
							<line x1="1" y1="1" x2="23" y2="23" />
						</svg>
						Hidden

					</button>
				{/if}

				<button
					class="nav-item"
					class:active={activeTab === 'inventory'}
					disabled={!inventoryEnabled}
					onclick={() => setTab('inventory')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
						<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
						<line x1="12" y1="22.08" x2="12" y2="12" />
					</svg>
					Inventory
					{#if lowStockCount > 0}
						<span class="nav-badge amber">{lowStockCount}</span>
					{/if}
				</button>

				<button
					class="nav-item"
					class:active={activeTab === 'status'}
					disabled={!inventoryEnabled}
					onclick={() => setTab('status')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
					Store Status
				</button>

				<button
					class="nav-item"
					class:active={activeTab === 'settings'}
					onclick={() => setTab('settings')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
					</svg>
					Settings
				</button>

				<div class="nav-divider"></div>

				<button
					class="nav-item"
					class:active={activeTab === 'verify'}
					onclick={() => setTab('verify')}
				>
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
					</svg>
					Manual Verification
				</button>
			</nav>

			<div class="sidebar-footer">
				<div class="connection-pill">
					<span class="dot-green"></span>
					<span class="pubkey-label">{sellerNpub.slice(0, 12)}…{sellerNpub.slice(-4)}</span>
				</div>
			</div>
		</aside>

		<!-- Main -->
		<main class="main">
			<div class="main-header">
				<h1 class="page-title">{tabTitles[activeTab]}</h1>
				<div class="header-actions">
					{#if activeTab === 'orders'}
						{#if false}
							<button
								class="btn-outline btn-sm icon-action"
								onclick={() => (reconcileOpen = true)}
								disabled={orders.length === 0}
								aria-label="Reconcile Payments"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
									<polyline points="22 4 12 14.01 9 11.01" />
									<path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
								</svg>
								<span class="btn-label">Reconcile Payments</span>
							</button>
						{/if}
						{#if sortedOrders.length > 0}
							<button class="btn-outline btn-sm icon-action" onclick={exportOrdersCSV} aria-label="Export CSV">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
									<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
									<polyline points="7 10 12 15 17 10" />
									<line x1="12" y1="15" x2="12" y2="3" />
								</svg>
								<span class="btn-label">Export CSV</span>
							</button>
						{/if}
						<button class="btn-outline btn-sm icon-action with-label" onclick={() => (fetchByIdOpen = !fetchByIdOpen)} disabled={fetchingById} aria-label="Fetch by ID">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
							</svg>
							<span class="btn-label">Fetch by ID</span>
						</button>
						{#if syncing}
							<button class="btn-outline btn-sm icon-action" disabled aria-label="Scanning">
								<span class="spinner-sm"></span><span class="btn-label">{syncProgress || 'Scanning…'}</span>
							</button>
						{:else}
							<button class="btn-outline btn-sm icon-action with-label" class:active={scanMenuOpen} onclick={() => (scanMenuOpen = !scanMenuOpen)} aria-label="Refresh">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
									<polyline points="23 4 23 10 17 10" />
									<path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
								</svg>
								<span class="btn-label">Refresh</span>
							</button>
						{/if}
					{:else if activeTab === 'inventory' || activeTab === 'status'}
						<button class="btn-outline btn-sm" onclick={loadInventoryStatus} disabled={fetchingStatus}>
							{#if fetchingStatus}<span class="spinner-sm"></span>{/if}
							{fetchingStatus ? 'Loading…' : 'Load Current'}
						</button>
					{/if}
				</div>
			</div>

			{#if activeTab === 'orders' && scanMenuOpen && !syncing}
				<div class="scan-menu">
					<button class="btn-outline btn-sm scan-btn" class:active={scanDays === 1} onclick={() => { scanDays = 1; scanMenuOpen = false; syncOrders(1); }}>1 Day</button>
					<button class="btn-outline btn-sm scan-btn" class:active={scanDays === 7} onclick={() => { scanDays = 7; scanMenuOpen = false; syncOrders(7); }}>7 Days</button>
					<button class="btn-outline btn-sm scan-btn" class:active={scanDays === 30} onclick={() => { scanDays = 30; scanMenuOpen = false; syncOrders(30); }}>30 Days</button>
					<button class="btn-outline btn-sm scan-btn" class:active={scanDays === null} onclick={() => { scanDays = null; scanMenuOpen = false; syncOrders(null); }}>All</button>
				</div>
			{/if}

			<div class="main-content">

				<!-- ══════════════════════ OVERVIEW ══════════════════════════ -->
				{#if activeTab === 'overview'}
					<div class="stat-grid">
						<div class="stat-card">
							<span class="stat-label">Total Orders</span>
							<span class="stat-value">{orders.length}</span>
							<span class="stat-hint">
								{#if lastSyncTime > 0}
									Synced {new Date(lastSyncTime).toLocaleTimeString()}
								{:else}
									Not yet synced
								{/if}
							</span>
						</div>
						<div class="stat-card accent-green">
							<span class="stat-label">Confirmed Payments</span>
							<span class="stat-value">{confirmedOrderIds.size}</span>
							<span class="stat-hint">of {orders.length} orders</span>
						</div>
						<div class="stat-card accent-blue">
							<span class="stat-label">Confirmed Revenue</span>
							<span class="stat-value">{revenueCurrencyLabel} {confirmedRevenue.toFixed(2)}</span>
							<span class="stat-hint">{uniqueCurrencies.size > 1 ? 'multiple currencies' : 'confirmed orders only'}</span>
						</div>
						<div class="stat-card {lowStockCount > 0 ? 'accent-amber' : ''}">
							<span class="stat-label">Stock Alerts</span>
							<span class="stat-value">{lowStockCount}</span>
							<span class="stat-hint">
								{lowStockCount === 0 ? 'All items in stock' : 'items need attention'}
							</span>
						</div>
					</div>

					{#if orders.length === 0}
						<div class="empty-state">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" width="44" height="44" class="empty-icon">
								<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
								<path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
							</svg>
							<p>No orders loaded yet.</p>
							<button class="btn-outline" onclick={() => (activeTab = 'orders')}>Go to Orders</button>
						</div>
					{:else}
						<div class="table-label">Recent Orders</div>
						<div class="order-table">
							<div class="order-table-head">
								<span>Date</span>
								<span>Order</span>
								<span>Store</span>
								<span>Items</span>
								<span>Amount</span>
								<span>Status</span>
							</div>
							{#each [...visibleOrders].sort((a, b) => b.order.timestamp - a.order.timestamp).slice(0, 10) as { order }}
								<button
									class="order-row"
									onclick={() => {
										activeTab = 'orders';
										openOrder(order.orderId);
									}}
								>
									<span class="col-date">{formatDate(order.timestamp)}</span>
									<span class="col-id mono">{order.orderId.slice(0, 10)}…</span>
									<span class="col-store">
										{#if getOrderStore(order)}
											{getOrderStore(order)!.name}
										{:else}
											<span class="col-store-unknown">{order.storeId.slice(0, 8)}…</span>
										{/if}
									</span>
									<span class="col-items">{itemsSummary(order)}</span>
									<span class="col-amount mono">{getOrderStore(order)?.currency ?? '?'} {formatAmount(order.total)}</span>
									<span>
										<span class="badge {statusColors[getStatusLabel(order.orderId)]}">
											{statusLabels[getStatusLabel(order.orderId)]}
										</span>
									</span>
								</button>
							{/each}
						</div>
					{/if}

				<!-- ══════════════════════ ORDERS ═════════════════════════════ -->
				{:else if activeTab === 'orders'}
					<div class="orders-payment-warning" role="alert">
						<div class="orders-payment-warning-title">Orders are not proof of payment</div>
						<p>
							Orders shown here may not correspond to real payments. Orders can be submitted without payment being sent.
						</p>
						<p>
							<strong>Always check your wallet for a payment matching the order ID before you ship anything.</strong>
						</p>
					</div>
					{#if syncError}
						<div class="alert alert-error">{syncError}</div>
					{/if}

					{#if fetchByIdOpen}
						<div class="fetch-by-id-panel">
							<div class="fetch-by-id-header">
								<span class="fetch-by-id-title">Fetch by Order ID</span>
								<button class="fetch-by-id-close" onclick={() => (fetchByIdOpen = false)} aria-label="Close">&times;</button>
							</div>
							<p class="fetch-by-id-hint">
								Enter order IDs from your payment history (lightning transaction messages or fiat payment references). One per line, or separated by commas.
							</p>
							<textarea
								class="fetch-by-id-input"
								bind:value={fetchByIdInput}
								placeholder={"e.g.\na1b2c3d4e5f6789\n0f1e2d3c4b5a678"}
								rows="4"
								disabled={fetchingById}
							></textarea>
							<div class="fetch-by-id-actions">
								<button class="btn-outline btn-sm" onclick={fetchOrdersById} disabled={fetchingById || !fetchByIdInput.trim()}>
									{#if fetchingById}
										<span class="spinner-sm"></span>Fetching…
									{:else}
										Fetch
									{/if}
								</button>
								{#if fetchByIdResult}
									<span class="fetch-by-id-result">{fetchByIdResult}</span>
								{/if}
								{#if fetchByIdError}
									<span class="fetch-by-id-error">{fetchByIdError}</span>
								{/if}
							</div>
						</div>
					{/if}

					<div class="filter-bar">
						<div class="filter-tabs">
							<button
								class="filter-tab"
								class:active={ordersFilter === 'all'}
								onclick={() => (ordersFilter = 'all')}
							>
								All <span class="filter-count">{storeFilteredOrders.length}</span>
							</button>
							<button
								class="filter-tab"
								class:active={ordersFilter === 'confirmed'}
								onclick={() => (ordersFilter = 'confirmed')}
							>
								Confirmed <span class="filter-count">{storeFilteredConfirmedCount}</span>
							</button>
						</div>
						{#if loadedStores.size > 0}
							<select class="store-filter-select" bind:value={storeFilter}>
								<option value={null}>All stores</option>
								{#each [...loadedStores.entries()] as [id, store]}
									<option value={id}>{store.name}</option>
								{/each}
							</select>
						{/if}
						<div class="id-filter-wrap">
							<input
								class="id-filter-input"
								type="text"
								bind:value={orderIdFilter}
								placeholder="Filter by order ID…"
							/>
							{#if orderIdFilter}
								<button class="id-filter-clear" onclick={() => (orderIdFilter = '')} aria-label="Clear">×</button>
							{/if}
						</div>
						{#if selectedOrderIds.size > 0}
							<button class="btn-hide btn-hide-selected" onclick={hideSelectedOrders}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
									<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
									<line x1="1" y1="1" x2="23" y2="23" />
								</svg>
								Hide {selectedOrderIds.size} {selectedOrderIds.size === 1 ? 'order' : 'orders'}
							</button>
						{/if}
					</div>

					<div class="sync-status">
						{#if ordersFromCache}
							<span class="sync-note">Loaded from cache <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11" style="vertical-align: middle; margin: 0 1px"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg> scan to fetch new orders</span>
						{:else if lastSyncTime > 0}
							<span class="sync-note">Last synced {formatDate(lastSyncTime / 1000)}</span>
						{/if}
					</div>

					{#if orders.length === 0}
						<div class="empty-state">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" width="44" height="44" class="empty-icon">
								<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
								<path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
							</svg>
							<p>No orders loaded. Use the scan buttons to fetch recent orders, or <strong>Fetch by ID</strong> to look up specific orders.</p>
						</div>
					{:else if displayedOrders.length === 0}
						<div class="empty-state">
							{#if idFilterTokens.length > 0}
								<p>No orders match the entered ID{idFilterTokens.length > 1 ? 's' : ''}.</p>
							{:else}
								<p>No confirmed orders yet.</p>
							{/if}
						</div>
					{:else}
						<div class="order-table order-table-selectable">
							<div class="order-table-head">
								<span class="col-check">
									<input
										type="checkbox"
										class="row-check"
										checked={displayedOrders.length > 0 && displayedOrders.every(({ order }) => selectedOrderIds.has(order.orderId))}
										indeterminate={displayedOrders.some(({ order }) => selectedOrderIds.has(order.orderId)) && !displayedOrders.every(({ order }) => selectedOrderIds.has(order.orderId))}
										onchange={(e) => {
											if ((e.target as HTMLInputElement).checked) {
												selectedOrderIds = new Set(displayedOrders.map(({ order }) => order.orderId));
											} else {
												selectedOrderIds = new Set();
											}
										}}
										aria-label="Select all orders"
									/>
								</span>
								<span>Date</span>
								<span>Order ID</span>
								<span>Store</span>
								<span>Items</span>
								<span>Amount</span>
								<span>Payment</span>
								<span>Status</span>
							</div>
							{#each displayedOrders as { order }}
								<button
									class="order-row"
									class:selected={selectedOrderId === order.orderId}
									onclick={() => openOrder(order.orderId)}
								>
									<span class="col-check" onclick={(e) => e.stopPropagation()}>
										<input
											type="checkbox"
											class="row-check"
											checked={selectedOrderIds.has(order.orderId)}
											onchange={(e) => {
												const next = new Set(selectedOrderIds);
												if ((e.target as HTMLInputElement).checked) {
													next.add(order.orderId);
												} else {
													next.delete(order.orderId);
												}
												selectedOrderIds = next;
											}}
											aria-label="Select order"
										/>
									</span>
									<span class="col-date">{formatDate(order.timestamp)}</span>
									<span class="col-id mono">
										{order.orderId.slice(0, 10)}…
										{#if confirmedOrderIds.has(order.orderId)}
											<span class="paid-dot" title="Payment confirmed"></span>
										{/if}
									</span>
									<span class="col-store">
										{#if getOrderStore(order)}
											{getOrderStore(order)!.name}
										{:else}
											<span class="col-store-unknown">{order.storeId.slice(0, 8)}…</span>
										{/if}
									</span>
									<span class="col-items">{itemsSummary(order)}</span>
									<span class="col-amount mono">{getOrderStore(order)?.currency ?? '?'} {formatAmount(order.total)}</span>
									<span class="col-payment">{order.paymentMethod ?? '—'}</span>
									<span>
										<span class="badge {statusColors[getStatusLabel(order.orderId)]}">
											{statusLabels[getStatusLabel(order.orderId)]}
										</span>
									</span>
								</button>
							{/each}
						</div>
					{/if}

				<!-- ══════════════════════ HIDDEN ════════════════════════════ -->
				{:else if activeTab === 'hidden'}
					{#if hiddenOrders.length === 0}
						<div class="empty-state">
							<p>No hidden orders{storeFilter ? ' for this store' : ''}.</p>
						</div>
					{:else}
						<div class="order-table">
							<div class="order-table-head">
								<span>Date</span>
								<span>Order ID</span>
								<span>Store</span>
								<span>Items</span>
								<span>Amount</span>
								<span>Payment</span>
								<span>Restore</span>
							</div>
							{#each [...hiddenOrders].sort((a, b) => b.order.timestamp - a.order.timestamp) as { order }}
								<div class="order-row order-row-hidden">
									<span class="col-date">{formatDate(order.timestamp)}</span>
									<span class="col-id mono">{order.orderId.slice(0, 10)}…</span>
									<span class="col-store">
										{#if getOrderStore(order)}
											{getOrderStore(order)!.name}
										{:else}
											<span class="col-store-unknown">{order.storeId.slice(0, 8)}…</span>
										{/if}
									</span>
									<span class="col-items">{itemsSummary(order)}</span>
									<span class="col-amount mono">{getOrderStore(order)?.currency ?? '?'} {formatAmount(order.total)}</span>
									<span class="col-payment">{order.paymentMethod ?? '—'}</span>
									<span>
										<button class="btn-unhide btn-sm-inline" onclick={() => unhideOrder(order.orderId)}>
											Restore
										</button>
									</span>
								</div>
							{/each}
						</div>
					{/if}

				<!-- ══════════════════════ INVENTORY ══════════════════════════ -->
				{:else if activeTab === 'inventory'}
					{#if publishResult}
						<div class="alert {publishResult.includes('fail') || publishResult.includes('Failed') ? 'alert-error' : 'alert-success'}">
							{publishResult}
						</div>
					{/if}

					{#if inventoryStores.length >= 1}
						<div class="form-section">
							<div class="form-field">
								<label for="inv-store-picker">Store</label>
								<select id="inv-store-picker" bind:value={selectedInventoryStoreId}>
									{#each inventoryStores as [id, store]}
										<option value={id}>{store.name}</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}

				<div class="form-section">
					<h2 class="section-label">Low Stock Settings</h2>
					<label class="checkbox-row">
						<input type="checkbox" bind:checked={lowWarn} />
						<span>Show low stock warning to buyers</span>
					</label>
					<div class="form-field">
						<label>Required for low-stock orders</label>
						<div class="low-field-checks">
							<label class="checkbox-row"><input type="checkbox" bind:checked={lowFieldName}    /> <span>Name</span></label>
							<label class="checkbox-row"><input type="checkbox" bind:checked={lowFieldEmail}   /> <span>Email</span></label>
							<label class="checkbox-row"><input type="checkbox" bind:checked={lowFieldPhone}   /> <span>Phone</span></label>
							<label class="checkbox-row"><input type="checkbox" bind:checked={lowFieldAddress} /> <span>Shipping address</span></label>
							<label class="checkbox-row"><input type="checkbox" bind:checked={lowFieldNostr}   /> <span>Nostr npub</span></label>
							<label class="checkbox-row"><input type="checkbox" bind:checked={lowFieldNotes}   /> <span>Order notes</span></label>
						</div>
					</div>
					<label class="checkbox-row">
						<input type="checkbox" bind:checked={lowRefund} />
						<span>Require refund address for low-stock items</span>
					</label>
				</div>

				<div class="form-section">
					<button class="section-toggle" onclick={() => (inventoryExpanded = !inventoryExpanded)}>
						<h2 class="section-label">Manage Inventory</h2>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"
							style="transform: rotate({inventoryExpanded ? 90 : 0}deg); transition: transform 0.15s ease; flex-shrink: 0">
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
					{#if inventoryExpanded && storeData}
						{#each storeData.items as item, idx}
							{@const variants = getItemVariants(item)}
							{@const isExpanded = expandedItems.has(idx)}
							<div class="inv-item">
								<div class="inv-item-row">
									<span class="inv-item-name">{item.name}</span>
									<div class="inv-item-controls">
										<select
											value={itemLevels[String(idx)] ?? 3}
											onchange={(e) => {
												itemLevels[String(idx)] = Number(
													(e.target as HTMLSelectElement).value
												) as StockLevel;
											}}
											class="stock-select lvl-{itemLevels[String(idx)] ?? 3}"
										>
											{#each [3, 2, 1, 0] as level}
												<option value={level}>{stockLabels[level]}</option>
											{/each}
										</select>
										{#if variants.length > 0}
											<button
												class="inv-expand-btn"
												onclick={() => {
													const next = new Set(expandedItems);
													if (isExpanded) next.delete(idx); else next.add(idx);
													expandedItems = next;
												}}
												aria-label={isExpanded ? 'Collapse variants' : 'Expand variants'}
											>
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"
													style="transform: rotate({isExpanded ? 90 : 0}deg); transition: transform 0.15s ease">
													<polyline points="9 18 15 12 9 6" />
												</svg>
											</button>
										{/if}
									</div>
								</div>
								{#if variants.length > 0 && isExpanded}
									<div class="variant-list">
										{#each variants as variant}
											<div class="variant-row">
												<span class="variant-name">{variant}</span>
												<select
													value={variantLevels[String(idx)]?.[variant] ?? 3}
													onchange={(e) => {
														if (!variantLevels[String(idx)]) variantLevels[String(idx)] = {};
														variantLevels[String(idx)][variant] = Number(
															(e.target as HTMLSelectElement).value
														) as StockLevel;
													}}
													class="stock-select lvl-{variantLevels[String(idx)]?.[variant] ?? 3}"
												>
													{#each [3, 2, 1, 0] as level}
														<option value={level}>{stockLabels[level]}</option>
													{/each}
												</select>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>

				<div class="form-actions">
					<button class="btn-primary" onclick={publishInventory} disabled={publishing}>
						{#if publishing}<span class="spinner-sm"></span>{/if}
						{publishing ? 'Publishing…' : 'Publish Changes'}
					</button>
				</div>

				<!-- ══════════════════════ STORE STATUS ══════════════════════ -->
				{:else if activeTab === 'status'}
					{#if publishResult}
						<div class="alert {publishResult.includes('fail') || publishResult.includes('Failed') ? 'alert-error' : 'alert-success'}">
							{publishResult}
						</div>
					{/if}

					{#if inventoryStores.length >= 1}
						<div class="form-section">
							<div class="form-field">
								<label for="status-store-picker">Store</label>
								<select id="status-store-picker" bind:value={selectedInventoryStoreId}>
									{#each inventoryStores as [id, store]}
										<option value={id}>{store.name}</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}

					<div class="form-section">
						<h2 class="section-label">Messaging</h2>
						<div class="form-field">
							<label for="st-notice">Notice banner</label>
							<input id="st-notice" type="text" bind:value={notice} placeholder="e.g. Holiday shipping delays expected" />
							<span class="field-hint">Displayed to buyers above the store. Leave empty to hide.</span>
						</div>
						<div class="form-field">
							<label for="st-closed">Closure message</label>
							<input id="st-closed" type="text" bind:value={closedMsg} placeholder="e.g. We're closed for the holidays" />
							<span class="field-hint">Setting this disables checkout until cleared.</span>
						</div>
					</div>

					<div class="form-section">
						<h2 class="section-label">Redirect</h2>
						<div class="form-field">
							<label for="st-redirect">Redirect URL</label>
							<input id="st-redirect" type="text" bind:value={redirectUrl} placeholder="https://…" />
							<span class="field-hint">Buyers will be forwarded here instead of seeing the store.</span>
						</div>
					</div>

					<div class="form-actions">
						<button class="btn-primary" onclick={publishInventory} disabled={publishing}>
							{#if publishing}<span class="spinner-sm"></span>{/if}
							{publishing ? 'Publishing…' : 'Publish Changes'}
						</button>
					</div>

				<!-- ══════════════════════ SETTINGS ══════════════════════════ -->
				<!-- ══════════════════════ MY STORES ═════════════════════════════ -->
				{:else if activeTab === 'stores'}
					<div class="form-section">
						<h2 class="section-label">Manage Stores</h2>
						<p class="section-desc">Load store URLs to see their orders and manage inventory. Enable "Save store URLs" in the session cache to restore them automatically on next login.</p>

						{#if loadedStores.size > 0}
							<div class="store-list">
								{#each [...loadedStores.entries()] as [storeId, store]}
									<div class="store-list-item">
										<div class="store-list-info">
											<span class="store-list-name">{store.name}</span>
											<span class="store-list-id mono">{storeId}</span>
										</div>
										<div class="store-list-actions">
											<button
												class="icon-btn"
												title="Copy store URL"
												onclick={() => copyStoreUrl(storeId, store)}
											>
												{#if copiedStoreId === storeId}
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15">
														<polyline points="20 6 9 17 4 12" />
													</svg>
												{:else}
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
														<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
														<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
													</svg>
												{/if}
											</button>
											<a
												class="icon-btn"
												href={storeUrl(store)}
												target="_blank"
												rel="noopener noreferrer"
												title="Open store in new tab"
											>
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
													<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
													<polyline points="15 3 21 3 21 9" />
													<line x1="10" y1="14" x2="21" y2="3" />
												</svg>
											</a>
											{#if confirmRemoveStoreId === storeId}
												<span class="remove-confirm">
													<span class="remove-confirm-label">Remove?</span>
													<button class="btn-danger btn-sm" onclick={() => removeStore(storeId)}>Yes</button>
													<button class="btn-outline btn-sm" onclick={() => (confirmRemoveStoreId = null)}>No</button>
												</span>
											{:else}
												<button class="btn-outline btn-sm" onclick={() => (confirmRemoveStoreId = storeId)}>Remove</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<div class="url-row" style="margin-top: var(--space-3)">
							<input type="text" bind:value={storeUrlInput} placeholder="https://nowhr.xyz/s#…" class="url-input"
								onkeydown={(e) => e.key === 'Enter' && loadSingleStore()}
								oninput={() => { storeDecryptMode = false; storeDecryptPassword = ''; storeDecryptError = ''; storePendingFragment = ''; }} />
							<button class="btn-outline" onclick={loadSingleStore}>Add</button>
						</div>
						{#if storeLoadError}<p class="field-error">{storeLoadError}</p>{/if}
						{#if storeLoadSuccess}<p class="field-success">{storeLoadSuccess}</p>{/if}
						{#if storeDecryptMode}
							<p class="decrypt-hint">This URL could not be loaded. It may be encrypted — enter a password to try, or check that the URL is correct.</p>
							<div class="decrypt-row">
								<input
									type={storeShowPassword ? 'text' : 'password'}
									bind:value={storeDecryptPassword}
									placeholder="Password"
									class="decrypt-input"
									onkeydown={(e) => e.key === 'Enter' && !storeDecrypting && storeDecryptPassword && tryDecryptStore()}
								/>
								<button class="btn-ghost" onclick={() => storeShowPassword = !storeShowPassword}>
									{storeShowPassword ? 'Hide' : 'Show'}
								</button>
								<button
									class="btn-outline"
									onclick={tryDecryptStore}
									disabled={!storeDecryptPassword || storeDecrypting}
								>
									{storeDecrypting ? 'Decrypting…' : 'Decrypt & Add'}
								</button>
							</div>
							{#if storeDecryptError}<p class="field-error">{storeDecryptError}</p>{/if}
						{/if}
					</div>

					{#if loadedStores.size > 0}
						<div class="form-section">
							<h2 class="section-label">Export / Import</h2>
							<p class="section-desc">Export your loaded store list as a comma-separated fragment list, or import one.</p>

							<div class="export-row">
								<button class="btn-outline btn-sm" onclick={copyExport}>
									{exportCopied ? 'Copied!' : 'Copy list to clipboard'}
								</button>
							</div>

							<div class="form-field" style="margin-top: var(--space-3)">
								<label for="import-input">Import list</label>
								<textarea
									id="import-input"
									rows="3"
									bind:value={importInput}
									placeholder="Paste comma-separated store fragments or URLs…"
								></textarea>
							</div>
							<div class="form-actions">
								<button class="btn-outline btn-sm" onclick={runImport} disabled={!importInput.trim()}>Import</button>
							</div>
							{#if importResult}<p class="field-success">{importResult}</p>{/if}
						</div>
					{/if}

				<!-- ══════════════════════ SETTINGS ═══════════════════════════════ -->
				{:else if activeTab === 'settings'}
					<div class="form-section">
						<h2 class="section-label">Session Cache</h2>
						<p class="section-desc">
							Persist your session between visits. Everything is encrypted with NIP-44 using your signing key before being stored — nothing is saved in plaintext.
						</p>
						{#if cacheEnabled}
							<div class="cache-status-row">
								<div class="cache-on-pill">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
										<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
									</svg>
									Encryption enabled
								</div>
								{#if confirmClearCache}
									<span class="remove-confirm">
										<span class="remove-confirm-label">This will delete all cached orders, notes, and store URLs. Are you sure?</span>
										<button class="btn-danger btn-sm" onclick={disableCache}>Yes, clear</button>
										<button class="btn-outline btn-sm" onclick={() => (confirmClearCache = false)}>Cancel</button>
									</span>
								{:else}
									<button class="btn-outline btn-sm" onclick={() => (confirmClearCache = true)}>
										Disable &amp; clear
									</button>
								{/if}
							</div>
							<div class="cache-subopts">
								<label class="cache-subopt">
									<input
										type="checkbox"
										bind:checked={cacheOrderList}
										onchange={() => persistCache()}
									/>
									<span>Save order data</span>
									<span class="cache-subopt-hint">orders appear immediately on next login — scans will only fetch events since your last scan</span>
								</label>
								<label class="cache-subopt">
									<input
										type="checkbox"
										bind:checked={cacheOrderData}
										onchange={() => persistCache()}
									/>
									<span>Save order notes</span>
									<span class="cache-subopt-hint">statuses, confirmations, notes</span>
								</label>
								<label class="cache-subopt">
									<input
										type="checkbox"
										bind:checked={cacheStoreUrls}
										onchange={() => persistCache()}
									/>
									<span>Save store URLs</span>
									<span class="cache-subopt-hint">auto-load your stores on next login</span>
								</label>
								<label class="cache-subopt">
									<input
										type="checkbox"
										bind:checked={cacheInventoryStatus}
										onchange={() => persistCache()}
									/>
									<span>Save inventory & status</span>
									<span class="cache-subopt-hint">store notice, closure, and stock levels load instantly</span>
								</label>
							</div>

							{#if Object.keys(relaySyncTimes).length > 0}
								<details class="relay-sync-details">
									<summary>Relay sync state ({Object.keys(relaySyncTimes).length} relay{Object.keys(relaySyncTimes).length !== 1 ? 's' : ''})</summary>
									<table class="relay-sync-table">
										<thead>
											<tr><th>Relay</th><th>Last synced</th></tr>
										</thead>
										<tbody>
											{#each Object.entries(relaySyncTimes).sort(([a], [b]) => a.localeCompare(b)) as [url, ts]}
												<tr>
													<td class="relay-url">{url.replace('wss://', '')}</td>
													<td>{new Date(ts).toLocaleString()}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</details>
							{/if}
						{:else}
							<button class="btn-primary" onclick={enableCache}>Enable session caching</button>
							<p class="section-hint">
								Your signing extension must be connected on each return visit to decrypt the session.
							</p>
						{/if}
					</div>

				<!-- ══════════════════════ VERIFY ═════════════════════════════ -->
				{:else if activeTab === 'verify'}
					<p class="section-desc">
						Verify an order received out-of-band against your store. Accepts a buyer receipt file, a raw Nostr event, or a plain order JSON object. Amounts are recomputed independently from the store data — nothing from the order message is trusted for calculations.
					</p>

					<div class="form-section">
						<div class="form-field">
							<div class="verify-label-row">
								<label for="v-json">
									Order data
									<span class="field-hint">(receipt, Nostr event, or raw order JSON)</span>
								</label>
								<label class="upload-receipt-btn">
									Upload file
									<input type="file" accept=".receipt,.json" onchange={handleReceiptFileUpload} />
								</label>
							</div>
							<textarea
								id="v-json"
								rows="8"
								bind:value={verifyJson}
								placeholder={'Paste a .receipt file, a raw Nostr event, or an order JSON object…'}
							></textarea>
						</div>
						<div class="form-field">
							<label for="v-sats">
								Sats received
								<span class="field-hint">(optional — for Lightning amount check)</span>
							</label>
							<input id="v-sats" type="number" bind:value={verifyReceivedSats} placeholder="Amount in sats" />
						</div>
						<button
							class="btn-primary"
							onclick={runStandaloneVerify}
							disabled={verifying2 || !verifyJson.trim()}
						>
							{#if verifying2}<span class="spinner-sm"></span>{/if}
							{verifying2 ? 'Verifying…' : 'Verify'}
						</button>
					</div>

					{#if verifyResult && verifyOrder}
						<!-- Order detail -->
						<div class="verify-order-detail">

							<!-- Meta -->
							<div class="panel-section">
								<div class="meta-grid">
									<span class="meta-key">Order ID</span>
									<span class="meta-val mono">{verifyOrder.orderId}</span>
									<span class="meta-key">Date</span>
									<span class="meta-val">{formatDate(verifyOrder.timestamp)}</span>
									{#if verifyOrder.paymentMethod}
										<span class="meta-key">Payment method</span>
										<span class="meta-val">
											{verifyOrder.paymentMethod}
											{#if verifyOrder.paymentCurrency && verifyOrder.paymentAmount}
												— {verifyOrder.paymentCurrency} {formatAmount(verifyOrder.paymentAmount)}
											{/if}
										</span>
									{/if}
								</div>
							</div>

							<!-- Items -->
							<div class="panel-section">
								<h3 class="panel-section-title">Items</h3>
								{#if !verifyOrderStore}
									<p class="field-hint" style="margin-bottom: var(--space-3)">Store not loaded — add this store URL in Settings to see item names.</p>
								{/if}
								{#each verifyOrder.items as oi}
									{@const item = verifyOrderStore?.data.items[oi.i]}
									<div class="panel-item-row">
										<span class="pi-name">
											{item?.name ?? `Item #${oi.i}`}
											{#if oi.v}<span class="pi-variant">{oi.v}</span>{/if}
										</span>
										<span class="pi-qty">×{oi.qty}</span>
										{#if item}
											<span class="pi-price mono">{verifyOrderStore?.currency ?? '?'} {(item.price * oi.qty).toFixed(2)}</span>
										{/if}
									</div>
								{/each}
								<div class="panel-totals">
									<div class="totals-row">
										<span>Subtotal</span>
										<span class="mono">{verifyOrderStore?.currency ?? '?'} {formatAmount(verifyOrder.subtotal)}</span>
									</div>
									<div class="totals-row">
										<span>Shipping</span>
										<span class="mono">{verifyOrderStore?.currency ?? '?'} {formatAmount(verifyOrder.shipping)}</span>
									</div>
									<div class="totals-row total-final">
										<span>Total</span>
										<span class="mono">{verifyOrderStore?.currency ?? '?'} {formatAmount(verifyOrder.total)}</span>
									</div>
									{#if verifyOrder.totalSats}
										<div class="totals-row">
											<span>Sats</span>
											<span class="mono">{verifyOrder.totalSats.toLocaleString()} sats</span>
										</div>
									{/if}
								</div>
							</div>

							<!-- Buyer -->
							{#if Object.keys(verifyOrder.buyer ?? {}).length > 0}
								<div class="panel-section">
									<h3 class="panel-section-title">Buyer details</h3>
									<p class="verify-guidance">These details were entered by the buyer and are not verified by the system. Check that the name, address, and any contact information look legitimate before fulfilling the order.</p>
									<div class="meta-grid">
										{#each Object.entries(verifyOrder.buyer) as [key, value]}
											<span class="meta-key">{key}</span>
											<span class="meta-val">{value}</span>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Verification checks -->
							<div class="panel-section">
								<h3 class="panel-section-title">Amount checks</h3>
								{#if verifyResult.verification?.error}
									<div class="alert alert-error" style="margin:0">{verifyResult.verification.error}</div>
								{:else if verifyResult.verification}
									{@const v = verifyResult.verification}
									<p class="verify-guidance">
										These amounts are recomputed from your current store configuration. ✓ means the buyer's claimed figure matches what your store would have charged. ✗ means a discrepancy — this could indicate tampering, a price change since the order was placed, or a rounding difference.
									</p>
									<div class="verify-checks">
										<div class="check-row {v.subtotalMatch ? 'pass' : 'fail'}">
											<span class="check-mark">{v.subtotalMatch ? '✓' : '✗'}</span>
											<span class="check-body">
												Subtotal <span class="mono">{verifyOrderStore?.currency ?? '?'} {v.expectedSubtotal.toFixed(2)}</span>
												{#if !v.subtotalMatch}
													<span class="check-mismatch">(claimed {verifyOrderStore?.currency ?? '?'} {formatAmount(verifyOrder.subtotal)})</span>
												{/if}
											</span>
										</div>
										<div class="check-row {v.shippingMatch ? 'pass' : 'fail'}">
											<span class="check-mark">{v.shippingMatch ? '✓' : '✗'}</span>
											<span class="check-body">
												Shipping <span class="mono">{verifyOrderStore?.currency ?? '?'} {v.expectedShipping.toFixed(2)}</span>
												{#if !v.shippingMatch}
													<span class="check-mismatch">(claimed {verifyOrderStore?.currency ?? '?'} {formatAmount(verifyOrder.shipping)})</span>
												{/if}
											</span>
										</div>
										<div class="check-row {v.totalMatch ? 'pass' : 'fail'}">
											<span class="check-mark">{v.totalMatch ? '✓' : '✗'}</span>
											<span class="check-body">
												Total <span class="mono">{verifyOrderStore?.currency ?? '?'} {v.expectedTotal.toFixed(2)}</span>
												{#if !v.totalMatch}
													<span class="check-mismatch">(claimed {verifyOrderStore?.currency ?? '?'} {formatAmount(verifyOrder.total)})</span>
												{/if}
											</span>
										</div>

										{#if v.paymentCurrencyLabel !== null && v.paymentRateSource !== 'unavailable'}
											<div class="check-divider"></div>
											{#if v.expectedPaymentAmount !== null}
												<div class="check-row {v.paymentAmountMatch === false ? 'fail' : v.paymentAmountMatch === true ? 'pass' : ''}">
													<span class="check-mark">{v.paymentAmountMatch === true ? '✓' : v.paymentAmountMatch === false ? '✗' : '—'}</span>
													<span class="check-body">
														Payment <span class="mono">{v.paymentCurrencyLabel} {v.expectedPaymentAmount.toFixed(2)}</span>
														{#if v.paymentAmountMatch === false && verifyOrder.paymentAmount != null}
															<span class="check-mismatch">(claimed {v.paymentCurrencyLabel} {formatAmount(verifyOrder.paymentAmount)})</span>
														{/if}
													</span>
												</div>
												<div class="rate-row">
													<span class="rate-label">Rate source</span>
													<span>{v.paymentRateSource}</span>
												</div>
											{/if}
										{:else if v.paymentCurrencyLabel !== null && v.paymentRateSource === 'unavailable'}
											<div class="check-divider"></div>
											<div class="payment-pending-note">
												Historical rate unavailable for {v.paymentCurrencyLabel} — you must check the payment amount manually.
											</div>
										{:else if v.historicalSatsPerUnit !== null && v.expectedSats !== null}
											<div class="check-divider"></div>
											<div class="rate-row">
												<span class="rate-label">Historical BTC/{verifyOrderStore?.currency ?? '?'}</span>
												<span class="mono">{v.historicalSatsPerUnit.toFixed(2)} sats/unit</span>
											</div>
											<div class="rate-row">
												<span class="rate-label">Source</span>
												<span>{v.rateSource}</span>
											</div>
											<div class="rate-row">
												<span class="rate-label">Expected sats</span>
												<span class="mono">{v.expectedSats.toLocaleString()} sats</span>
											</div>
										{:else if v.rateSource === 'unavailable'}
											<div class="check-divider"></div>
											<div class="payment-pending-note">
												Historical rate unavailable — you must check the payment amount manually.
											</div>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Payment action -->
							{#if verifyResult.verification && !verifyResult.verification.error}
								{@const v = verifyResult.verification}
								{@const payCur = verifyOrder.paymentCurrency?.toUpperCase()}
								{@const isSats = !payCur || payCur === 'BTC' || payCur === 'SATS' || payCur === 'SAT'}
								<div class="panel-section verify-action-section">
									<h3 class="panel-section-title">What you must do now</h3>
									{#if isSats}
										<p class="verify-action">
											Open your Lightning wallet and confirm a payment of approximately <strong>{v.expectedSats !== null ? v.expectedSats.toLocaleString() + ' sats' : 'the expected amount'}</strong> was received with the label <strong>"Order {verifyOrder.orderId}"</strong>. The sats figure is based on historical exchange rates — a small variance is normal. You must find this payment yourself; the system cannot check your wallet.
										</p>
									{:else if v.paymentCurrencyLabel !== null}
										{#if v.expectedPaymentAmount !== null && v.paymentRateSource !== 'unavailable'}
											<p class="verify-action">
												Check your {v.paymentCurrencyLabel} payment processor for a payment of approximately <strong>{v.paymentCurrencyLabel} {v.expectedPaymentAmount.toFixed(2)}</strong> with the order ID <strong>{verifyOrder.orderId}</strong> in the description or reference field. The amount is derived from historical exchange rates — a small variance is normal. You must locate this payment yourself.
											</p>
										{:else}
											<p class="verify-action">
												Check your {v.paymentCurrencyLabel} payment processor for a payment referencing order ID <strong>{verifyOrder.orderId}</strong>. The historical rate is unavailable so no expected amount could be calculated — you must assess the amount manually against the total shown above.
											</p>
										{/if}
									{/if}
									<p class="verify-action-caveat">
										The amount checks above only confirm that the order data is internally consistent with your store configuration. They do not confirm that payment was received.
									</p>
								</div>
							{/if}

						</div><!-- .verify-order-detail -->
					{:else if verifyResult && !verifyOrder}
						<div class="alert alert-error">
							{verifyResult.verification?.error ?? 'Could not read order data. Check the input and try again.'}
						</div>
					{/if}
				{/if}

			</div><!-- .main-content -->
		</main>
	</div><!-- .dashboard -->

	<!-- ── Order detail panel ─────────────────────────────────────────────────── -->
	{#if selectedOrderId && selectedOrder}
		<div
			class="panel-backdrop"
			onclick={closeOrder}
			onkeydown={(e) => e.key === 'Enter' && closeOrder()}
			role="button"
			tabindex="-1"
			aria-label="Close order panel"
		></div>
		<aside class="order-panel">
			<div class="panel-header">
				<div class="panel-header-left">
					<h2 class="panel-title">Order Details</h2>
					<code class="panel-oid">{selectedOrder.order.orderId}</code>
				</div>
				<button class="icon-btn" onclick={closeOrder} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div class="panel-body">

				<!-- Status & payment controls -->
				<div class="panel-section">
					<div class="panel-controls">
						<select
							value={getStatusLabel(selectedOrder.order.orderId)}
							onchange={(e) =>
								setOrderStatus(
									selectedOrder!.order.orderId,
									(e.target as HTMLSelectElement).value as OrderStatus
								)}
							class="status-select"
						>
							{#each dropdownStatusOptions as [val, label]}
								<option value={val}>{label}</option>
							{/each}
							{#if getStatusLabel(selectedOrder.order.orderId) === 'confirmed'}
								<option value="confirmed">Confirmed</option>
							{/if}
						</select>

						{#if confirmedOrderIds.has(selectedOrder.order.orderId)}
							<button
								class="btn-outline btn-sm"
								onclick={() => unconfirmPayment(selectedOrder!.order.orderId)}
							>
								Unmark payment
							</button>
						{:else}
							<button
								class="btn-confirm"
								onclick={() => confirmPayment(selectedOrder!.order.orderId)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
									<polyline points="20 6 9 17 4 12" />
								</svg>
								Confirm payment
							</button>
						{/if}

						{#if hiddenOrderIds.has(selectedOrder.order.orderId)}
							<button
								class="btn-unhide"
								onclick={() => unhideOrder(selectedOrder!.order.orderId)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
								Restore order
							</button>
						{:else}
							<button
								class="btn-hide"
								onclick={() => hideOrder(selectedOrder!.order.orderId)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
									<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
									<line x1="1" y1="1" x2="23" y2="23" />
								</svg>
								Hide order
							</button>
						{/if}
					</div>

					<div class="meta-grid">
						<span class="meta-key">Date</span>
						<span class="meta-val">{formatDate(selectedOrder.order.timestamp)}</span>
						{#if selectedOrder.order.paymentMethod}
							<span class="meta-key">Payment method</span>
							<span class="meta-val">
								{selectedOrder.order.paymentMethod}
								{#if selectedOrder.order.paymentCurrency && selectedOrder.order.paymentAmount}
									— {selectedOrder.order.paymentCurrency}
									{formatAmount(selectedOrder.order.paymentAmount)}
								{/if}
							</span>
						{/if}
					</div>
				</div>

				<!-- Items -->
				<div class="panel-section">
					<h3 class="panel-section-title">Items</h3>
					{#if !selectedOrderStore}
						<p class="field-hint" style="margin-bottom: var(--space-3)">Store not loaded — add this store URL in Settings to see item names and verify amounts.</p>
					{/if}
					{#each selectedOrder.order.items as oi}
						{@const item = selectedOrderStore?.data.items[oi.i]}
						<div class="panel-item-row">
							<span class="pi-name">
								{item?.name ?? `Item #${oi.i}`}
								{#if oi.v}<span class="pi-variant">{oi.v}</span>{/if}
							</span>
							<span class="pi-qty">×{oi.qty}</span>
							{#if item}
								<span class="pi-price mono">{selectedOrderStore?.currency ?? '?'} {(item.price * oi.qty).toFixed(2)}</span>
							{/if}
						</div>
					{/each}

					<div class="panel-totals">
						<div class="totals-row">
							<span>Subtotal</span>
							<span class="mono">{selectedOrderStore?.currency ?? '?'} {formatAmount(selectedOrder.order.subtotal)}</span>
						</div>
						<div class="totals-row">
							<span>Shipping</span>
							<span class="mono">{selectedOrderStore?.currency ?? '?'} {formatAmount(selectedOrder.order.shipping)}</span>
						</div>
						<div class="totals-row total-final">
							<span>Total</span>
							<span class="mono">{selectedOrderStore?.currency ?? '?'} {formatAmount(selectedOrder.order.total)}</span>
						</div>
						{#if selectedOrder.order.totalSats}
							<div class="totals-row">
								<span>Sats</span>
								<span class="mono">{selectedOrder.order.totalSats.toLocaleString()} sats</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Buyer -->
				{#if Object.keys(selectedOrder.order.buyer ?? {}).length > 0}
					<div class="panel-section">
						<h3 class="panel-section-title">Buyer</h3>
						<div class="meta-grid">
							{#each Object.entries(selectedOrder.order.buyer) as [key, value]}
								<span class="meta-key">{key}</span>
								<span class="meta-val">{value}</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Verification -->
				<div class="panel-section">
					<h3 class="panel-section-title">Verification</h3>

					{#if !orderVerification || orderVerification.loading}
						<div class="verify-loading">
							<span class="spinner-sm"></span>
							Checking order against store…
						</div>
					{:else if orderVerification.error}
						<div class="alert alert-error" style="margin:0">{orderVerification.error}</div>
					{:else}
						<div class="verify-checks">
							<div class="check-row {orderVerification.subtotalMatch ? 'pass' : 'fail'}">
								<span class="check-mark">{orderVerification.subtotalMatch ? '✓' : '✗'}</span>
								<span class="check-body">
									Subtotal <span class="mono">{selectedOrderStore?.currency ?? '?'} {orderVerification.expectedSubtotal.toFixed(2)}</span>
									{#if !orderVerification.subtotalMatch}
										<span class="check-mismatch">
											(claimed {selectedOrderStore?.currency ?? '?'} {formatAmount(selectedOrder.order.subtotal)})
										</span>
									{/if}
								</span>
							</div>

							<div class="check-row {orderVerification.shippingMatch ? 'pass' : 'fail'}">
								<span class="check-mark">{orderVerification.shippingMatch ? '✓' : '✗'}</span>
								<span class="check-body">
									Shipping <span class="mono">{selectedOrderStore?.currency ?? '?'} {orderVerification.expectedShipping.toFixed(2)}</span>
									{#if !orderVerification.shippingMatch}
										<span class="check-mismatch">
											(claimed {selectedOrderStore?.currency ?? '?'} {formatAmount(selectedOrder.order.shipping)})
										</span>
									{/if}
								</span>
							</div>

							<div class="check-row {orderVerification.totalMatch ? 'pass' : 'fail'}">
								<span class="check-mark">{orderVerification.totalMatch ? '✓' : '✗'}</span>
								<span class="check-body">
									Total <span class="mono">{selectedOrderStore?.currency ?? '?'} {orderVerification.expectedTotal.toFixed(2)}</span>
									{#if !orderVerification.totalMatch}
										<span class="check-mismatch">
											(claimed {selectedOrderStore?.currency ?? '?'} {formatAmount(selectedOrder.order.total)})
										</span>
									{/if}
								</span>
							</div>

							{#if orderVerification.paymentCurrencyLabel !== null && orderVerification.paymentRateSource !== 'unavailable'}
								<!-- Fiat payment path -->
								<div class="check-divider"></div>
								{#if orderVerification.expectedPaymentAmount !== null}
									<div class="check-row {orderVerification.paymentAmountMatch === false ? 'fail' : orderVerification.paymentAmountMatch === true ? 'pass' : ''}">
										<span class="check-mark">{orderVerification.paymentAmountMatch === true ? '✓' : orderVerification.paymentAmountMatch === false ? '✗' : '—'}</span>
										<span class="check-body">
											Payment <span class="mono">{orderVerification.paymentCurrencyLabel} {orderVerification.expectedPaymentAmount.toFixed(2)}</span>
											{#if orderVerification.paymentAmountMatch === false && selectedOrder.order.paymentAmount != null}
												<span class="check-mismatch">
													(claimed {orderVerification.paymentCurrencyLabel} {formatAmount(selectedOrder.order.paymentAmount)})
												</span>
											{/if}
										</span>
									</div>
									<div class="rate-row">
										<span class="rate-label">Rate source</span>
										<span>{orderVerification.paymentRateSource}</span>
									</div>
								{/if}
								{#if confirmedOrderIds.has(selectedOrder.order.orderId)}
									<div class="payment-confirmed-note">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
											<polyline points="20 6 9 17 4 12" />
										</svg>
										Payment confirmed by you
									</div>
								{:else}
									<div class="payment-pending-note">
										Check your {orderVerification.paymentCurrencyLabel} payment processor for
										{#if orderVerification.expectedPaymentAmount !== null}
											<strong>{orderVerification.paymentCurrencyLabel} {orderVerification.expectedPaymentAmount.toFixed(2)}</strong>
										{/if}
										for order <strong>{selectedOrder.order.orderId}</strong>.
									</div>
								{/if}
							{:else if orderVerification.paymentCurrencyLabel !== null && orderVerification.paymentRateSource === 'unavailable'}
								<div class="check-divider"></div>
								<div class="payment-pending-note">
									Historical rate unavailable for {orderVerification.paymentCurrencyLabel} cross-rate — manual amount review required.
								</div>
							{:else if orderVerification.historicalSatsPerUnit !== null && orderVerification.expectedSats !== null}
								<!-- Sats payment path -->
								<div class="check-divider"></div>
								<div class="rate-row">
									<span class="rate-label">Historical BTC/{selectedOrderStore?.currency ?? '?'}</span>
									<span class="mono">{orderVerification.historicalSatsPerUnit.toFixed(2)} sats/unit</span>
								</div>
								<div class="rate-row">
									<span class="rate-label">Source</span>
									<span>{orderVerification.rateSource}</span>
								</div>
								<div class="rate-row">
									<span class="rate-label">Expected sats</span>
									<span class="mono">{orderVerification.expectedSats.toLocaleString()} sats</span>
								</div>

								{#if confirmedOrderIds.has(selectedOrder.order.orderId)}
									<div class="payment-confirmed-note">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
											<polyline points="20 6 9 17 4 12" />
										</svg>
										Payment confirmed by you
									</div>
								{:else}
									<div class="payment-pending-note">
										Check your Lightning wallet for a payment labelled
										<strong>"Order {selectedOrder.order.orderId}"</strong>
										of approximately
										<strong>{orderVerification.expectedSats.toLocaleString()} sats</strong>.
									</div>
								{/if}
							{:else if orderVerification.rateSource === 'unavailable'}
								<div class="check-divider"></div>
								<div class="payment-pending-note">
									Historical rate unavailable — manual amount review required.
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Notes -->
				<div class="panel-section">
					<h3 class="panel-section-title">Notes</h3>
					<textarea
						class="notes-ta"
						rows="3"
						placeholder="Private notes about this order…"
						value={orderNotes[selectedOrder.order.orderId] ?? ''}
						oninput={(e) =>
							setOrderNote(
								selectedOrder!.order.orderId,
								(e.target as HTMLTextAreaElement).value
							)}
					></textarea>
					{#if !cacheEnabled}
						<p class="notes-hint">Enable session caching in Settings to persist notes.</p>
					{/if}
				</div>

			<!-- Raw JSON -->
			<div class="panel-json-row">
				<button
					class="btn-outline btn-sm"
					onclick={() => copyOrderJson(selectedOrder.order)}
				>
					{#if jsonCopied}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
							<polyline points="20 6 9 17 4 12" />
						</svg>
						Copied
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
						</svg>
						Copy raw JSON
					{/if}
				</button>
			</div>

			</div><!-- .panel-body -->
		</aside>
	{/if}

	<!-- ── Reconciliation modal ──────────────────────────────────────────────── -->
	{#if reconcileOpen}
		<div
			class="modal-backdrop"
			onclick={() => (reconcileOpen = false)}
			onkeydown={(e) => e.key === 'Enter' && (reconcileOpen = false)}
			role="button"
			tabindex="-1"
			aria-label="Close modal"
		></div>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="recon-title">
			<div class="modal-header">
				<h2 id="recon-title">Reconcile Lightning Payments</h2>
				<button class="icon-btn" onclick={() => (reconcileOpen = false)} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
			<div class="modal-body">
				<p class="section-desc">
					In your Lightning wallet, find incoming payments labelled
					<strong>"Order XXXXXXXXXXXXXXX"</strong>. Paste the order IDs — or any text containing
					them — below. The dashboard will match and confirm all found orders.
				</p>
				<textarea
					class="reconcile-ta"
					rows="7"
					bind:value={reconcileText}
					placeholder="Paste transaction history or order IDs here…

e.g.
Order 4a8b2c9d1e3f7a0  ·  50,000 sats
Order 9f1a3c5e7b2d4f6  ·  12,800 sats"
				></textarea>
				{#if reconcileResult}
					<p class="reconcile-msg">{reconcileResult}</p>
				{/if}
				<div class="modal-actions">
					<button
						class="btn-outline"
						onclick={() => {
							reconcileOpen = false;
							reconcileText = '';
							reconcileResult = '';
						}}
					>
						Cancel
					</button>
					<button class="btn-primary" onclick={runReconciliation} disabled={!reconcileText.trim()}>
						Match Orders
					</button>
				</div>
			</div>
		</div>
	{/if}
</div><!-- manage-page -->
{/if}

<style>
	/* ─── Page shell ─────────────────────────────────────────────────────────── */

	.manage-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	/* ── Mode 1 (sign-in) ─────────────────────────────────────────────────── */
	.signin-root {
		--bg:     #fafaf8;
		--ink:    #1a1a1a;
		--ink-60: rgba(26,26,26,0.60);
		--ink-35: rgba(26,26,26,0.35);
		--ink-15: rgba(26,26,26,0.09);
		--nav-bg: rgba(250,250,248,0.90);
		--font:   -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--mono:   ui-monospace, 'SF Mono', 'Cascadia Code', 'Courier New', monospace;
		--col:    clamp(1.5rem, 6vw, 5rem);
		min-height: 100vh;
		background: var(--bg);
		font-family: var(--font);
		-webkit-font-smoothing: antialiased;
	}

	:global([data-theme="dark"]) .signin-root {
		--bg:     #0d0d0d;
		--ink:    #e8e8e8;
		--ink-60: rgba(232,232,232,0.60);
		--ink-35: rgba(232,232,232,0.35);
		--ink-15: rgba(232,232,232,0.10);
		--nav-bg: rgba(13,13,13,0.88);
	}

	@keyframes page-enter {
		from { opacity: 0; transform: translateY(6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.signin-content {
		padding: clamp(6rem, 14vh, 10rem) var(--col) clamp(4rem, 10vh, 7rem);
		animation: page-enter 0.3s ease forwards;
	}

	.signin-brand {
		display: flex;
		align-items: baseline;
		gap: 0.5em;
		margin-bottom: clamp(1.5rem, 3vh, 2.5rem);
	}

	.signin-brand-mark {
		font-size: clamp(2rem, 3.5vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--ink);
	}

	.signin-brand-type {
		font-size: clamp(2rem, 3.5vw, 3rem);
		font-weight: 500;
		letter-spacing: -0.03em;
		color: var(--ink-60);
	}

	.signin-heading {
		font-size: clamp(2rem, 5vw, 4rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.05;
		color: var(--ink);
		margin-bottom: clamp(2.5rem, 6vh, 4rem);
	}

	.signin-heading em {
		font-style: normal;
		color: var(--ink-35);
	}

	.signin-btn {
		font-family: var(--font);
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--ink-60);
		background: none;
		border: 1px solid var(--ink-15);
		padding: 0.75rem 1.25rem;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s, border-color 0.15s;
	}

	.signin-btn:hover:not(:disabled) {
		color: var(--ink);
		border-color: var(--ink-35);
	}

	.signin-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.signin-hint {
		margin-top: 1.25rem;
		font-size: 0.75rem;
		color: var(--ink-35);
		letter-spacing: 0.01em;
	}

	.signin-error {
		margin-top: 1rem;
		font-size: 0.75rem;
		color: #b91c1c;
	}

	/* ── Mode 2 nav (dashboard) ───────────────────────────────────────────── */
	.manage-nav {
		display: flex;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.logo {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
	}

	.nav-link {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.section {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.connected-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		margin-bottom: var(--space-6);
	}

	.badge-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-success);
		flex-shrink: 0;
	}

	.connected-badge code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.connected-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		width: fit-content;
	}

	.dot-green {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-success);
		flex-shrink: 0;
	}

	.url-row {
		display: flex;
		gap: var(--space-2);
	}

	.url-input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
	}

	.url-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	/* ─── Dashboard shell ────────────────────────────────────────────────────── */

	.dashboard {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--color-bg);
	}

	/* ─── Sidebar ────────────────────────────────────────────────────────────── */

	.sidebar {
		width: 224px;
		flex-shrink: 0;
		border-right: 1px solid var(--color-border);
		background: #fafafa;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	.sidebar-top {
		padding: var(--space-4) var(--space-4) var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}

	.store-pill {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
	}

	.store-name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.store-name-muted {
		color: var(--color-muted);
		font-weight: 400;
		font-style: italic;
	}

	.store-currency {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		flex-shrink: 0;
	}

	.sidebar-nav {
		flex: 1;
		padding: var(--space-3) var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition: background var(--transition-fast), color var(--transition-fast);
		position: relative;
	}

	.nav-item:hover:not(:disabled) {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.nav-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.nav-item.active {
		background: rgba(37, 99, 235, 0.08);
		color: var(--color-primary);
	}

	.nav-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.nav-badge {
		margin-left: auto;
		background: var(--color-primary);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: var(--radius-full);
		line-height: 1.6;
	}

	.nav-badge.amber {
		background: var(--color-warning);
	}

	.nav-divider {
		height: 1px;
		background: var(--color-border);
		margin: var(--space-2) var(--space-3);
	}

	.sidebar-footer {
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.connection-pill {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.pubkey-label {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
	}

	/* ─── Main area ──────────────────────────────────────────────────────────── */

	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.main-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-6);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.page-title {
		font-size: var(--text-lg);
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.main-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-6);
	}

	/* ─── Stat cards ─────────────────────────────────────────────────────────── */

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.stat-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		border-left-width: 3px;
		border-left-color: var(--color-border);
	}

	.stat-card.accent-green {
		border-left-color: var(--color-success);
	}
	.stat-card.accent-blue {
		border-left-color: var(--color-primary);
	}
	.stat-card.accent-amber {
		border-left-color: var(--color-warning);
	}

	.stat-label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.stat-value {
		font-size: var(--text-2xl);
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--color-text);
		line-height: 1.1;
	}

	.stat-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	/* ─── Order table ────────────────────────────────────────────────────────── */

	.table-label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		margin-bottom: var(--space-3);
	}

	.order-table {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.order-table-head {
		display: grid;
		grid-template-columns: 160px 130px 120px 1fr 110px 90px 90px;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		background: #fafafa;
		border-bottom: 1px solid var(--color-border);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.order-table-selectable .order-table-head {
		grid-template-columns: 36px 160px 130px 120px 1fr 110px 90px 90px;
	}

	/* Overview tab uses fewer columns */
	.stat-grid + .table-label + .order-table .order-table-head {
		grid-template-columns: 160px 120px 110px 1fr 110px 90px;
	}
	.stat-grid + .table-label + .order-table .order-row {
		grid-template-columns: 160px 120px 110px 1fr 110px 90px;
	}

	.order-row {
		display: grid;
		grid-template-columns: 160px 130px 120px 1fr 110px 90px 90px;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: none;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		width: 100%;
		transition: background var(--transition-fast);
		align-items: center;
	}

	.order-table-selectable .order-row {
		grid-template-columns: 36px 160px 130px 120px 1fr 110px 90px 90px;
	}

	.col-check {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.row-check {
		width: 15px;
		height: 15px;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.order-row:last-child {
		border-bottom: none;
	}

	.order-row:hover {
		background: var(--color-bg-secondary);
	}

	.order-row.selected {
		background: rgba(37, 99, 235, 0.04);
	}

	.col-date {
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.col-id {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.paid-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-success);
		flex-shrink: 0;
	}

	.col-items {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text);
	}

	.col-amount {
		font-size: var(--text-xs);
		text-align: right;
	}

	.col-payment {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		text-transform: capitalize;
	}

	.col-store {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-store-unknown {
		font-family: var(--font-mono);
		color: var(--color-text-muted);
	}

	/* ─── Status badges ──────────────────────────────────────────────────────── */

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}

	.badge-gray {
		background: rgba(153, 153, 153, 0.12);
		color: #555;
	}
	.badge-blue {
		background: rgba(37, 99, 235, 0.1);
		color: var(--color-primary);
	}
	.badge-amber {
		background: rgba(245, 158, 11, 0.12);
		color: #b45309;
	}
	.badge-green {
		background: rgba(22, 163, 74, 0.1);
		color: var(--color-success);
	}
	.badge-red {
		background: rgba(220, 38, 38, 0.1);
		color: var(--color-error);
	}

	.sync-status {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 1.25rem;
		margin-bottom: var(--space-2);
	}

	.sync-note {
		font-size: var(--text-xs);
		color: var(--color-muted);
	}

	.sync-note-warn {
		font-size: var(--text-xs);
		color: var(--color-warning, #d97706);
	}

	.scan-menu {
		display: flex;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg);
		justify-content: flex-end;
		flex-shrink: 0;
	}

	.scan-menu .btn-outline.active {
		background: var(--color-text);
		color: var(--color-bg);
		border-color: var(--color-text);
	}

	.fetch-by-id-panel {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
		background: var(--color-bg);
	}

	.fetch-by-id-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}

	.fetch-by-id-title {
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.fetch-by-id-close {
		background: none;
		border: none;
		font-size: 1.25rem;
		color: var(--color-muted);
		cursor: pointer;
		padding: 0 var(--space-1);
		line-height: 1;
	}

	.fetch-by-id-close:hover {
		color: var(--color-text);
	}

	.fetch-by-id-hint {
		font-size: var(--text-xs);
		color: var(--color-muted);
		margin: 0 0 var(--space-3) 0;
	}

	.fetch-by-id-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		resize: vertical;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.fetch-by-id-input:focus {
		outline: none;
		border-color: var(--color-primary, #2563eb);
	}

	.fetch-by-id-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.fetch-by-id-result {
		font-size: var(--text-xs);
		color: var(--color-success, #16a34a);
	}

	.fetch-by-id-error {
		font-size: var(--text-xs);
		color: var(--color-error, #dc2626);
	}

	.id-filter-wrap {
		position: relative;
		display: flex;
		align-items: center;
		margin-left: auto;
	}

	.id-filter-input {
		padding: 4px var(--space-3);
		padding-right: var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		width: 220px;
		transition: border-color var(--transition-fast);
	}

	.id-filter-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.id-filter-clear {
		position: absolute;
		right: var(--space-2);
		background: none;
		border: none;
		color: var(--color-muted);
		cursor: pointer;
		font-size: var(--text-sm);
		line-height: 1;
		padding: 0 2px;
	}

	.id-filter-clear:hover {
		color: var(--color-text);
	}

	/* ─── Filter bar ─────────────────────────────────────────────────────────── */

	.filter-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.store-filter-select {
		padding: 5px var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.store-filter-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.filter-tabs {
		display: flex;
		gap: 2px;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 3px;
		width: fit-content;
	}

	.filter-tab {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: none;
		border-radius: 4px;
		background: transparent;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.filter-tab.active {
		background: var(--color-bg);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
	}

	.filter-count {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-weight: 400;
	}

	/* ─── Alerts ─────────────────────────────────────────────────────────────── */

	.alert {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		margin-bottom: var(--space-4);
		border: 1px solid transparent;
	}

	.alert-error {
		background: rgba(220, 38, 38, 0.06);
		border-color: rgba(220, 38, 38, 0.2);
		color: var(--color-error);
	}

	.orders-payment-warning {
		background: rgba(200, 16, 46, 0.06);
		border: 2px solid #c8102e;
		border-radius: var(--radius-sm);
		padding: var(--space-4) var(--space-5);
		margin-bottom: var(--space-5);
		color: #1a1a1a;
	}

	.orders-payment-warning-title {
		font-size: var(--text-lg);
		font-weight: 700;
		color: #c8102e;
		margin-bottom: var(--space-2);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.orders-payment-warning p {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.orders-payment-warning p:last-child {
		margin-bottom: 0;
	}

	.alert-info {
		background: rgba(37, 99, 235, 0.06);
		border-color: rgba(37, 99, 235, 0.15);
		color: var(--color-primary);
	}

	.alert-success {
		background: rgba(22, 163, 74, 0.06);
		border-color: rgba(22, 163, 74, 0.2);
		color: var(--color-success);
	}

	/* ─── Empty states ───────────────────────────────────────────────────────── */

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-4);
		text-align: center;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.empty-icon {
		color: var(--color-text-muted);
	}

	/* ─── Forms ──────────────────────────────────────────────────────────────── */

	.form-section {
		margin-bottom: var(--space-6);
	}

	.section-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--color-text-muted);
		margin-bottom: var(--space-3);
	}

	.section-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		color: inherit;
	}

	.section-toggle .section-label {
		margin-bottom: 0;
	}

	.section-toggle:hover .section-label {
		color: var(--color-text-secondary);
	}

	.section-desc {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin-bottom: var(--space-4);
	}

	.section-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-top: var(--space-2);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
	}

	.form-field label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.field-hint {
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.field-error {
		font-size: var(--text-xs);
		color: var(--color-error);
		margin-top: var(--space-1);
	}

	.field-success {
		font-size: var(--text-xs);
		color: var(--color-success, #16a34a);
		margin-top: var(--space-1);
	}

	.form-field input,
	.form-field textarea {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		background: var(--color-bg);
		color: var(--color-text);
		transition: border-color var(--transition-fast);
	}

	.form-field input:focus,
	.form-field textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-field textarea {
		resize: vertical;
		font-family: var(--font-mono);
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		margin-bottom: var(--space-3);
	}

	.form-actions {
		padding-top: var(--space-2);
	}

	/* ─── Inventory ──────────────────────────────────────────────────────────── */

	.inv-item {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.inv-item-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.inv-item-name {
		font-size: var(--text-sm);
		font-weight: 600;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.inv-item-controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.inv-expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
	}

	.inv-expand-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.stock-select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 600;
		background: var(--color-bg);
		cursor: pointer;
		flex-shrink: 0;
	}

	.stock-select.lvl-3 { color: var(--color-success); border-color: rgba(22, 163, 74, 0.3); }
	.stock-select.lvl-2 { color: var(--color-warning); border-color: rgba(245, 158, 11, 0.3); }
	.stock-select.lvl-1 { color: var(--color-error); border-color: rgba(220, 38, 38, 0.3); }
	.stock-select.lvl-0 { color: var(--color-text-muted); }

	.variant-list {
		margin-top: var(--space-2);
		padding-left: var(--space-4);
		border-left: 2px solid var(--color-border);
	}

	.variant-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-1) 0;
	}

	.variant-name {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	/* ─── Form field select ─────────────────────────────────────────────────── */

	.form-field select {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		background: var(--color-bg);
		color: var(--color-text);
		transition: border-color var(--transition-fast);
	}

	.form-field select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	/* ─── Manage Stores ──────────────────────────────────────────────────────── */

	.store-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.store-list-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
	}

	.store-list-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	.remove-confirm {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.remove-confirm-label {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.btn-danger {
		background: var(--color-error);
		color: #fff;
		border: none;
	}

	.btn-danger:hover {
		opacity: 0.85;
	}

	.store-list-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.store-list-name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.store-list-id {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.export-row {
		display: flex;
		gap: var(--space-2);
	}

	.decrypt-hint {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		padding: var(--space-2) var(--space-3);
		background: rgba(234, 179, 8, 0.08);
		border: 1px solid rgba(234, 179, 8, 0.25);
		border-radius: var(--radius-sm);
		margin-top: var(--space-2);
	}

	.decrypt-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
		align-items: center;
	}

	.decrypt-input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.decrypt-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.btn-ghost {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
	}

	.btn-ghost:hover {
		background: var(--color-border);
	}

	/* ─── Settings ───────────────────────────────────────────────────────────── */

	.cache-status-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.cache-on-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		background: rgba(22, 163, 74, 0.08);
		border: 1px solid rgba(22, 163, 74, 0.25);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-success);
	}

	.cache-subopts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.low-field-checks {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.cache-subopt {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		font-size: var(--text-sm);
	}

	.cache-subopt input[type='checkbox'] {
		flex-shrink: 0;
	}

	.cache-subopt-hint {
		color: var(--color-muted);
		font-size: var(--text-xs);
	}

	.relay-sync-details {
		margin-top: var(--space-3);
		font-size: var(--text-xs);
		color: var(--color-muted);
	}

	.relay-sync-details summary {
		cursor: pointer;
		user-select: none;
	}

	.relay-sync-table {
		width: 100%;
		margin-top: var(--space-2);
		border-collapse: collapse;
		font-size: var(--text-xs);
	}

	.relay-sync-table th {
		text-align: left;
		font-weight: 500;
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--color-border);
		color: var(--color-muted);
	}

	.relay-sync-table td {
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.relay-url {
		font-family: var(--font-mono, monospace);
	}

	/* ─── Verify tab ─────────────────────────────────────────────────────────── */

	.verify-label-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}

	.verify-label-row label:first-child {
		margin-bottom: 0;
	}

	.upload-receipt-btn {
		font-size: var(--text-xs);
		color: var(--color-primary);
		cursor: pointer;
		white-space: nowrap;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		transition: background var(--transition-fast);
	}

	.upload-receipt-btn:hover {
		background: var(--color-bg-secondary);
	}

	.upload-receipt-btn input[type='file'] {
		display: none;
	}

	.verify-result {
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		overflow: hidden;
	}

	.verify-result.ok {
		border-color: rgba(22, 163, 74, 0.25);
		background: rgba(22, 163, 74, 0.04);
	}

	.verify-result.fail {
		border-color: rgba(220, 38, 38, 0.25);
		background: rgba(220, 38, 38, 0.04);
	}

	.verify-result-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-sm);
		font-weight: 600;
		border-bottom: 1px solid inherit;
	}

	.verify-result.ok .verify-result-header {
		color: var(--color-success);
		border-bottom-color: rgba(22, 163, 74, 0.15);
	}

	.verify-result.fail .verify-result-header {
		color: var(--color-error);
		border-bottom-color: rgba(220, 38, 38, 0.15);
	}

	.verify-order-detail {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		margin-top: var(--space-3);
	}

	.verify-order-detail .panel-section {
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-4);
	}

	.verify-order-detail .panel-section:last-child {
		border-bottom: none;
	}

	.verify-guidance {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-3);
		line-height: 1.5;
	}

	.verify-action-section {
		background: var(--color-bg-secondary);
	}

	.verify-action {
		font-size: var(--text-sm);
		color: var(--color-text);
		line-height: 1.6;
		margin-bottom: var(--space-3);
	}

	.verify-action-caveat {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	/* ─── Buttons ────────────────────────────────────────────────────────────── */

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.btn-outline {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font-weight: 500;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-outline:hover:not(:disabled) {
		background: var(--color-bg-secondary);
		border-color: #ccc;
	}

	.btn-outline:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-sm {
		padding: 5px var(--space-3) !important;
		font-size: var(--text-xs) !important;
	}

	.btn-signout {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 5px var(--space-3);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-muted);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: all var(--transition-fast);
		margin-left: auto;
	}

	.btn-signout:hover {
		color: var(--color-text);
		border-color: var(--color-border);
		background: var(--color-bg-secondary);
	}

	.btn-confirm {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 5px var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: rgba(22, 163, 74, 0.1);
		color: var(--color-success);
		font-weight: 600;
		font-size: var(--text-xs);
		cursor: pointer;
		border: 1px solid rgba(22, 163, 74, 0.25);
		transition: all var(--transition-fast);
	}

	.btn-confirm:hover {
		background: rgba(22, 163, 74, 0.18);
	}

	.btn-hide {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 5px var(--space-3);
		border-radius: var(--radius-sm);
		background: rgba(220, 38, 38, 0.08);
		color: var(--color-error, #dc2626);
		font-weight: 600;
		font-size: var(--text-xs);
		cursor: pointer;
		border: 1px solid rgba(220, 38, 38, 0.22);
		transition: all var(--transition-fast);
	}

	.btn-hide:hover {
		background: rgba(220, 38, 38, 0.16);
	}

	.btn-hide-selected {
		margin-left: auto;
	}

	.btn-unhide {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 5px var(--space-3);
		border-radius: var(--radius-sm);
		background: rgba(100, 116, 139, 0.08);
		color: var(--color-muted);
		font-weight: 600;
		font-size: var(--text-xs);
		cursor: pointer;
		border: 1px solid rgba(100, 116, 139, 0.22);
		transition: all var(--transition-fast);
	}

	.btn-unhide:hover {
		background: rgba(100, 116, 139, 0.15);
	}

	.btn-sm-inline {
		padding: 3px var(--space-2);
	}

	.order-row-hidden {
		display: grid;
		grid-template-columns: 160px 130px 120px 1fr 110px 90px 90px;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--color-border);
		align-items: center;
		font-size: var(--text-sm);
		opacity: 0.65;
	}

	.order-row-hidden:last-child {
		border-bottom: none;
	}

	.nav-badge.muted {
		background: var(--color-border);
		color: var(--color-muted);
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.icon-btn:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	/* ─── Order detail panel ─────────────────────────────────────────────────── */

	.panel-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
		z-index: 90;
		cursor: default;
	}

	.order-panel {
		position: fixed;
		top: 0;
		right: 0;
		width: 480px;
		height: 100vh;
		background: var(--color-bg);
		border-left: 1px solid var(--color-border);
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
		z-index: 100;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: slideIn 220ms ease;
	}

	@keyframes slideIn {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.panel-header-left {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.panel-title {
		font-size: var(--text-base);
		font-weight: 700;
	}

	.panel-oid {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
	}

	.panel-section {
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--color-border);
	}

	.panel-section:last-child {
		border-bottom: none;
	}

	.panel-section-title {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--color-text-muted);
		margin-bottom: var(--space-3);
	}

	.panel-controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.status-select {
		padding: 5px var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 600;
		background: var(--color-bg);
		cursor: pointer;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
	}

	.meta-key {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-muted);
		padding-top: 1px;
	}

	.meta-val {
		color: var(--color-text);
		word-break: break-word;
	}

	/* Panel items */
	.panel-item-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-1) 0;
		font-size: var(--text-sm);
	}

	.pi-name {
		flex: 1;
	}

	.pi-variant {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-left: var(--space-1);
	}

	.pi-qty {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.pi-price {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.panel-totals {
		margin-top: var(--space-3);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-2);
	}

	.totals-row {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		padding: 3px 0;
		color: var(--color-text-secondary);
	}

	.totals-row.total-final {
		font-weight: 700;
		color: var(--color-text);
		border-top: 1px solid var(--color-border);
		margin-top: var(--space-1);
		padding-top: var(--space-2);
	}

	/* Verification panel */
	.verify-loading {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		padding: var(--space-2) 0;
	}

	.verify-checks {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.check-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.check-row.pass {
		background: rgba(22, 163, 74, 0.06);
	}

	.check-row.fail {
		background: rgba(220, 38, 38, 0.06);
	}

	.check-mark {
		font-size: var(--text-sm);
		font-weight: 700;
		flex-shrink: 0;
		width: 16px;
	}

	.check-row.pass .check-mark { color: var(--color-success); }
	.check-row.fail .check-mark { color: var(--color-error); }

	.check-body {
		flex: 1;
		color: var(--color-text-secondary);
	}

	.check-mismatch {
		font-size: var(--text-xs);
		color: var(--color-error);
		margin-left: var(--space-2);
	}

	.check-divider {
		height: 1px;
		background: var(--color-border);
		margin: var(--space-2) 0;
	}

	.rate-row {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-xs);
		padding: 3px 0;
	}

	.rate-label {
		color: var(--color-text-muted);
	}

	.payment-confirmed-note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: rgba(22, 163, 74, 0.08);
		border: 1px solid rgba(22, 163, 74, 0.2);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-success);
	}

	.payment-pending-note {
		margin-top: var(--space-2);
		padding: var(--space-3);
		background: rgba(37, 99, 235, 0.05);
		border: 1px solid rgba(37, 99, 235, 0.15);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.panel-json-row {
		padding: var(--space-3) var(--space-5) var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	/* Notes */
	.notes-ta {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		resize: vertical;
		background: var(--color-bg);
		color: var(--color-text);
		transition: border-color var(--transition-fast);
	}

	.notes-ta:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.notes-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-top: var(--space-2);
	}

	/* ─── Reconciliation modal ───────────────────────────────────────────────── */

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 110;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 520px;
		max-width: calc(100vw - 2rem);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 120;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		font-size: var(--text-base);
		font-weight: 700;
	}

	.modal-body {
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.reconcile-ta {
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		resize: vertical;
		background: var(--color-bg);
		color: var(--color-text);
		line-height: 1.6;
	}

	.reconcile-ta:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.reconcile-msg {
		font-size: var(--text-sm);
		color: var(--color-success);
		font-weight: 500;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	/* ─── Spinners ───────────────────────────────────────────────────────────── */

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.spinner-sm {
		display: inline-block;
		width: 12px;
		height: 12px;
		border: 1.5px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ─── Mono ───────────────────────────────────────────────────────────────── */

	.mono {
		font-family: var(--font-mono);
	}

	/* ─── Mobile nav toggle & drawer ─────────────────────────────────────────── */

	.nav-menu-toggle {
		display: none;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text);
		cursor: pointer;
		transition: background var(--transition-fast), border-color var(--transition-fast);
	}

	.nav-menu-toggle:hover {
		background: var(--color-bg-secondary);
		border-color: var(--color-border);
	}

	.sidebar-backdrop {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		z-index: 40;
	}

	@media (max-width: 768px) {
		.nav-menu-toggle {
			display: inline-flex;
		}

		.manage-nav {
			gap: var(--space-3);
			padding: var(--space-3) var(--space-4);
		}

		.manage-nav .nav-link {
			display: none;
		}

		.btn-signout {
			padding: 5px;
			width: 32px;
			height: 32px;
			justify-content: center;
			gap: 0;
		}

		.btn-signout .btn-label {
			display: none;
		}

		.sidebar {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			width: min(280px, 82vw);
			z-index: 50;
			transform: translateX(-100%);
			transition: transform var(--transition-fast);
			box-shadow: 4px 0 16px rgba(0, 0, 0, 0.08);
		}

		.sidebar.is-open {
			transform: translateX(0);
		}

		.sidebar-backdrop {
			display: block;
		}

		.main-content {
			padding: var(--space-4);
		}

		.main-header {
			flex-direction: column;
			align-items: stretch;
			gap: var(--space-3);
			padding: var(--space-3) var(--space-4);
		}

		.header-actions {
			flex-wrap: wrap;
			width: 100%;
		}

		.icon-action {
			padding: 5px !important;
			width: 32px;
			height: 32px;
			justify-content: center;
			gap: 0;
		}

		.icon-action.with-label {
			width: auto;
			height: auto;
			padding: 5px var(--space-3) !important;
			gap: var(--space-2);
		}

		.icon-action .btn-label {
			display: none;
		}

		.icon-action.with-label .btn-label {
			display: inline;
		}

		.scan-menu {
			padding: var(--space-3) var(--space-4);
			justify-content: stretch;
		}

		.scan-menu .scan-btn {
			flex: 1;
			min-width: 0;
			justify-content: center;
			padding-left: var(--space-2) !important;
			padding-right: var(--space-2) !important;
		}

		.stat-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: var(--space-3);
		}

		.filter-bar {
			flex-wrap: wrap;
		}

		.id-filter-wrap {
			margin-left: 0;
			flex-basis: 100%;
			width: 100%;
		}

		.id-filter-input {
			width: 100%;
		}

		.order-panel {
			width: 100vw;
			max-width: 100vw;
			border-left: none;
			box-shadow: none;
		}

		.panel-header {
			padding: var(--space-3) var(--space-4);
		}

		.panel-section {
			padding: var(--space-3) var(--space-4);
		}

		.panel-controls {
			flex-wrap: wrap;
			gap: var(--space-2);
		}

		.status-select {
			flex-basis: 100%;
			width: 100%;
		}

		.meta-grid {
			grid-template-columns: 96px 1fr;
		}
	}

	@media (max-width: 480px) {
		.stat-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

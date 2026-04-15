import type { RateResult } from '$lib/renderer/payment/exchange-rate.js';

// ─── Two-tier cache (in-memory + sessionStorage) ─────────────────────────────
// In-memory: fastest, cleared on page reload
// sessionStorage: survives page refresh within the same tab session

const SESSION_PREFIX = 'nw-hist-rate:';
const memCache = new Map<string, RateResult>();

function cacheKey(currency: string, timestamp: number): string {
	return `${currency.toUpperCase()}:${timestamp}`;
}

function readSession(key: string): RateResult | null {
	try {
		const raw = sessionStorage.getItem(SESSION_PREFIX + key);
		return raw ? (JSON.parse(raw) as RateResult) : null;
	} catch {
		return null;
	}
}

function writeSession(key: string, rate: RateResult): void {
	try {
		sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(rate));
	} catch {
		// sessionStorage unavailable — ignore
	}
}

/** Seed the cache from a previously-persisted localStorage record (called on cache restore). */
export function primeHistoricalRateCache(
	rates: Record<string, { satsPerUnit: number; source: string }>
): void {
	for (const [key, rate] of Object.entries(rates)) {
		if (!memCache.has(key)) {
			memCache.set(key, rate);
			writeSession(key, rate);
		}
	}
}

/** Dump the current in-memory cache for localStorage persistence. */
export function exportHistoricalRateCache(): Record<string, { satsPerUnit: number; source: string }> {
	const out: Record<string, { satsPerUnit: number; source: string }> = {};
	for (const [key, rate] of memCache) out[key] = rate;
	return out;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchKrakenHistorical(currency: string, timestamp: number): Promise<number | null> {
	try {
		const pair = `XBT${currency.toUpperCase()}`;
		const since = timestamp - 60;
		const res = await fetch(
			`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1&since=${since}`
		);
		if (!res.ok) return null;
		const data = await res.json();
		if (data.error?.length) return null;

		// Find the array value in result (pair name varies, e.g. XBTUSD vs XXBTZUSD)
		const pairData = Object.values(data.result ?? {}).find(Array.isArray) as
			| unknown[][]
			| undefined;
		if (!pairData?.length) return null;

		// Candle format: [time, open, high, low, close, vwap, volume, count]
		// Find the candle whose start time is <= our timestamp
		let bestCandle = pairData[0];
		for (const candle of pairData) {
			if (Number(candle[0]) <= timestamp) {
				bestCandle = candle;
			} else {
				break;
			}
		}

		const closePrice = parseFloat(String(bestCandle[4]));
		if (!closePrice) return null;
		return Math.round((100_000_000 / closePrice) * 100) / 100;
	} catch {
		return null;
	}
}

async function fetchCoingeckoHistorical(currency: string, timestamp: number): Promise<number | null> {
	try {
		const date = new Date(timestamp * 1000);
		const dd = String(date.getUTCDate()).padStart(2, '0');
		const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
		const yyyy = date.getUTCFullYear();
		const res = await fetch(
			`https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${dd}-${mm}-${yyyy}&localization=false`
		);
		if (!res.ok) return null;
		const data = await res.json();
		const pricePerBtc = data?.market_data?.current_price?.[currency.toLowerCase()];
		if (!pricePerBtc) return null;
		return Math.round((100_000_000 / pricePerBtc) * 100) / 100;
	} catch {
		return null;
	}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getHistoricalRate(currency: string, timestamp: number): Promise<RateResult> {
	if (currency.toUpperCase() === 'SAT' || currency.toUpperCase() === 'SATS') {
		return { satsPerUnit: 1, source: 'native' };
	}
	if (currency.toUpperCase() === 'BTC') {
		return { satsPerUnit: 100_000_000, source: 'native' };
	}

	const key = cacheKey(currency, timestamp);

	// 1. In-memory (fastest)
	const mem = memCache.get(key);
	if (mem) return mem;

	// 2. sessionStorage (survives page refresh)
	const session = readSession(key);
	if (session) {
		memCache.set(key, session);
		return session;
	}

	// 3. Network fetch
	const [krakenResult, coingeckoResult] = await Promise.allSettled([
		fetchKrakenHistorical(currency, timestamp),
		fetchCoingeckoHistorical(currency, timestamp)
	]);

	const rates: number[] = [];
	const sources: string[] = [];

	if (krakenResult.status === 'fulfilled' && krakenResult.value !== null) {
		rates.push(krakenResult.value);
		sources.push('kraken');
	}
	if (coingeckoResult.status === 'fulfilled' && coingeckoResult.value !== null) {
		rates.push(coingeckoResult.value);
		sources.push('coingecko');
	}

	if (rates.length === 0) {
		throw new Error('Failed to fetch historical exchange rate from any source');
	}

	const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
	const result: RateResult = {
		satsPerUnit: Math.round(avg * 100) / 100,
		source: sources.join('+')
	};

	memCache.set(key, result);
	writeSession(key, result);

	return result;
}

export interface RateResult {
	satsPerUnit: number;
	source: string;
}

async function fetchCoingecko(currency: string): Promise<number | null> {
	try {
		const res = await fetch(
			`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`
		);
		if (!res.ok) return null;
		const data = await res.json();
		const pricePerBtc = data?.bitcoin?.[currency.toLowerCase()];
		if (!pricePerBtc) return null;
		return Math.round((100_000_000 / pricePerBtc) * 100) / 100; // sats per unit
	} catch {
		return null;
	}
}

async function fetchYadio(currency: string): Promise<number | null> {
	try {
		const res = await fetch(`https://api.yadio.io/exrates/${currency.toUpperCase()}`);
		if (!res.ok) return null;
		const data = await res.json();
		const pricePerBtc = data?.[currency.toUpperCase()]?.price;
		if (!pricePerBtc) return null;
		return Math.round((100_000_000 / pricePerBtc) * 100) / 100;
	} catch {
		return null;
	}
}

async function fetchKraken(currency: string): Promise<number | null> {
	try {
		const pair = `XBT${currency.toUpperCase()}`;
		const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
		if (!res.ok) return null;
		const data = await res.json();
		const result = Object.values(data?.result ?? {})[0] as { c?: [string] } | undefined;
		const price = result?.c?.[0];
		if (!price) return null;
		return Math.round((100_000_000 / parseFloat(price)) * 100) / 100;
	} catch {
		return null;
	}
}

export async function getExchangeRate(currency: string): Promise<RateResult> {
	if (currency.toUpperCase() === 'SAT' || currency.toUpperCase() === 'SATS') {
		return { satsPerUnit: 1, source: 'native' };
	}

	if (currency.toUpperCase() === 'BTC') {
		return { satsPerUnit: 100_000_000, source: 'native' };
	}

	const results = await Promise.allSettled([
		fetchCoingecko(currency),
		fetchYadio(currency),
		fetchKraken(currency)
	]);

	const rates: number[] = [];
	const sources: string[] = [];

	if (results[0].status === 'fulfilled' && results[0].value) {
		rates.push(results[0].value);
		sources.push('coingecko');
	}
	if (results[1].status === 'fulfilled' && results[1].value) {
		rates.push(results[1].value);
		sources.push('yadio');
	}
	if (results[2].status === 'fulfilled' && results[2].value) {
		rates.push(results[2].value);
		sources.push('kraken');
	}

	if (rates.length === 0) {
		throw new Error('Failed to fetch exchange rate from any source');
	}

	// Average the rates
	const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
	return {
		satsPerUnit: Math.round(avg * 100) / 100,
		source: sources.join('+')
	};
}

export function fiatToSats(amount: number, satsPerUnit: number): number {
	return Math.round(amount * satsPerUnit);
}

export interface FiatConversionResult {
	convertedAmount: number;
	fromRate: RateResult;
	toRate: RateResult;
}

export async function convertFiat(
	amount: number,
	fromCurrency: string,
	toCurrency: string
): Promise<FiatConversionResult> {
	if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
		const rate = await getExchangeRate(fromCurrency);
		return { convertedAmount: amount, fromRate: rate, toRate: rate };
	}

	const [fromRate, toRate] = await Promise.all([
		getExchangeRate(fromCurrency),
		getExchangeRate(toCurrency)
	]);

	const convertedAmount =
		Math.round(((amount * fromRate.satsPerUnit) / toRate.satsPerUnit) * 100) / 100;

	return { convertedAmount, fromRate, toRate };
}

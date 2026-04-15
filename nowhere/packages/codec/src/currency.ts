const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatCurrency(amount: number, currencyCode: string = 'USD'): string {
	const code = currencyCode.toUpperCase();

	if (code === 'SAT' || code === 'SATS') {
		return `${amount.toLocaleString()} sats`;
	}

	const hasDecimals = amount % 1 !== 0;
	const cacheKey = `${code}:${hasDecimals ? 2 : 0}`;
	let formatter = formatterCache.get(cacheKey);
	if (!formatter) {
		try {
			formatter = new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: code,
				minimumFractionDigits: hasDecimals ? 2 : 0,
				maximumFractionDigits: 2
			});
		} catch {
			return `${amount} ${code}`;
		}
		formatterCache.set(cacheKey, formatter);
	}

	return formatter.format(amount);
}

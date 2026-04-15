export interface LnurlPayParams {
	callback: string;
	minSendable: number; // millisats
	maxSendable: number; // millisats
	metadata: string;
	tag: string;
}

export interface LnInvoice {
	pr: string; // payment request (bolt11 invoice)
	routes: unknown[];
}

export async function resolveLightningAddress(address: string): Promise<LnurlPayParams> {
	const [name, domain] = address.split('@');
	if (!name || !domain) {
		throw new Error('Invalid lightning address format');
	}

	const url = `https://${domain}/.well-known/lnurlp/${name}`;

	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		throw new Error(
			"Unable to reach the seller's payment provider. Please contact the seller to complete your purchase."
		);
	}

	if (!res.ok) {
		throw new Error(
			"The seller's payment service returned an error. Please contact the seller to complete your purchase."
		);
	}

	const data = await res.json();
	if (data.status === 'ERROR') {
		throw new Error(data.reason || 'LNURL error');
	}

	return data as LnurlPayParams;
}

export async function fetchInvoice(
	callback: string,
	amountMsats: number,
	comment?: string
): Promise<string> {
	const url = new URL(callback);
	url.searchParams.set('amount', amountMsats.toString());
	if (comment) {
		url.searchParams.set('comment', comment);
	}

	let res: Response;
	try {
		res = await fetch(url.toString());
	} catch {
		throw new Error(
			"Unable to reach the seller's payment provider. Please contact the seller to complete your purchase."
		);
	}

	if (!res.ok) {
		throw new Error(
			"The seller's payment service returned an error. Please contact the seller to complete your purchase."
		);
	}

	const data: LnInvoice = await res.json();
	if (!data.pr) {
		throw new Error('No payment request in response');
	}

	return data.pr;
}

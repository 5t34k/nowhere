// Custom payment method definitions for tag '5'
// Format: "*CUR:Name:address,*!CUR:Name:address"
// * prefix = custom method marker
// ! = optional QR flag
// CUR = 3-letter currency code
// Name = service display name
// address = seller handle/email/account ID
// Colons in values escaped as \o, commas as \c

export interface CustomPaymentMethod {
	label: string;
	currency: string;
	address: string;
	showQr: boolean;
}

function escapeField(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/,/g, '\\c').replace(/:/g, '\\o');
}

function unescapeField(s: string): string {
	return s.replace(/\\o/g, ':').replace(/\\c/g, ',').replace(/\\\\/g, '\\');
}

/** Split on unescaped commas */
function splitEntries(raw: string): string[] {
	const entries: string[] = [];
	let current = '';
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === '\\' && i + 1 < raw.length) {
			current += raw[i] + raw[i + 1];
			i++;
		} else if (raw[i] === ',') {
			entries.push(current);
			current = '';
		} else {
			current += raw[i];
		}
	}
	if (current) entries.push(current);
	return entries;
}

/** Split on unescaped colons (max 3 parts: currency, name, address) */
function splitColons(entry: string): string[] {
	const parts: string[] = [];
	let current = '';
	for (let i = 0; i < entry.length; i++) {
		if (entry[i] === '\\' && i + 1 < entry.length) {
			current += entry[i] + entry[i + 1];
			i++;
		} else if (entry[i] === ':' && parts.length < 2) {
			parts.push(current);
			current = '';
		} else {
			current += entry[i];
		}
	}
	parts.push(current);
	return parts;
}

export function parseCustomPayments(raw: string): CustomPaymentMethod[] {
	if (!raw) return [];
	return splitEntries(raw)
		.filter(Boolean)
		.map((entry) => {
			if (!entry.startsWith('*')) return null;
			let rest = entry.slice(1);
			const showQr = rest.startsWith('!');
			if (showQr) rest = rest.slice(1);
			const parts = splitColons(rest);
			if (parts.length < 2) return null;
			return {
				label: unescapeField(parts[1] ?? ''),
				currency: unescapeField(parts[0] ?? '').toUpperCase(),
				address: unescapeField(parts[2] ?? ''),
				showQr
			};
		})
		.filter((m): m is CustomPaymentMethod => m !== null);
}

export function serializeCustomPayments(methods: CustomPaymentMethod[]): string {
	return methods
		.map((m) => {
			const qr = m.showQr ? '!' : '';
			return '*' + qr + escapeField(m.currency) + ':' + escapeField(m.label) + ':' + escapeField(m.address);
		})
		.join(',');
}

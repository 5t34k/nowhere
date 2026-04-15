// Tip method definitions for tag 'l'
// Format: "lightning@addr.com,*PayPal:user@email.com,*!Bitcoin:bc1q..."
// First entry (no prefix): lightning address (backward compatible)
// *Name:handle entries: custom tip methods
// *!Name:handle entries: custom tip methods with QR display

export interface TipMethod {
	type: 'lightning' | 'custom';
	label: string; // "Lightning" or custom name like "PayPal"
	value: string; // address or handle
	showQr?: boolean; // show QR code for this method's value
}

export function parseTipMethods(raw: string): TipMethod[] {
	if (!raw) return [];
	return raw
		.split(',')
		.filter(Boolean)
		.map((entry) => {
			if (entry.startsWith('*')) {
				const rest = entry.slice(1);
				const showQr = rest.startsWith('!');
				const body = showQr ? rest.slice(1) : rest;
				const colonIdx = body.indexOf(':');
				if (colonIdx >= 0) {
					return {
						type: 'custom' as const,
						label: body.slice(0, colonIdx),
						value: body.slice(colonIdx + 1),
						showQr
					};
				}
				return { type: 'custom' as const, label: body, value: '', showQr };
			}
			return { type: 'lightning' as const, label: 'Lightning', value: entry };
		});
}

export function serializeTipMethods(methods: TipMethod[]): string {
	return methods
		.map((m) => {
			if (m.type === 'custom') {
				return '*' + (m.showQr ? '!' : '') + (m.label || '') + ':' + m.value;
			}
			return m.value;
		})
		.join(',');
}

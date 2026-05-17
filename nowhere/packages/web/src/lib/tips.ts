// Tip method definitions for tag 'l'
// Format: "lightning@addr.com,*PayPal:user@email.com,*!Bitcoin:bc1q..."
// First entry (no prefix): lightning address (backward compatible)
// *Name:handle entries: custom tip methods
// *!Name:handle entries: custom tip methods with QR display
// ',' separates entries and ':' separates a custom method's name from its
// value; those (and '\' itself) are backslash-escaped inside field values so
// user-typed delimiters can't corrupt the structure.

export interface TipMethod {
	type: 'lightning' | 'custom';
	label: string; // "Lightning" or custom name like "PayPal"
	value: string; // address or handle
	showQr?: boolean; // show QR code for this method's value
}

function escapeField(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/:/g, '\\:');
}

function unescapeField(s: string): string {
	return s.replace(/\\([\s\S])/g, '$1');
}

// Index of the first unescaped occurrence of `delim`, or -1.
function indexOfUnescaped(s: string, delim: string): number {
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '\\') { i++; continue; }
		if (s[i] === delim) return i;
	}
	return -1;
}

// Split on unescaped `delim`, keeping escape sequences intact within each part.
function splitUnescaped(s: string, delim: string): string[] {
	const parts: string[] = [];
	let cur = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '\\' && i + 1 < s.length) {
			cur += ch + s[i + 1];
			i++;
		} else if (ch === delim) {
			parts.push(cur);
			cur = '';
		} else {
			cur += ch;
		}
	}
	parts.push(cur);
	return parts;
}

export function parseTipMethods(raw: string): TipMethod[] {
	if (!raw) return [];
	return splitUnescaped(raw, ',')
		.filter(Boolean)
		.map((entry) => {
			if (entry.startsWith('*')) {
				const rest = entry.slice(1);
				const showQr = rest.startsWith('!');
				const body = showQr ? rest.slice(1) : rest;
				const colonIdx = indexOfUnescaped(body, ':');
				if (colonIdx >= 0) {
					return {
						type: 'custom' as const,
						label: unescapeField(body.slice(0, colonIdx)),
						value: unescapeField(body.slice(colonIdx + 1)),
						showQr
					};
				}
				return { type: 'custom' as const, label: unescapeField(body), value: '', showQr };
			}
			return { type: 'lightning' as const, label: 'Lightning', value: unescapeField(entry) };
		});
}

export function serializeTipMethods(methods: TipMethod[]): string {
	return methods
		.map((m) => {
			if (m.type === 'custom') {
				return '*' + (m.showQr ? '!' : '') + escapeField(m.label || '') + ':' + escapeField(m.value);
			}
			return escapeField(m.value);
		})
		.join(',');
}

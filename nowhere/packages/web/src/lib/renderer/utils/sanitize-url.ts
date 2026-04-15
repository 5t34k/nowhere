const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

/** Validate a URL for use in href attributes. Rejects javascript:, data:, etc. */
export function sanitizeUrl(url: string): string {
	if (!url) return '';
	const trimmed = url.trim();
	if (!trimmed) return '';
	try {
		const parsed = new URL(trimmed);
		return SAFE_PROTOCOLS.has(parsed.protocol) ? trimmed : '';
	} catch {
		// Relative URLs (starting with / # ?) are safe — no protocol to abuse
		if (trimmed[0] === '/' || trimmed[0] === '#' || trimmed[0] === '?') return trimmed;
		return '';
	}
}

const IMAGE_PROTOCOLS = new Set(['https:', 'http:']);

/** Validate a URL for use in img src attributes. Allows data:image/* but rejects data:text/html. */
export function sanitizeImageUrl(url: string): string {
	if (!url) return '';
	const trimmed = url.trim();
	if (!trimmed) return '';
	// Allow data:image/* (inline images) but nothing else under data:
	if (trimmed.startsWith('data:image/')) return trimmed;
	try {
		const parsed = new URL(trimmed);
		return IMAGE_PROTOCOLS.has(parsed.protocol) ? trimmed : '';
	} catch {
		return '';
	}
}

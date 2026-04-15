import DOMPurify, { type Config } from 'dompurify';

let hooksInstalled = false;

function installHooks() {
	if (hooksInstalled) return;
	hooksInstalled = true;

	// Strip ALL event handler attributes (on*) — covers current and future DOM events
	DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
		if (/^on/i.test(data.attrName)) {
			data.keepAttr = false;
		}
	});

	// Strip @import and url() from inline <style> tags to prevent CSS-based data exfiltration
	DOMPurify.addHook('uponSanitizeElement', (node, data) => {
		if (data.tagName === 'style') {
			const text = node.textContent || '';
			if (/@import|url\s*\(/i.test(text)) {
				node.textContent = '';
			}
		}
	});

	// Strip external url() from style attributes — preserve local references like url(#gradientId)
	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		const style = node.getAttribute('style');
		if (style && /url\s*\(/i.test(style)) {
			node.setAttribute(
				'style',
				style.replace(/url\s*\(\s*(?!['"]?#)(["']?).*?\1\s*\)/gi, '')
			);
		}
	});
}

const PURIFY_CONFIG: Config = {
	USE_PROFILES: { svg: true, svgFilters: true },
	FORBID_TAGS: [
		'script', 'foreignObject',
		'use',            // loads external SVG references
		'image',          // loads external raster images (tracking pixels)
		'feImage',        // loads external resources in filters
		'animate',        // can animate href to change link targets
		'set',            // can set attributes including href
		'animateTransform'
	],
	FORBID_ATTR: [
		'xlink:href',     // legacy external resource loading
		'formaction',     // form hijacking
		'ping'            // tracking
	],
	WHOLE_DOCUMENT: false,
	RETURN_DOM: false
} as const;

export function sanitizeSvg(svg: string): string {
	if (typeof window === 'undefined') return '';
	installHooks();
	return DOMPurify.sanitize(svg, PURIFY_CONFIG);
}

/** For CSS background-image: returns `url("data:image/svg+xml,...")` */
export function svgToBackgroundUrl(svg: string): string {
	const safe = sanitizeSvg(svg);
	if (!safe) return '';
	return `url("data:image/svg+xml,${encodeURIComponent(safe)}")`;
}

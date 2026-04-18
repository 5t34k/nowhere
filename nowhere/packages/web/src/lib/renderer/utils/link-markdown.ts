const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const LINK_RE = /\[([^\]\n]+?)\]\(([^\s)]+)\)/g;
const SAFE_URL_RE = /^(https?:|mailto:)/i;

/** Render `[text](url)` as anchor tags; HTML-escape everything else. */
export function renderLinksOnly(raw: string): string {
	if (!raw) return '';
	let out = '';
	let last = 0;
	for (const m of raw.matchAll(LINK_RE)) {
		const [full, label, url] = m;
		const idx = m.index ?? 0;
		out += escapeHtml(raw.slice(last, idx));
		if (SAFE_URL_RE.test(url)) {
			out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(label)}</a>`;
		} else {
			out += escapeHtml(full);
		}
		last = idx + full.length;
	}
	out += escapeHtml(raw.slice(last));
	return out;
}

/** Replace `[text](url)` with just the label; HTML-escape everything else. For print poster. */
export function stripLinks(raw: string): string {
	if (!raw) return '';
	let out = '';
	let last = 0;
	for (const m of raw.matchAll(LINK_RE)) {
		const [full, label, url] = m;
		const idx = m.index ?? 0;
		out += escapeHtml(raw.slice(last, idx));
		out += SAFE_URL_RE.test(url) ? escapeHtml(label) : escapeHtml(full);
		last = idx + full.length;
	}
	out += escapeHtml(raw.slice(last));
	return out;
}

export type LinkToken =
	| { type: 'text'; value: string }
	| { type: 'link'; value: string; href: string };

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}'"»”’>]+$/;
// Bidi controls (U+202A–U+202E, U+2066–U+2069), LRM/RLM (U+200E/F),
// zero-width chars (U+200B–U+200D, U+FEFF), and raw C0/C1 controls.
// Any URL containing these is rejected — legitimate URLs never need them.
const UNSAFE_INVISIBLE = /[‪-‮⁦-⁩​-‍‎‏﻿\x00-\x1F\x7F-\x9F]/;

export function tokenizeLinks(text: string): LinkToken[] {
	if (!text) return [];
	const tokens: LinkToken[] = [];
	let lastIndex = 0;
	URL_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = URL_RE.exec(text)) !== null) {
		let raw = m[0];
		let end = m.index + raw.length;
		const trail = raw.match(TRAILING_PUNCT);
		if (trail) {
			raw = raw.slice(0, raw.length - trail[0].length);
			end -= trail[0].length;
		}
		if (!raw) continue;
		if (UNSAFE_INVISIBLE.test(raw)) continue;
		let href: string | null = null;
		try {
			const u = new URL(raw);
			if (u.protocol === 'https:' || u.protocol === 'http:') href = u.href;
		} catch {}
		if (!href) continue;
		if (m.index > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, m.index) });
		tokens.push({ type: 'link', value: raw, href });
		lastIndex = end;
	}
	if (lastIndex < text.length) tokens.push({ type: 'text', value: text.slice(lastIndex) });
	return tokens;
}

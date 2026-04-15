import DOMPurify, { type Config } from 'dompurify';
import { Marked } from 'marked';

const marked = new Marked({ breaks: true, gfm: true });
marked.use({ renderer: { html: () => '' } });

const MARKDOWN_PURIFY_CONFIG: Config = {
	ALLOWED_TAGS: [
		'p', 'br', 'strong', 'em', 'b', 'i', 'a',
		'ul', 'ol', 'li',
		'code', 'pre', 'blockquote',
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'hr', 'img', 'del', 's',
		'table', 'thead', 'tbody', 'tr', 'th', 'td',
		'sup', 'sub'
	],
	ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
	ALLOW_DATA_ATTR: false,
	ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
};

/** Render markdown to sanitised HTML safe for {@html} */
export function renderMarkdown(raw: string): string {
	if (!raw) return '';
	if (typeof window === 'undefined') return '';
	const html = marked.parse(raw) as string;
	return DOMPurify.sanitize(html, MARKDOWN_PURIFY_CONFIG);
}

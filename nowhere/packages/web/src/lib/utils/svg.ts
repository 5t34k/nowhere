export const SVG_SIZE_WARN = 4000;

export function minifySvg(raw: string): string {
	return raw
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<\?xml[^>]*\?>/g, '')
		.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
		.replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, '')
		.replace(/>\s+</g, '><')
		.trim();
}

export function isSvgString(v: string): boolean {
	return v.trimStart().startsWith('<');
}

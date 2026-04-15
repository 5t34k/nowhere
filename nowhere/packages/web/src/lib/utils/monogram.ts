export type MonogramShape = 'circle' | 'rounded' | 'square';
export type MonogramFont = 'sans-serif' | 'serif' | 'monospace';

function shortHex(hex: string): string {
	const h = hex.replace('#', '').toLowerCase();
	if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) return '#' + h[0] + h[2] + h[4];
	return '#' + h;
}

function compactNum(n: number): string {
	return String(n).replace(/^0\./, '.');
}

export function generateMonogram(
	letters: string,
	bgColor: string,
	shape: MonogramShape,
	font: MonogramFont,
	textCol: string,
	fontSize: number
): string {
	const safe = letters.slice(0, 4).toUpperCase();
	const fill = shortHex(bgColor);
	const tc = shortHex(textCol);
	const fs = compactNum(fontSize);

	const bg =
		shape === 'circle'
			? `<circle cx=".5" cy=".5" r=".5" fill="${fill}"/>`
			: shape === 'rounded'
			? `<rect width="1" height="1" rx=".15" fill="${fill}"/>`
			: `<rect width="1" height="1" fill="${fill}"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${bg}<text x=".5" y=".5" dy=".35em" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${fs}" fill="${tc}">${safe}</text></svg>`;
}

export function nameToInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '';
	if (words.length === 1) return words[0][0].toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

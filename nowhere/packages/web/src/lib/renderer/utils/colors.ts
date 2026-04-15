// Deterministic color from string (for no-image product cards)
export function hashToHue(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}
	return Math.abs(hash) % 360;
}

export function nameToColor(name: string): string {
	const hue = hashToHue(name);
	return `hsl(${hue}, 45%, 85%)`;
}

export function nameToTextColor(name: string): string {
	const hue = hashToHue(name);
	return `hsl(${hue}, 50%, 35%)`;
}

import type { Tag } from '@nowhere/codec';

/** Validate that a value is a string, returning fallback if not. */
function str(v: unknown, fallback = ''): string {
	return typeof v === 'string' ? v : fallback;
}

/** Validate that a value is an array of tags with string key/value pairs. */
function tags(v: unknown): Tag[] {
	if (!Array.isArray(v)) return [];
	return v.filter(
		(t): t is Tag =>
			t !== null &&
			typeof t === 'object' &&
			typeof t.key === 'string' &&
			(t.value === undefined || typeof t.value === 'string')
	);
}

/** Validate common builder state fields. Returns null if the parsed value is not an object. */
export function validateBaseState(parsed: unknown): {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	tags: Tag[];
} | null {
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const o = parsed as Record<string, unknown>;
	return {
		pubkey: str(o.pubkey),
		name: str(o.name),
		description: str(o.description),
		image: str(o.image),
		tags: tags(o.tags)
	};
}

/** Validate art builder state (has svg instead of image/description). */
export function validateArtState(parsed: unknown): {
	pubkey: string;
	name: string;
	svg: string;
	tags: Tag[];
} | null {
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const o = parsed as Record<string, unknown>;
	return {
		pubkey: str(o.pubkey),
		name: str(o.name),
		svg: str(o.svg),
		tags: tags(o.tags)
	};
}

/** Validate drop builder state (no image field). */
export function validateDropState(parsed: unknown): {
	pubkey: string;
	name: string;
	description: string;
	tags: Tag[];
} | null {
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const o = parsed as Record<string, unknown>;
	return {
		pubkey: str(o.pubkey),
		name: str(o.name),
		description: str(o.description),
		tags: tags(o.tags)
	};
}

export { str, tags };

// Bumped to 2 on 2026-04-10 when the dictionary was rebuilt.
// Version 1 fragments will fail to decode (V1_DEPRECATED) and the renderer
// shows a "beta period" message instead of attempting to display them.
export const CURRENT_VERSION = 2;

export type SiteType = 'store' | 'event' | 'message' | 'fundraiser' | 'petition' | 'discussion' | 'drop' | 'art';

export const SITE_TYPE_PREFIXES: Record<SiteType, string> = {
	store: 's',
	event: 'e',
	message: 'm',
	fundraiser: 'f',
	petition: 'p',
	discussion: 'd',
	drop: 'o',
	art: 'a'
};

export const PREFIX_TO_SITE_TYPE: Record<string, SiteType> = Object.fromEntries(
	Object.entries(SITE_TYPE_PREFIXES).map(([type, prefix]) => [prefix, type as SiteType])
) as Record<string, SiteType>;

export function prefixVersion(data: string, siteType: SiteType = 'store'): string {
	return `${SITE_TYPE_PREFIXES[siteType]}${CURRENT_VERSION}${data}`;
}

export function extractVersion(encoded: string): { siteType: SiteType; version: number; data: string } {
	const prefix = encoded[0];
	const siteType = PREFIX_TO_SITE_TYPE[prefix];
	if (!siteType) {
		throw new Error(`Unknown site type prefix: ${prefix}`);
	}
	const version = parseInt(encoded[1], 10);
	if (isNaN(version)) {
		throw new Error('Invalid version number');
	}
	const data = encoded.slice(2);
	return { siteType, version, data };
}

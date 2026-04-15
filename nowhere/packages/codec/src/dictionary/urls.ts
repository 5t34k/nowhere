// URL pattern dictionary
// Maps common URL prefixes, schemes, and suffixes to short codes
// APPEND-ONLY: once assigned, a code NEVER changes
export const URL_PREFIXES: [string, string][] = [
	['https://i.imgur.com/', 'I'],
	['https://imgur.com/', 'J'],
	['https://nostr.build/', 'N'],
	['https://image.nostr.build/', 'O'],
	['https://void.cat/', 'V'],
	['https://files.catbox.moe/', 'C'],
	['https://pbs.twimg.com/', 'T'],
	['https://cdn.shopify.com/', 'S'],
	['https://m.media-amazon.com/', 'A'],
	['https://images.unsplash.com/', 'U'],
	['https://cdn.etsy.com/', 'E'],
	['https://i.ebayimg.com/', 'B'],
	['https://primal.b-cdn.net/', 'P'],
	['https://blossom.primal.net/', 'b'],
	['https://cdn.azzamo.net/', 'a'],
	['https://images2.imgbox.com/', 'x'],
	['https://i.nostr.build/', 'n'],
	['https://video.nostr.build/', 'v'],
	['https://cdn.nostrcheck.me/', 'c'],
	['https://nostr.download/', 'd'],
	['https://nostr-files.aads.com/', 'f'],
	['https://i.4cdn.org/', '4'],
	['https://files.mastodon.social/', 'm'],
	['https://preview.redd.it/', 'r'],
	['https://i.redd.it/', 'R'],
	['https://res.cloudinary.com/', 'L'],
	['https://share.yabu.me/', 'y'],
	['https://media1.giphy.com/', 'g'],
	['https://media.tenor.com/', 't'],
	['https://images.pexels.com/', 'p'],
	['https://i0.wp.com/', 'w'],
	['https://media.snort.social/', 'D'],
	['https://nostrimg.com/', 'M'],
	['https://cdn.satellite.earth/', 'Q'],
	['https://blossom.oxtr.dev/', 'W'],
	['https://i.ibb.co/', 'X'],
	['https://postimg.cc/', 'Y'],
	['https://i.pinimg.com/', 'Z'],
	['https://cdn.discordapp.com/', 'e'],
	['https://lh3.googleusercontent.com/', 'h'],
	['https://upload.wikimedia.org/', 'i'],
	['https://blossom.', 'j'],
	['@walletofsatoshi.com', 'k'],
	// Common image file extensions
	['.jpeg', 'F'],
	['.webp', 'G'],
	['.jpg', 'H'],
	['.png', 'K']
];

const prefixToCode = new Map<string, string>();
const codeToPrefix = new Map<string, string>();

for (const [prefix, code] of URL_PREFIXES) {
	prefixToCode.set(prefix, code);
	codeToPrefix.set(code, prefix);
}

// Sort by length descending for longest-match-first
const sortedPrefixes = [...prefixToCode.entries()].sort((a, b) => b[0].length - a[0].length);

export { prefixToCode, codeToPrefix, sortedPrefixes };

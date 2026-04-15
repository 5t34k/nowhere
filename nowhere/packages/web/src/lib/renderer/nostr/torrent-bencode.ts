// Custom bencode parser — no external library
// Bencode spec: integers i<n>e, strings <len>:<data>, lists l...e, dicts d...e

const dec = new TextDecoder('utf-8', { fatal: false });

type BValue = string | number | BValue[] | { [key: string]: BValue };

/** Parse a bencoded value at the given offset. Returns [value, endOffset]. */
function parse(b: Uint8Array, pos: number): [BValue, number] {
	const c = b[pos];

	// Integer: i<n>e
	if (c === 0x69) {
		let end = pos + 1;
		while (b[end] !== 0x65) end++; // scan to 'e'
		return [Number(dec.decode(b.subarray(pos + 1, end))), end + 1];
	}

	// List: l...e
	if (c === 0x6c) {
		const arr: BValue[] = [];
		pos++;
		while (b[pos] !== 0x65) {
			const [v, p] = parse(b, pos);
			arr.push(v);
			pos = p;
		}
		return [arr, pos + 1];
	}

	// Dict: d...e
	if (c === 0x64) {
		const dict: { [key: string]: BValue } = {};
		pos++;
		while (b[pos] !== 0x65) {
			const [k, kEnd] = parse(b, pos);
			const [v, vEnd] = parse(b, kEnd);
			dict[k as string] = v;
			pos = vEnd;
		}
		return [dict, pos + 1];
	}

	// Byte string: <len>:<data>
	let colon = pos;
	while (b[colon] !== 0x3a) colon++; // scan to ':'
	const len = Number(dec.decode(b.subarray(pos, colon)));
	const start = colon + 1;
	return [dec.decode(b.subarray(start, start + len)), start + len];
}

/**
 * Scan the root dict for the 'info' key and return its raw bencoded bytes.
 * Uses the same position arithmetic as parse() — correct even when piece hash
 * strings contain arbitrary binary bytes (length prefix is still accurate).
 */
function extractInfoBytes(b: Uint8Array): Uint8Array {
	if (b[0] !== 0x64) throw new Error('torrent: root is not a dict');
	let pos = 1;
	while (pos < b.length && b[pos] !== 0x65) {
		const [k, kEnd] = parse(b, pos);
		const vStart = kEnd;
		const [, vEnd] = parse(b, vStart);
		if (k === 'info') return b.subarray(vStart, vEnd);
		pos = vEnd;
	}
	throw new Error('torrent: info dict not found');
}

/** Join a bencode path array (list of strings) into a POSIX path string. */
function joinPath(parts: BValue[]): string {
	return (parts as string[]).join('/');
}

export interface ParsedTorrent {
	infohash: string;
	title: string;
	files: { path: string; size: number }[];
	trackers: string[];
}

/**
 * Parse a .torrent file and extract the data needed to build a TorrentData record.
 * Handles both single-file and multi-file torrents.
 * File list is capped at 100 entries; any remainder is aggregated into a single entry.
 */
export async function parseTorrentFile(bytes: Uint8Array): Promise<ParsedTorrent> {
	const [root] = parse(bytes, 0);
	const torrent = root as { [key: string]: BValue };
	const info = torrent['info'] as { [key: string]: BValue } | undefined;
	if (!info) throw new Error('torrent: missing info dict');

	// Infohash = SHA1 of raw bencoded info dict bytes (via WebCrypto)
	const infoBytes = extractInfoBytes(bytes);
	const hashBuf = await crypto.subtle.digest('SHA-1', infoBytes as BufferSource);
	const infohash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

	// Title
	const title = typeof info['name'] === 'string' ? info['name'] : 'Unknown';

	// Files
	const MAX_FILES = 100;
	let files: { path: string; size: number }[] = [];

	if (Array.isArray(info['files'])) {
		// Multi-file torrent
		for (const f of info['files'] as Array<{ [key: string]: BValue }>) {
			const pathParts = Array.isArray(f['path']) ? f['path'] : [];
			files.push({
				path: joinPath(pathParts),
				size: typeof f['length'] === 'number' ? f['length'] : 0
			});
		}
	} else {
		// Single-file torrent
		files = [{
			path: title,
			size: typeof info['length'] === 'number' ? info['length'] : 0
		}];
	}

	if (files.length > MAX_FILES) {
		const kept = files.slice(0, MAX_FILES);
		const rest = files.slice(MAX_FILES);
		const restSize = rest.reduce((s, f) => s + f.size, 0);
		kept.push({ path: `+ ${rest.length} more files`, size: restSize });
		files = kept;
	}

	// Trackers — deduplicated flat list from announce + announce-list
	const seen = new Set<string>();
	const trackers: string[] = [];

	function addTracker(t: unknown) {
		if (typeof t === 'string' && t && !seen.has(t)) {
			seen.add(t);
			trackers.push(t);
		}
	}

	addTracker(torrent['announce']);

	if (Array.isArray(torrent['announce-list'])) {
		for (const tier of torrent['announce-list'] as BValue[][]) {
			if (Array.isArray(tier)) {
				for (const tr of tier) addTracker(tr);
			}
		}
	}

	return { infohash, title, files, trackers };
}

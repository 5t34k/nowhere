<script lang="ts">
	import type { EncodeResult } from '@nowhere/codec';
	import { substitute, sortedWords, sortedPrefixes, wordToTier2, codeToWordA, codeToWordB, codeToWordC, codeToPhrase } from '@nowhere/codec';
	import HintIcon from './HintIcon.svelte';
	import { RENDERER_ORIGIN } from '$lib/config.js';

	interface Props {
		serializedText: string | null;
		encodedResult: EncodeResult | null;
		label?: string;
	}

	let { serializedText, encodedResult, label = 'store' }: Props = $props();

	type MatchType = 'word' | 'url' | 'phrase';
	type Segment = {
		text: string;
		match: { tooltip: string; type: MatchType } | null;
	};

	const BASE_URL = `${RENDERER_ORIGIN}/s#`;

	// Reverse lookup maps for Stage 2 highlighting
	const codeToWordMap = new Map(sortedWords.map(([w, c]) => [c, w]));
	const codeToPrefixMap = new Map(sortedPrefixes.map(([p, c]) => [c, p]));

	// Tier 2 words sorted by length descending for stage 1 highlighting
	const tier2WordsSorted = [...wordToTier2.entries()]
		.filter(([word]) => !codeToWordMap.has(word)) // skip words already in Tier 1
		.sort((a, b) => b[0].length - a[0].length);

	// Expand phrase codes (\x02 + 2-char code) back to full phrase text.
	// serialize() bakes in phrase compression, but Stage 1 should show the
	// uncompressed text so users can see what the phrases look like before compression.
	function expandPhrases(text: string): string {
		let result = '';
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '\x02' && i + 2 < text.length) {
				const code = text.slice(i + 1, i + 3);
				const phrase = codeToPhrase.get(code);
				if (phrase) {
					result += phrase;
					i += 2;
					continue;
				}
			}
			result += text[i];
		}
		return result;
	}

	const pipeline = $derived.by(() => {
		if (!serializedText || !encodedResult) return null;
		try {
			const serialized = serializedText;
			const substituted = substitute(serialized);
			const expanded = expandPhrases(serialized);

			// Use encodeURIComponent to measure true URL cost — stages 1 & 2 contain
			// spaces, pipes, carets, backticks, \x01 etc. that would each become %XX (3 chars)
			// Stage 3 (base64url) is already 100% URL-safe, so its length is the true cost
			const stage1Len = encodeURIComponent(expanded).length + 2;
			const stage2Len = encodeURIComponent(substituted).length + 2;
			const stage3Len = encodedResult.length;

			const dictSavings = stage1Len - stage2Len;
			const lzSavings = stage2Len - stage3Len;
			const totalSavings = stage1Len - stage3Len;
			const reductionPct = Math.round((1 - stage3Len / stage1Len) * 100);

			return {
				serialized: expanded,
				substituted,
				fragment: encodedResult.fragment,
				stage1Len,
				stage2Len,
				stage3Len,
				dictSavings,
				lzSavings,
				totalSavings,
				reductionPct
			};
		} catch {
			return null;
		}
	});

	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Stage 1: highlight dictionary matches in the raw serialized text
	function highlightText(text: string): Segment[] {
		if (!text) return [];

		const matches: {
			start: number;
			end: number;
			text: string;
			code: string;
			saved: number;
			type: MatchType;
		}[] = [];

		// Match expanded phrase text (phrases were expanded from \x02 codes for display).
		// Search longest-first so overlapping phrases don't cause partial matches.
		const phraseEntries = [...codeToPhrase.entries()].sort((a, b) => b[1].length - a[1].length);
		for (const [code, phrase] of phraseEntries) {
			let pos = 0;
			while ((pos = text.indexOf(phrase, pos)) !== -1) {
				const codeStr = `\x02${code}`;
				matches.push({
					start: pos,
					end: pos + phrase.length,
					text: phrase,
					code: codeStr,
					saved: phrase.length - codeStr.length,
					type: 'phrase'
				});
				pos += phrase.length;
			}
		}

		for (const [prefix, code] of sortedPrefixes) {
			let pos = 0;
			while ((pos = text.indexOf(prefix, pos)) !== -1) {
				const codeStr = `~U${code}`;
				matches.push({
					start: pos,
					end: pos + prefix.length,
					text: prefix,
					code: codeStr,
					saved: prefix.length - codeStr.length,
					type: 'url'
				});
				pos += prefix.length;
			}
		}

		for (const [word, code] of sortedWords) {
			const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
			let m;
			while ((m = pattern.exec(text)) !== null) {
				const codeStr = `~${code}`;
				// Implicit space: +1 saved if followed by space, -1 cost if not (needs \x01 marker)
				const afterEnd = m.index + m[0].length;
				const hasSpaceAfter = afterEnd < text.length && text[afterEnd] === ' ';
				matches.push({
					start: m.index,
					end: m.index + m[0].length,
					text: m[0],
					code: codeStr,
					saved: m[0].length - codeStr.length + (hasSpaceAfter ? 1 : -1),
					type: 'word'
				});
			}
		}

		for (const [word, { sentinel, code }] of tier2WordsSorted) {
			const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
			let m;
			while ((m = pattern.exec(text)) !== null) {
				const codeStr = `${sentinel}${code}`;
				const afterEnd = m.index + m[0].length;
				const hasSpaceAfter = afterEnd < text.length && text[afterEnd] === ' ';
				matches.push({
					start: m.index,
					end: m.index + m[0].length,
					text: m[0],
					code: codeStr,
					saved: m[0].length - codeStr.length + (hasSpaceAfter ? 1 : -1),
					type: 'word'
				});
			}
		}

		matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

		const filtered: typeof matches = [];
		let lastEnd = 0;
		for (const match of matches) {
			if (match.start >= lastEnd) {
				filtered.push(match);
				lastEnd = match.end;
			}
		}

		const segments: Segment[] = [];
		let pos = 0;
		for (const match of filtered) {
			if (match.start > pos) {
				segments.push({ text: text.slice(pos, match.start), match: null });
			}
			const tooltip = match.saved > 0
				? `"${match.text}" -> ${match.code} (saves ${match.saved} chars)`
				: `"${match.text}" -> ${match.code}`;
			segments.push({
				text: match.text,
				match: { tooltip, type: match.type }
			});
			pos = match.end;
		}
		if (pos < text.length) {
			segments.push({ text: text.slice(pos), match: null });
		}

		return segments;
	}

	// Stage 2: highlight substitution codes in the dictionary-substituted text
	function highlightCodes(text: string): Segment[] {
		if (!text) return [];

		const segments: Segment[] = [];
		let i = 0;
		const sentinels = new Set(['~', '`', '|', '^']);
		const tier2Sentinels: Record<string, Map<string, string>> = {
			'`': codeToWordA,
			'|': codeToWordB,
			'^': codeToWordC
		};

		while (i < text.length) {
			// Skip no-space markers (not displayed)
			if (text[i] === '\x01') {
				i++;
				continue;
			}

			const ch = text[i];

			// Phrase codes: \x02 + 2-char code
			if (ch === '\x02') {
				if (i + 2 < text.length) {
					const code = text.slice(i + 1, i + 3);
					const phrase = codeToPhrase.get(code);
					if (phrase) {
						const fullCode = `\x02${code}`;
						const saved = phrase.length - fullCode.length;
						const tooltip = `Preset phrase (saved ${saved} chars):\n"${phrase.slice(0, 80)}${phrase.length > 80 ? '…' : ''}"`;
						// Display as 3 visible chars to match the actual 3-byte encoding (\x02 + 2-char code).
					// Using ² as a visible stand-in for the non-printable \x02 control character.
					// Previously displayed as [phrase:XX] which was 10 chars, making it look like
					// phrases inflated the text when they actually save significant space.
					segments.push({ text: `²${code}`, match: { tooltip, type: 'phrase' } });
						i += 3;
						continue;
					}
				}
				i++;
				continue;
			}

			if (ch === '~') {
				if (i + 1 < text.length && text[i + 1] === '~') {
					segments.push({ text: '~~', match: null });
					i += 2;
					continue;
				}

				const start = i;
				i++; // skip sentinel

				let capitalize = false;
				if (i < text.length && text[i] === '!') {
					capitalize = true;
					i++;
				}

				if (i >= text.length) {
					segments.push({ text: text.slice(start), match: null });
					break;
				}

				const marker = text[i];
				i++;

				if (marker === 'U') {
					if (i >= text.length) {
						segments.push({ text: text.slice(start), match: null });
						break;
					}
					const code = text[i];
					i++;
					const fullCode = text.slice(start, i);
					const prefix = codeToPrefixMap.get(code);
					if (prefix) {
						const saved = prefix.length - fullCode.length;
						const tooltip = saved > 0
							? `${fullCode} = ${prefix} (saved ${saved} chars)`
							: `${fullCode} = ${prefix}`;
						segments.push({ text: fullCode, match: { tooltip, type: 'url' } });
					} else {
						segments.push({ text: fullCode, match: null });
					}
				} else {
					// Tier 1 word: marker IS the 1-char code
					const fullCode = text.slice(start, i);
					let word = codeToWordMap.get(marker);
					if (word) {
						if (capitalize) word = word[0].toUpperCase() + word.slice(1);
						// \x01 after code = no space (costs 1 marker char), otherwise implicit space (saves 1)
					const hasNoSpaceMarker = i < text.length && text[i] === '\x01';
					const saved = word.length - fullCode.length + (hasNoSpaceMarker ? -1 : 1);
					const tooltip = saved > 0
						? `${fullCode} = ${word} (saved ${saved} chars)`
						: `${fullCode} = ${word}`;
					segments.push({ text: fullCode, match: { tooltip, type: 'word' } });
				} else {
					segments.push({ text: fullCode, match: null });
				}
				}
			} else if (ch in tier2Sentinels) {
				if (i + 1 < text.length && text[i + 1] === ch) {
					// Escaped sentinel
					segments.push({ text: ch + ch, match: null });
					i += 2;
					continue;
				}

				const start = i;
				const map = tier2Sentinels[ch];
				i++; // skip sentinel

				let capitalize = false;
				if (i < text.length && text[i] === '!') {
					capitalize = true;
					i++;
				}

				if (i + 1 >= text.length) {
					segments.push({ text: text.slice(start), match: null });
					break;
				}

				const code = text.slice(i, i + 2);
				i += 2;
				const fullCode = text.slice(start, i);
				let word = map.get(code);
				if (word) {
					if (capitalize) word = word[0].toUpperCase() + word.slice(1);
					const hasNoSpaceMarker = i < text.length && text[i] === '\x01';
					const saved = word.length - fullCode.length + (hasNoSpaceMarker ? -1 : 1);
					const tooltip = saved > 0
						? `${fullCode} = ${word} (saved ${saved} chars)`
						: `${fullCode} = ${word}`;
					segments.push({ text: fullCode, match: { tooltip, type: 'word' } });
				} else {
					segments.push({ text: fullCode, match: null });
				}
			} else {
				const start = i;
				while (i < text.length && !sentinels.has(text[i]) && text[i] !== '\x02') {
					i++;
				}
				segments.push({ text: text.slice(start, i), match: null });
			}
		}

		return segments;
	}
</script>

{#snippet segmented(segments: Segment[])}
{#each segments as seg}{#if seg.match}<mark
	class="highlight highlight-{seg.match.type}"
	title={seg.match.tooltip}
>{seg.text}</mark>{:else}{seg.text}{/if}{/each}
{/snippet}

<div class="panel">
	<h3>Text Compression</h3>
	<p class="overview">Your {label} data is compressed in three stages to produce the shortest possible URL. Char counts reflect the true URL-encoded cost at each stage.</p>

	{#if !encodedResult || !pipeline}
		<div class="not-ready">
			<p>Add {label} data to see compression analysis.</p>
		</div>
	{:else}
		<div class="stats-section">
			<div class="headline">URL reduced by {pipeline.reductionPct}%</div>

			<div class="compression-bar">
				<div
					class="bar-segment bar-dict"
					style="flex-grow: {Math.max(0, pipeline.dictSavings)}"
					title="Dictionary reduction: -{pipeline.dictSavings} chars"
				></div>
				<div
					class="bar-segment bar-lz"
					style="flex-grow: {Math.max(0, pipeline.lzSavings)}"
					title="Deflate compression: {pipeline.lzSavings >= 0 ? `-${pipeline.lzSavings}` : `+${-pipeline.lzSavings} overhead`}"
				></div>
				<div
					class="bar-segment bar-final"
					style="flex-grow: {pipeline.stage3Len}"
					title="Final URL: {pipeline.stage3Len} chars"
				></div>
			</div>

			<div class="bar-labels">
				{#if pipeline.dictSavings > 0}
					<span class="bar-label"><span class="dot dot-dict"></span> Dictionary reduction -{pipeline.dictSavings}</span>
				{/if}
				<span class="bar-label">
					<span class="dot dot-lz"></span>
					{#if pipeline.lzSavings > 0}
						Deflate compression -{pipeline.lzSavings}
					{:else if pipeline.lzSavings < 0}
						Deflate compression +{-pipeline.lzSavings} overhead
					{:else}
						Deflate compression 0
					{/if}
				</span>
				<span class="bar-label"><span class="dot dot-final"></span> Final URL {pipeline.stage3Len} chars</span>
			</div>
		</div>

		<div class="legend">
			<span class="legend-item"><span class="legend-swatch legend-word"></span> Words</span>
			<span class="legend-item"><span class="legend-swatch legend-url"></span> URL prefixes</span>
			<span class="legend-item"><span class="legend-swatch legend-phrase"></span> Phrases</span>
		</div>

		<div class="stage">
			<div class="stage-header">
				<span class="stage-title">1. Serialized <HintIcon tip="Data is converted into a compact text format using field separators. Highlighted words and URLs show what the next stage will compress." /></span>
				<span class="stage-stats">{pipeline.stage1Len} chars</span>
			</div>
			<div class="stage-content"><span class="base-url">{BASE_URL}</span>v2{@render segmented(highlightText(pipeline.serialized))}</div>
		</div>

		<div class="stage">
			<div class="stage-header">
				<span class="stage-title">2. After Dictionary <HintIcon tip="Common words and URL prefixes are replaced with short codes. Hover highlighted codes to see what they represent." /></span>
				<span class="stage-stats">
					{pipeline.stage2Len} chars
					{#if pipeline.dictSavings > 0}
						<span class="savings">(-{pipeline.dictSavings} this step)</span>
					{:else if pipeline.dictSavings < 0}
						<span class="overhead">(+{-pipeline.dictSavings} overhead)</span>
					{/if}
				</span>
			</div>
			<div class="stage-content"><span class="base-url">{BASE_URL}</span>v1{@render segmented(highlightCodes(pipeline.substituted))}</div>
		</div>

		<div class="stage">
			<div class="stage-header">
				<span class="stage-title">3. Deflate + Base64 <HintIcon tip="The text is compressed using DEFLATE (pako) and encoded as URL-safe Base64. This is the final URL fragment. Every character is URL-safe, so no percent-encoding overhead." /></span>
				<span class="stage-stats">
					{pipeline.stage3Len} chars
					{#if pipeline.lzSavings >= 0}
						<span class="savings">(-{pipeline.lzSavings} this step, -{pipeline.totalSavings} total)</span>
					{:else}
						<span class="overhead">(+{-pipeline.lzSavings} overhead, {pipeline.totalSavings > 0 ? `-${pipeline.totalSavings}` : `+${-pipeline.totalSavings}`} total)</span>
					{/if}
				</span>
			</div>
			<div class="stage-content"><span class="base-url">{BASE_URL}</span>{pipeline.fragment}</div>
		</div>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.overview {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.not-ready {
		padding: var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
	}

	/* Stats section */
	.stats-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.headline {
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.compression-bar {
		display: flex;
		height: 24px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		gap: 1px;
	}

	.bar-segment {
		min-width: 4px;
	}

	.bar-dict {
		background: rgba(245, 158, 11, 0.6);
	}
	.bar-lz {
		background: rgba(37, 99, 235, 0.5);
	}
	.bar-final {
		background: rgba(22, 163, 74, 0.5);
	}

	.bar-labels {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.bar-label {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot-dict {
		background: rgba(245, 158, 11, 0.6);
	}
	.dot-lz {
		background: rgba(37, 99, 235, 0.5);
	}
	.dot-final {
		background: rgba(22, 163, 74, 0.5);
	}

	/* Legend */
	.legend {
		display: flex;
		gap: var(--space-3);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.legend-swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	.legend-word {
		background: rgba(245, 158, 11, 0.25);
	}
	.legend-url {
		background: rgba(37, 99, 235, 0.2);
	}
	.legend-phrase {
		background: rgba(147, 51, 234, 0.25);
	}

	/* Pipeline stages */
	.stage {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
	}

	.stage-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-2);
	}

	.stage-title {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.stage-stats {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		text-align: right;
	}

	.savings {
		color: rgba(22, 163, 74, 0.9);
	}

	.overhead {
		color: rgba(239, 68, 68, 0.9);
	}

	.stage-content {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.6;
		word-break: break-all;
		max-height: 200px;
		overflow-y: auto;
	}

	.base-url {
		color: var(--color-text-muted);
	}

	/* Highlights */
	.highlight {
		background: none;
		color: inherit;
		border-radius: 2px;
		padding: 0 2px;
		cursor: help;
	}

	.highlight-word {
		background: rgba(245, 158, 11, 0.25);
	}
	.highlight-url {
		background: rgba(37, 99, 235, 0.2);
	}
	.highlight-phrase {
		background: rgba(147, 51, 234, 0.25);
	}
</style>

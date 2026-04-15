<script lang="ts">
	import { onMount } from 'svelte';
	import {
		encode,
		encodeEvent,
		encodeMessage,
		encodeFundraiser,
		encodePetition,
		encodeForum,
		encodeDrop,
		encodeArt,
		base64urlToBytes,
		type EncodeResult
	} from '@nowhere/codec';
	import { RENDERER_ORIGIN } from '$lib/config.js';

	const PLACEHOLDER_PUBKEY = 'A'.repeat(43);

	let siteType = $state('');
	let siteDataRaw: Record<string, any> = $state({});
	let encodeResult = $state<EncodeResult | null>(null);
	let parseError = $state('');
	let isReady = $state(false);
	let copied = $state(false);

	const nowUrl = $derived(encodeResult ? `${RENDERER_ORIGIN}/s#${encodeResult.fragment}` : '');

	const displayType = $derived(siteType === 'discussion' ? 'forum' : siteType);

	const builderRoute = $derived.by(() => {
		const routeMap: Record<string, string> = {
			store: 'store',
			event: 'event',
			message: 'message',
			fundraiser: 'fundraiser',
			petition: 'petition',
			discussion: 'forum',
			drop: 'drop',
			art: 'art'
		};
		const route = routeMap[siteType] ?? siteType;
		return encodeResult ? `/create/${route}#${encodeResult.fragment}` : `/create/${route}`;
	});

	const canCopyUrl = $derived(siteType !== 'store' && siteType !== 'petition');

	const verifySummary = $derived(encodeResult ? buildVerifySummary(siteType, siteDataRaw) : []);

	function runEncode(type: string, data: any): EncodeResult {
		switch (type) {
			case 'store':      return encode(data);
			case 'event':      return encodeEvent(data);
			case 'message':    return encodeMessage(data);
			case 'fundraiser': return encodeFundraiser(data);
			case 'petition':   return encodePetition(data);
			case 'discussion': return encodeForum(data);
			case 'drop':       return encodeDrop(data);
			case 'art':        return encodeArt(data);
			default:
				throw new Error(
					`Unknown site type: "${type}". Valid types: store, event, message, fundraiser, petition, discussion, drop, art`
				);
		}
	}

	function buildVerifySummary(type: string, data: any) {
		const tags: { key: string; value?: string }[] = data.tags ?? [];
		const getTag = (k: string) => tags.find((t) => t.key === k)?.value;
		const hasTag = (k: string) => tags.some((t) => t.key === k);
		const rows: { label: string; value: string }[] = [];

		rows.push({ label: 'type', value: type });
		rows.push({ label: 'name', value: data.name ?? '(none)' });

		if (data.pubkey) {
			const isP = data.pubkey === PLACEHOLDER_PUBKEY;
			rows.push({ label: 'pubkey', value: isP ? 'placeholder — not set' : data.pubkey.slice(0, 8) + '…' });
		}

		if (type === 'store') {
			rows.push({ label: 'currency', value: getTag('$') ?? '(none)' });
			rows.push({ label: 'items', value: String((data.items ?? []).length) });
			const fields: string[] = [];
			for (const [k, l] of [
				['E', 'email req'], ['e', 'email opt'],
				['N', 'name req'],  ['n', 'name opt'],
				['A', 'address req'], ['a', 'address opt'],
				['P', 'phone req'],  ['p', 'phone opt'],
				['Z', 'npub req'],   ['z', 'npub opt']
			] as [string, string][]) {
				if (hasTag(k)) fields.push(l);
			}
			if (fields.length) rows.push({ label: 'checkout', value: fields.join(', ') });
		} else if (type === 'message') {
			const title = getTag('t');
			if (title) rows.push({ label: 'title', value: title });
		} else if (type === 'fundraiser') {
			const cur = getTag('$') ?? '(none)';
			const goal = getTag('g');
			rows.push({ label: 'currency', value: cur });
			if (goal) rows.push({ label: 'goal', value: `${(parseInt(goal) / 100).toFixed(2)} ${cur}` });
		} else if (type === 'petition') {
			const goal = getTag('g');
			if (goal) rows.push({ label: 'signature goal', value: goal });
			const deadline = getTag('h');
			if (deadline) rows.push({ label: 'deadline', value: deadline });
		} else if (type === 'discussion') {
			const iMode = getTag('i');
			const modes: Record<string, string> = { '0': 'anonymous', '1': 'pseudonymous', '2': 'Nostr required' };
			if (iMode !== undefined) rows.push({ label: 'identity', value: modes[iMode!] ?? iMode! });
			const topicsRaw = getTag('O');
			if (topicsRaw) rows.push({ label: 'topics', value: String(topicsRaw.split('|').length) });
		} else if (type === 'event') {
			const startDt = getTag('D');
			if (startDt) rows.push({ label: 'start', value: startDt });
			const venue = getTag('L');
			if (venue) rows.push({ label: 'venue', value: venue });
			const preset = getTag('T');
			const presets: Record<string, string> = { g: 'generic', u: 'underground', d: 'declaration', w: 'warm', r: 'refined', m: 'monumental', b: 'broadcast' };
			if (preset) rows.push({ label: 'preset', value: presets[preset] ?? preset });
		} else if (type === 'drop') {
			const bodyLen = data.description ? String(data.description.length) + ' chars' : '(empty)';
			rows.push({ label: 'body', value: bodyLen });
		} else if (type === 'art') {
			const theme = getTag('T');
			const themes: Record<string, string> = { g: 'gallery', b: 'bleed', r: 'border', s: 'stamp', d: 'dark room', w: 'broadside', m: 'manifesto', p: 'paste-up' };
			if (theme) rows.push({ label: 'theme', value: themes[theme] ?? theme });
			const attr = getTag('A');
			if (attr) rows.push({ label: 'attribution', value: attr });
		}

		if (tags.length) rows.push({ label: 'all tags', value: tags.map((t) => t.key).join(', ') });
		return rows;
	}

	async function copyUrl() {
		if (!nowUrl) return;
		try {
			await navigator.clipboard.writeText(nowUrl);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = nowUrl;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	onMount(() => {
		const hash = window.location.hash.slice(1);
		if (!hash) {
			isReady = true;
			document.body.setAttribute('data-ready', 'true');
			return;
		}

		try {
			const jsonBytes = base64urlToBytes(hash);
			const jsonStr = new TextDecoder().decode(jsonBytes);
			const payload = JSON.parse(jsonStr);

			if (!payload || typeof payload.type !== 'string' || !payload.data) {
				throw new Error('Payload must have "type" (string) and "data" (object) fields');
			}

			siteType = payload.type;
			siteDataRaw = payload.data;
			encodeResult = runEncode(payload.type, payload.data);
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Failed to decode input';
		}

		isReady = true;
		document.body.setAttribute('data-ready', 'true');
	});
</script>

<div class="c-shell">
	<main class="c-stage">

		<header class="c-brand">
			<a href="https://hostednowhere.com" class="c-logo">nowhere</a>
			<span class="c-brand-sep"></span>
		</header>

		{#if !isReady}
			<div class="c-block">
				<p class="c-loading">Loading&hellip;</p>
			</div>

		{:else if !encodeResult && !parseError}
			<div class="c-block">
				<p class="c-type-label">URL Generator</p>
				<h1 class="c-headline">No input provided</h1>
				<p class="c-body">
					Navigate here with a base64url-encoded JSON payload as the URL fragment.
				</p>
				<pre class="c-pre">https://nowhr.xyz/c#&lt;base64url(JSON)&gt;</pre>
				<p class="c-body">The JSON must include a <code>type</code> and a <code>data</code> object.</p>
				<p class="c-body c-muted">
					Valid types: <code>store</code> · <code>event</code> · <code>message</code> · <code>fundraiser</code> · <code>petition</code> · <code>discussion</code> · <code>drop</code> · <code>art</code>
				</p>
			</div>

		{:else if parseError && !encodeResult}
			<div class="c-block">
				<p class="c-type-label c-type-error">Error</p>
				<h1 class="c-headline">Encoding failed</h1>
				<p class="c-error-msg">{parseError}</p>
				<p class="c-body c-muted">
					Check the JSON structure and try again.
					<a href="/c">Back to /c</a>
				</p>
			</div>

		{:else if encodeResult}
			<div class="c-block">
				<p class="c-type-label">{displayType}</p>
				<h1 class="c-headline">{siteDataRaw.name ?? '(unnamed)'}</h1>

				<p class="c-body">
					Your {displayType} is ready — encoded into a single shareable URL with no server and no
					database. Open in the builder to set your key, sign, and share.
				</p>

				{#if encodeResult.warn}
					<div class="c-over-limit">
						<div class="c-over-limit-icon">⚠</div>
						<div class="c-over-limit-text">
							<strong>URL is over the safe sharing limit</strong>
							<span>
								At {encodeResult.length.toLocaleString()} characters this URL may be truncated by
								social apps, email clients, and messaging platforms. Open the builder to reduce
								content — shorten descriptions, remove images, or trim items.
							</span>
						</div>
					</div>
				{/if}

				<div class="c-actions">
					<a href={builderRoute} class="c-btn-primary">
						Edit {displayType} in builder
					</a>
					{#if canCopyUrl}
						<button
							class="c-btn-secondary"
							class:c-btn-warn={encodeResult.warn}
							onclick={copyUrl}
							disabled={!nowUrl}
						>
							{copied ? 'Copied!' : encodeResult.warn ? 'Copy URL (too long)' : 'Copy URL'}
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<footer class="c-footer">
			<span>hosted nowhere. present everywhere.</span>
		</footer>

	</main>
</div>

<!-- Machine-readable output for agents (hidden) -->
<div style="display:none" aria-hidden="true">
	<code id="nowhere-output">{nowUrl}</code>
	<code id="nowhere-error">{parseError}</code>
	<dl id="nowhere-verify">
		{#each verifySummary as { label, value }}
			<dt>{label}</dt>
			<dd>{value}</dd>
		{/each}
	</dl>
</div>

<style>
	/* ── Shell ── */
	.c-shell {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		background:
			radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,0,0,0.04) 0%, transparent 70%),
			#fafaf9;
	}

	.c-stage {
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}

	/* ── Brand ── */
	.c-brand {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.c-logo {
		font-size: 1.375rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: #18181b;
		line-height: 1;
		text-decoration: none;
	}

	.c-logo:hover {
		text-decoration: none;
		opacity: 0.7;
		transition: opacity 150ms ease;
	}

	.c-brand-sep {
		display: block;
		width: 2rem;
		height: 1.5px;
		background: #e4e4e7;
	}

	/* ── Content block ── */
	.c-block {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.c-type-label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #a1a1aa;
		margin: 0;
	}

	.c-type-error {
		color: #dc2626;
	}

	.c-headline {
		font-size: clamp(2rem, 6vw, 3rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1.05;
		color: #18181b;
		margin: 0;
	}

	.c-body {
		font-size: 0.9375rem;
		line-height: 1.65;
		color: #71717a;
		margin: 0;
	}

	.c-muted {
		font-size: 0.8125rem;
		color: #a1a1aa;
	}

	.c-loading {
		font-size: 0.9375rem;
		color: #a1a1aa;
		margin: 0;
	}

	.c-error-msg {
		font-size: 0.875rem;
		color: #dc2626;
		background: rgba(220, 38, 38, 0.06);
		border: 1px solid rgba(220, 38, 38, 0.15);
		border-radius: 8px;
		padding: 0.875rem 1rem;
		line-height: 1.5;
		margin: 0;
	}

	/* ── Over-limit warning ── */
	.c-over-limit {
		display: flex;
		gap: 0.875rem;
		padding: 1rem 1.125rem;
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 10px;
	}

	.c-over-limit-icon {
		font-size: 1rem;
		flex-shrink: 0;
		margin-top: 1px;
		color: #d97706;
	}

	.c-over-limit-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.c-over-limit-text strong {
		font-weight: 600;
		color: #92400e;
		font-size: 0.875rem;
	}

	.c-over-limit-text span {
		color: #78350f;
		font-size: 0.8125rem;
	}

	/* ── Actions ── */
	.c-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		padding-top: 0.5rem;
	}

	.c-btn-primary,
	.c-btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 1.5rem;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		cursor: pointer;
		text-decoration: none;
		transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
		border: 1.5px solid transparent;
		white-space: nowrap;
	}

	.c-btn-primary {
		background: #18181b;
		color: #ffffff;
		border-color: #18181b;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12);
	}

	.c-btn-primary:hover {
		background: #27272a;
		border-color: #27272a;
		box-shadow: 0 4px 12px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.1);
		transform: translateY(-1px);
		text-decoration: none;
	}

	.c-btn-primary:active {
		transform: translateY(0);
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
	}

	.c-btn-secondary {
		background: #ffffff;
		color: #18181b;
		border-color: #d4d4d8;
		box-shadow: 0 1px 2px rgba(0,0,0,0.06);
	}

	.c-btn-secondary:hover:not(:disabled) {
		border-color: #a1a1aa;
		box-shadow: 0 2px 6px rgba(0,0,0,0.08);
		transform: translateY(-1px);
	}

	.c-btn-secondary:active:not(:disabled) {
		transform: translateY(0);
	}

	.c-btn-secondary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.c-btn-warn {
		border-color: #fcd34d;
		color: #92400e;
		background: #fffbeb;
	}

	.c-btn-warn:hover:not(:disabled) {
		background: #fef3c7;
		border-color: #f59e0b;
	}

	/* ── Footer ── */
	.c-footer {
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #d4d4d8;
	}

	/* ── Code ── */
	.c-pre {
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		color: #52525b;
		background: #f4f4f5;
		border-radius: 8px;
		padding: 0.875rem 1rem;
		overflow-x: auto;
		white-space: pre;
		margin: 0;
	}

	code {
		font-family: var(--font-mono, monospace);
		font-size: 0.8125rem;
		background: #f4f4f5;
		padding: 1px 5px;
		border-radius: 4px;
		color: #3f3f46;
	}

	/* ── Responsive ── */
	@media (max-width: 480px) {
		.c-shell {
			padding: 2rem 1.25rem;
			align-items: flex-start;
			padding-top: 3rem;
		}

		.c-actions {
			flex-direction: column;
		}

		.c-btn-primary,
		.c-btn-secondary {
			width: 100%;
		}
	}
</style>

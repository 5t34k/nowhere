<script lang="ts">
	import { minifySvg, isSvgString } from '$lib/utils/svg';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';

	interface Props {
		value: string;
		onUpdate: (value: string) => void;
		placeholder?: string;
		allowEmoji?: boolean;
	}

	let { value, onUpdate, placeholder = 'https://… or paste SVG', allowEmoji = false }: Props = $props();

	const uid = Math.random().toString(36).slice(2, 8);
	const isSvg = $derived(isSvgString(value));
	const isUrl = $derived(value.startsWith('http') || value.startsWith('data:'));

	let localText = $state(value);

	// Track whether the user is actively editing the SVG textarea
	let editingSvg = $state(false);

	$effect(() => {
		// Sync from parent when value changes externally (e.g. monogram apply)
		if (isSvg && editingSvg) {
			// Don't overwrite textarea while user is actively editing
		} else {
			localText = value;
		}
	});

	function handleInput(e: Event) {
		const raw = (e.currentTarget as HTMLTextAreaElement | HTMLInputElement).value;
		localText = raw;
		editingSvg = false;
		const trimmed = raw.trim();
		if (isSvgString(trimmed)) {
			const minified = minifySvg(trimmed);
			onUpdate(minified);
		} else {
			onUpdate(trimmed);
		}
	}

	function handleSvgInput(e: Event) {
		editingSvg = true;
		const raw = (e.currentTarget as HTMLTextAreaElement).value;
		localText = raw;
	}

	function handleFileUpload(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const raw = reader.result as string;
			const minified = minifySvg(raw);
			localText = minified;
			onUpdate(minified);
		};
		reader.readAsText(file);
	}

	function clearSvg() {
		localText = '';
		onUpdate('');
	}

	const rawBytes = $derived(isSvg ? new TextEncoder().encode(value).length : 0);
	const sizeLabel = $derived(
		rawBytes < 1024 ? `${rawBytes} B` : `${(rawBytes / 1024).toFixed(1)} KB`
	);
	const sanitizedPreview = $derived.by(() => {
		if (!isSvg) return '';
		return sanitizeSvg(value);
	});
</script>

<div class="svg-image-input">
	{#if isSvg}
		<div class="svg-label-row">
			<span class="size-badge">{sizeLabel}</span>
			<button class="clear-btn" onclick={clearSvg}>Clear</button>
			<label class="upload-btn" for="svg-file-{uid}">Replace file</label>
			<input
				id="svg-file-{uid}"
				type="file"
				accept=".svg,image/svg+xml"
				onchange={handleFileUpload}
				class="file-input"
			/>
		</div>
		<textarea
			value={localText}
			oninput={handleSvgInput}
			onchange={handleInput}
			rows="6"
			spellcheck="false"
			class="svg-textarea"
		></textarea>
{#if sanitizedPreview}
			<div class="svg-preview">
				{@html sanitizedPreview}
			</div>
		{/if}
	{:else}
		<div class="url-row">
			<input
				type="text"
				value={localText}
				oninput={handleInput}
				{placeholder}
			/>
			<label class="upload-btn" for="svg-file-{uid}">Upload SVG</label>
			<input
				id="svg-file-{uid}"
				type="file"
				accept=".svg,image/svg+xml"
				onchange={handleFileUpload}
				class="file-input"
			/>
		</div>
		{#if isUrl}
			<div class="url-preview">
				<img src={value} alt="Preview" />
			</div>
		{:else if allowEmoji && value && !isUrl}
			<div class="emoji-preview">
				<span class="emoji">{value}</span>
			</div>
		{/if}
	{/if}
</div>

<style>
	.svg-image-input {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.svg-label-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.size-badge {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	.clear-btn {
		margin-left: auto;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		padding: 0;
		font-family: inherit;
	}

	.clear-btn:hover {
		color: var(--color-text);
	}

	.upload-btn {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		font-weight: 400;
	}

	.upload-btn:hover {
		color: var(--color-text);
	}

	.file-input {
		display: none;
	}

	.url-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.url-row input {
		flex: 1;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.url-row input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.svg-textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-family: var(--font-mono);
		line-height: 1.5;
		resize: vertical;
		min-height: 80px;
	}

	.svg-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.svg-preview {
		padding: var(--space-2);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
		max-height: 120px;
		overflow: hidden;
	}

	.svg-preview :global(svg) {
		max-width: 100%;
		max-height: 100px;
		display: block;
	}

	.url-preview {
		padding: var(--space-2);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
	}

	.url-preview img {
		max-width: 100%;
		max-height: 100px;
		display: block;
		object-fit: contain;
	}

	.emoji-preview {
		padding: var(--space-2);
	}

	.emoji {
		font-size: 2rem;
	}
</style>

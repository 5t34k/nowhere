<script lang="ts">
	import { minifySvg, SVG_SIZE_WARN } from '$lib/utils/svg';

	interface Props {
		name: string;
		svg: string;
		onUpdate: (field: string, value: unknown) => void;
	}

	let { name, svg, onUpdate }: Props = $props();

	function handleSvgChange(raw: string) {
		const minified = minifySvg(raw);
		onUpdate('svg', minified);
	}

	function handleFileUpload(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			handleSvgChange(reader.result as string);
		};
		reader.readAsText(file);
	}

	const rawBytes = $derived(new TextEncoder().encode(svg).length);
	const sizeLabel = $derived(
		rawBytes < 1024
			? `${rawBytes} B`
			: `${(rawBytes / 1024).toFixed(1)} KB`
	);
	const sizeWarning = $derived(rawBytes > SVG_SIZE_WARN);
</script>

<div class="panel">
	<h3>Artwork</h3>

	<section class="field-group">
		<label for="art-title">
			Title
		</label>
		<input
			id="art-title"
			type="text"
			value={name}
			onchange={(e) => onUpdate('name', e.currentTarget.value)}
			placeholder="Untitled"
		/>
	</section>

	<section class="field-group">
		<div class="svg-label-row">
			<label for="art-svg">SVG <span class="required">*</span></label>
			{#if svg}
				<span class="size-badge" class:warn={sizeWarning}>{sizeLabel}</span>
			{/if}
			<label class="upload-btn" for="art-svg-file">Upload file</label>
			<input
				id="art-svg-file"
				type="file"
				accept=".svg,image/svg+xml"
				onchange={handleFileUpload}
				class="file-input"
			/>
		</div>
		<textarea
			id="art-svg"
			value={svg}
			onchange={(e) => handleSvgChange(e.currentTarget.value)}
			placeholder="Paste SVG markup here…"
			rows="18"
			spellcheck="false"
		></textarea>
		<p class="hint">
			Paste or upload SVG from Inkscape, Figma, or any vector tool. Comments, XML declarations, and whitespace are removed automatically. No external fonts or embedded images. SVG backgrounds are transparent by default — to lock in a background colour, add a rect as the first element in your SVG.
		</p>
		{#if sizeWarning}
			<p class="size-warning">SVG is large — simplify paths to reduce the encoded URL length.</p>
		{/if}
	</section>
</div>

<style>
	.required {
		color: var(--color-danger, #dc2626);
	}

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

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.svg-label-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.svg-label-row label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.size-badge {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	.size-badge.warn {
		color: var(--color-warning, #d97706);
	}

	.upload-btn {
		margin-left: auto;
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

	.field-group input,
	.field-group textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.field-group input:focus,
	.field-group textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	textarea {
		resize: vertical;
		min-height: 280px;
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.5;
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.5;
		margin: 0;
	}

	.size-warning {
		font-size: var(--text-xs);
		color: var(--color-warning, #d97706);
		margin: 0;
	}
</style>

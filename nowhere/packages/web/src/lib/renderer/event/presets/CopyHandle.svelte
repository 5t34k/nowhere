<script lang="ts">
	let { text }: { text: string } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(e: MouseEvent) {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Fallback for environments without clipboard API
			const el = document.createElement('textarea');
			el.value = text;
			el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
			document.body.appendChild(el);
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
		}
		clearTimeout(timer);
		copied = true;
		timer = setTimeout(() => (copied = false), 1500);
	}
</script>

<button
	class="copy-btn"
	class:copied
	onclick={copy}
	title="Copy to clipboard"
	aria-label="Copy {text}"
>
	{#if copied}
		✓ Copied
	{:else}
		{text}
	{/if}
</button>

<style>
	.copy-btn {
		/* Inherit all text styles from parent — font, color, size, spacing */
		font: inherit;
		color: inherit;
		letter-spacing: inherit;
		word-break: inherit;
		text-align: left;
		/* Reset button chrome */
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		display: inline;
		line-height: inherit;
		cursor: pointer;
	}

	.copy-btn:hover {
		opacity: 0.7;
	}

	.copy-btn.copied {
		/* Themes can set --copy-color to override; fallback chain: accent → green */
		color: var(--copy-color, var(--accent, #22c55e));
		cursor: default;
	}
</style>

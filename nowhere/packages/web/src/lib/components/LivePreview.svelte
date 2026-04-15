<script lang="ts">
	import type { EncodeResult } from '@nowhere/codec';

	interface Props {
		result: EncodeResult | null;
		openUrl?: string;
		hideOpenLink?: boolean;
	}

	let { result, openUrl = '', hideOpenLink = false }: Props = $props();

	let debouncedFragment = $state('');
	let debounceTimer: ReturnType<typeof setTimeout>;

	// Debounce preview updates (500ms)
	$effect(() => {
		const fragment = result?.fragment ?? '';
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debouncedFragment = fragment;
		}, 500);
	});

	const previewUrl = $derived(
		debouncedFragment ? `/s?preview=1#${debouncedFragment}` : ''
	);

	// "Preview in new tab" should use the real URL without preview flag
	const storeUrl = $derived(
		debouncedFragment ? `/s#${debouncedFragment}` : ''
	);
</script>

<div class="preview-container">
	<div class="preview-header">
		<span class="preview-label">Live Preview</span>
		{#if !hideOpenLink && (openUrl || storeUrl)}
			<a href={openUrl || storeUrl} target="_blank" rel="noopener" class="open-link">Preview in new tab</a>
		{/if}
	</div>

	{#if previewUrl}
		<iframe src={previewUrl} title="Store preview" class="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
	{:else}
		<div class="preview-empty">
			<p>Fill in details to see a live preview</p>
		</div>
	{/if}
</div>

<style>
	.preview-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-bg);
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border-bottom: 1px solid var(--color-border);
	}

	.preview-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.open-link {
		font-size: var(--text-xs);
		color: var(--color-primary);
	}

	.preview-frame {
		flex: 1;
		width: 100%;
		border: none;
		min-height: 400px;
	}

	.preview-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	@media (max-width: 768px) {
		.preview-container {
			border: none;
			border-radius: 0;
			width: 100%;
		}

		.preview-frame {
			min-height: 0;
		}
	}
</style>

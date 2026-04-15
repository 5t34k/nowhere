<script lang="ts">
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';

	interface Props {
		image: string;
		alt?: string;
		class?: string;
	}

	let { image, alt = '', class: className = '' }: Props = $props();

	const isSvg = $derived(image?.startsWith('<'));
	const isUrl = $derived(image?.startsWith('http') || image?.startsWith('data:'));

	const sanitizedSvg = $derived.by(() => {
		if (!isSvg) return '';
		return sanitizeSvg(image);
	});
</script>

{#if isSvg}
	<div class="svg-image {className}" role="img" aria-label={alt}>
		{@html sanitizedSvg}
	</div>
{:else if isUrl}
	<img src={image} {alt} class={className} />
{:else if image}
	<span class={className}>{image}</span>
{/if}

<style>
	.svg-image {
		display: block;
		overflow: hidden;
	}

	.svg-image :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>

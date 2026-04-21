<script lang="ts">
	import { tokenizeLinks } from '$lib/renderer/utils/linkify.js';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();
	const tokens = $derived(tokenizeLinks(text));
</script>

{#each tokens as tok}
	{#if tok.type === 'link'}
		<a href={tok.href} target="_blank" rel="noopener noreferrer nofollow ugc" onclick={(e) => e.stopPropagation()}>{tok.value}</a>
	{:else}
		{tok.value}
	{/if}
{/each}

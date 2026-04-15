<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/renderer/store.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		const html = document.documentElement;
		const prev = html.dataset.theme;
		html.dataset.theme = 'light';
		return () => {
			if (prev === undefined) delete html.dataset.theme;
			else html.dataset.theme = prev;
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Nowhere URL Generator</title>
</svelte:head>

{@render children()}

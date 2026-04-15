<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let { children } = $props();

	onMount(() => {
		const html = document.documentElement;
		const prev = html.dataset.theme;
		html.dataset.theme = 'light';
		return () => {
			if (prev === undefined) {
				delete html.dataset.theme;
			} else {
				html.dataset.theme = prev;
			}
		};
	});
</script>

{@render children()}

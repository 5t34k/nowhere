<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { setContext } from 'svelte';

	let { children } = $props();

	const isStandalone = browser && (
		window.matchMedia('(display-mode: standalone)').matches ||
		!!(window.navigator as any).standalone
	);
	const isTouch = browser && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

	setContext('sidebarNav', {
		homeHref: 'https://hostednowhere.com',
		pwaBack: isStandalone ? '/app' : undefined,
		getApp: (!isStandalone && isTouch) ? 'https://nowhr.xyz/app' : undefined,
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="robots" content="noindex" />
</svelte:head>

{@render children()}

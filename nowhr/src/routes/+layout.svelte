<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { onMount, setContext } from 'svelte';
	import { installMultiTabSync } from '$lib/nostr/signer';
	import { restoreActiveSigner } from '$lib/nostr/nip46-signer';
	import SignInModal from '$lib/components/SignInModal.svelte';

	let { children } = $props();

	onMount(() => {
		void restoreActiveSigner();
		return installMultiTabSync(() => {});
	});

	onMount(() => {
		if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
		let reloading = false;
		const onChange = () => {
			if (reloading) return;
			reloading = true;
			location.reload();
		};
		navigator.serviceWorker.addEventListener('controllerchange', onChange);
		return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
	});

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
<SignInModal />

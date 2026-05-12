<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { installMultiTabSync } from '$lib/nostr/signer';
	import { restoreActiveSigner } from '$lib/nostr/nip46-signer';
	import SignInModal from '$lib/components/SignInModal.svelte';

	let { children } = $props();

	onMount(() => {
		void restoreActiveSigner();
		return installMultiTabSync(() => {});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Nowhere · Store Builder</title>
</svelte:head>

{@render children()}
<SignInModal />

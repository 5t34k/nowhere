<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/renderer/store.css';
	import favicon from '$lib/assets/favicon.svg';
	import { siteData } from '$lib/renderer/stores/site-data.js';

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

	const LABELS: Record<string, string> = {
		store: 'Store',
		event: 'Event',
		message: 'Message',
		fundraiser: 'Fundraiser',
		petition: 'Petition',
		discussion: 'Forum',
		drop: 'Drop',
		art: 'Art'
	};

	const pageTitle = $derived.by(() => {
		if (!$siteData) return 'Nowhere';
		if ($siteData.siteType === 'message') {
			const title = $siteData.tags?.find((t: { key: string }) => t.key === 't')?.value;
			if (title) return `${title} · ${$siteData.name}`;
			return $siteData.name;
		}
		const label = LABELS[$siteData.siteType] ?? $siteData.siteType;
		return `${$siteData.name} · Nowhere ${label}`;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{pageTitle}</title>
</svelte:head>

{@render children()}

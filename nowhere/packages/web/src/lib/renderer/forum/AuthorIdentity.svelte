<script module lang="ts">
	type AvatarFn = (pubkey: string, size: number) => string;
	let _avatarFn: AvatarFn | null = null;
	const _avatarReady: Promise<AvatarFn | null> = import('$lib/nowhere-avatar.js')
		.then(mod => { _avatarFn = mod.generateAvatar; return _avatarFn; })
		.catch(() => null);
</script>

<script lang="ts">
	import { computeFingerprintFromString, computeVerificationPhrase } from '@nowhere/codec';
	import { npubEncode } from 'nostr-tools/nip19';
	import { fetchProfile } from '$lib/renderer/nostr/relay-pool.js';
	import type { ForumCache } from '$lib/renderer/nostr/forum-cache.js';
	import { loadProfile, isProfileFresh } from '$lib/renderer/nostr/profile-cache.js';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';

	interface Props {
		pubkey: string;
		privacyMode: number;
		size?: number;
		showAvatar?: boolean;
		showPhrase?: boolean;
		showNpub?: boolean;
		vertical?: boolean;
		profileRelays?: string[];
		forumCache?: ForumCache;
		onOpenProfileCard?: (pubkey: string) => void;
	}

	let { pubkey, privacyMode, size = 40, showAvatar = true, showPhrase = true, showNpub = true, vertical = false, profileRelays, forumCache, onOpenProfileCard }: Props = $props();

	// Synchronous cache read — lets the very first render hydrate name/picture
	// without waiting on a Promise microtask. Without this the template flashes
	// the generated SVG for one frame before the cached image appears.
	const cachedProfile = $derived.by<{ name: string; picture: string } | null>(() => {
		if (!pubkey || privacyMode !== 0 || !forumCache) return null;
		try {
			const entry = loadProfile(forumCache, pubkey);
			if (!entry || !isProfileFresh(entry)) return null;
			const p = JSON.parse(entry.content);
			return {
				name: p.display_name || p.name || '',
				picture: sanitizeImageUrl(p.picture || '')
			};
		} catch {
			return null;
		}
	});

	let fetchedProfile = $state<{ name: string; picture: string } | null>(null);
	const profileName = $derived(fetchedProfile?.name || cachedProfile?.name || '');
	const profilePicture = $derived(fetchedProfile?.picture || cachedProfile?.picture || '');
	let avatarSvg = $state('');
	let userPhrase = $state('');

	const npubTruncated = $derived.by(() => {
		try {
			const npub = npubEncode(pubkey);
			return npub.slice(0, 12) + '...' + npub.slice(-4);
		} catch {
			return pubkey.slice(0, 8) + '...';
		}
	});

	// Compute 6-word verification phrase from pubkey
	$effect(() => {
		if (!pubkey) return;
		computeFingerprintFromString(pubkey).then(fp => {
			userPhrase = computeVerificationPhrase(fp, 6);
		}).catch(() => {});
	});

	// Async profile fetch — only used when cache is missing or stale. On a
	// cache hit, `cachedProfile` already populated the derived name/picture
	// synchronously, so this just keeps the display fresh in the background.
	$effect(() => {
		if (!pubkey) return;
		fetchedProfile = null;
		if (privacyMode === 0) {
			fetchProfile({ kinds: [0], authors: [pubkey], limit: 1 }, profileRelays, forumCache).then(event => {
				if (event?.content) {
					try {
						const p = JSON.parse(event.content);
						fetchedProfile = {
							name: p.display_name || p.name || '',
							picture: sanitizeImageUrl(p.picture || '')
						};
					} catch {}
				}
			}).catch(() => {});
		}
		// Generate avatar — sync if module loaded, else await the shared promise
		if (_avatarFn) {
			avatarSvg = _avatarFn(pubkey, size);
		} else {
			_avatarReady.then(fn => {
				if (fn) avatarSvg = fn(pubkey, size);
			});
		}
	});
</script>

{#if showAvatar}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#if privacyMode === 0 && profilePicture}
		<span class="author-avatar-img" class:author-identity-clickable={!!onOpenProfileCard} style:width="{size}px" style:height="{size}px" onclick={(e) => { if (onOpenProfileCard) { e.stopPropagation(); onOpenProfileCard(pubkey); } }}>
			<img src={profilePicture} alt="" width={size} height={size} style="border-radius: inherit; object-fit: cover;" />
		</span>
	{:else if avatarSvg}
		<span class="author-avatar-img" class:author-identity-clickable={!!onOpenProfileCard} style:width="{size}px" style:height="{size}px" onclick={(e) => { if (onOpenProfileCard) { e.stopPropagation(); onOpenProfileCard(pubkey); } }}>
			{@html sanitizeSvg(avatarSvg)}
		</span>
	{:else}
		<span class="author-avatar-placeholder author-avatar-img" class:author-identity-clickable={!!onOpenProfileCard} style:width="{size}px" style:height="{size}px" onclick={(e) => { if (onOpenProfileCard) { e.stopPropagation(); onOpenProfileCard(pubkey); } }}></span>
	{/if}
{/if}
{#if vertical && (showPhrase || showNpub)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<span class="author-text-stack" class:author-identity-clickable={!!onOpenProfileCard} onclick={(e) => { if (onOpenProfileCard) { e.stopPropagation(); onOpenProfileCard(pubkey); } }}>
		{#if showPhrase}
			<span class="author-label">
				{#if privacyMode === 0 && profileName}
					<span class="author-display-name">{profileName}</span>
					{#if userPhrase}<span class="author-label-sep"> · </span>{/if}
				{/if}
				{#if userPhrase}<span class="author-phrase">@{userPhrase}</span>{/if}
			</span>
		{/if}
		{#if showNpub}
			<span class="author-npub">{npubTruncated}</span>
		{/if}
	</span>
{:else}
	{#if showPhrase}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span class="author-label" class:author-identity-clickable={!!onOpenProfileCard} onclick={(e) => { if (onOpenProfileCard) { e.stopPropagation(); onOpenProfileCard(pubkey); } }}>
			{#if privacyMode === 0 && profileName}
				<span class="author-display-name">{profileName}</span>
				{#if userPhrase}
					<span class="author-label-sep"> · </span>
				{/if}
			{/if}
			{#if userPhrase}
				<span class="author-phrase">@{userPhrase}</span>
			{/if}
		</span>
	{/if}
	{#if showNpub}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span class="author-npub" class:author-identity-clickable={!!onOpenProfileCard} onclick={(e) => { if (onOpenProfileCard) { e.stopPropagation(); onOpenProfileCard(pubkey); } }}>{npubTruncated}</span>
	{/if}
{/if}

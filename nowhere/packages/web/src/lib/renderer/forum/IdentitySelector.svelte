<script lang="ts">
	import AuthorIdentity from './AuthorIdentity.svelte';

	interface Props {
		identityMode: number;
		privacyMode: number;
		authorPubkey: string;
		nip07Pubkey: string;
		canPost: boolean;
		onConnectNip07: () => void;
		onDisconnectNip07: () => void;
		onStartAnon: () => void;
		connectError: string;
		open?: boolean;
	}

	let { identityMode, privacyMode, authorPubkey, nip07Pubkey, canPost, onConnectNip07, onDisconnectNip07, onStartAnon, connectError, open = $bindable(false) }: Props = $props();

	let dropdownEl: HTMLDivElement | undefined = $state();

	const isExtension = $derived(!!nip07Pubkey);
	const signedOut = $derived(!canPost);

	function toggle() {
		open = !open;
	}

	function handleClickOutside(e: MouseEvent) {
		if (dropdownEl && !dropdownEl.contains(e.target as Node)) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside, true);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});
</script>

<div class="identity-menu" bind:this={dropdownEl}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="identity-trigger" class:placeholder={signedOut} onclick={toggle}>
		{#if signedOut}
			<span class="identity-trigger-placeholder">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
			</span>
		{:else}
			<AuthorIdentity pubkey={authorPubkey} {privacyMode} size={26} showPhrase={false} showNpub={false} />
		{/if}
	</div>

	{#if open}
		<div class="identity-dropdown">
			{#if signedOut}
				<!-- Signed out: show options to sign in -->
				<div class="identity-dropdown-empty">
					<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
					<span class="identity-dropdown-hint">Choose how to participate</span>
				</div>
				<div class="identity-dropdown-actions">
					<button class="identity-action-btn connect" onclick={onConnectNip07}>
						Sign in with Extension
					</button>
					{#if identityMode === 1}
						<button class="identity-action-btn anon" onclick={() => { onStartAnon(); open = false; }}>
							Post Anonymously
						</button>
					{/if}
				</div>
			{:else}
				<!-- Signed in: show identity -->
				<div class="identity-dropdown-profile">
					<AuthorIdentity pubkey={authorPubkey} {privacyMode} size={44} showPhrase={false} showNpub={false} />
					<div class="identity-dropdown-info">
						<AuthorIdentity pubkey={authorPubkey} {privacyMode} showAvatar={false} />
					</div>
				</div>
				<div class="identity-dropdown-status">
					{#if isExtension}
						<span class="identity-status-dot connected"></span>
						Signed with extension
					{:else}
						<span class="identity-status-dot anon"></span>
						Anonymous session
					{/if}
				</div>
				<div class="identity-dropdown-actions">
					<button class="identity-action-btn" onclick={() => { onDisconnectNip07(); open = false; }}>Sign Out</button>
				</div>
			{/if}

			{#if connectError}
				<div class="identity-dropdown-error">{connectError}</div>
			{/if}
		</div>
	{/if}
</div>

<script module lang="ts">
	type AvatarFn = (pubkey: string, size: number) => string;
	let _avatarFn: AvatarFn | null = null;
	const _avatarReady: Promise<AvatarFn | null> = import('$lib/nowhere-avatar.js')
		.then(mod => { _avatarFn = mod.generateAvatar; return _avatarFn; })
		.catch(() => null);
</script>

<script lang="ts">
	import { activeSigner } from '$lib/nostr/signer';
	import { signOut } from '$lib/nostr/nip07';
	import { requestSignIn } from '$lib/nostr/signin-modal-store';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';

	interface Props {
		variant: 'inline' | 'icon';
	}

	let { variant }: Props = $props();

	const pubkey = $derived($activeSigner?.pubkey ?? '');
	const signedIn = $derived(!!pubkey);

	let avatarSvg = $state('');
	let menuOpen = $state(false);
	let rootEl: HTMLDivElement | undefined = $state();

	const inlineAvatarSize = 22;
	const iconAvatarSize = 26;
	const dropdownAvatarSize = 36;

	// Both chip variants live in the DOM simultaneously (CSS media query
	// toggles display, not mount), so their identically-seeded gradient ids
	// would collide. Suffix per variant to keep each SVG self-contained.
	function uniquifyAvatarIds(svg: string, suffix: string): string {
		return svg
			.replace(/id="(g[A-Za-z0-9]+)"/g, (_, id) => `id="${id}-${suffix}"`)
			.replace(/url\(#(g[A-Za-z0-9]+)\)/g, (_, id) => `url(#${id}-${suffix})`);
	}

	function regenerateAvatars(pk: string) {
		if (!pk) {
			avatarSvg = '';
			return;
		}
		const size = variant === 'inline' ? inlineAvatarSize : iconAvatarSize;
		if (_avatarFn) {
			avatarSvg = uniquifyAvatarIds(_avatarFn(pk, size), variant);
		} else {
			_avatarReady.then(fn => {
				if (fn && pk === pubkey) avatarSvg = uniquifyAvatarIds(fn(pk, size), variant);
			});
		}
	}

	$effect(() => {
		regenerateAvatars(pubkey);
	});

	async function handleSignIn() {
		menuOpen = false;
		try {
			await requestSignIn();
		} catch {
			// User cancelled — nothing to do.
		}
	}

	async function handleSignOut() {
		menuOpen = false;
		try {
			await signOut();
		} catch {
			// signOut already swallows internally; ignore.
		}
	}

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function handleClickOutside(e: MouseEvent) {
		if (rootEl && !rootEl.contains(e.target as Node)) {
			menuOpen = false;
		}
	}

	$effect(() => {
		if (menuOpen) {
			document.addEventListener('click', handleClickOutside, true);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});
</script>

{#snippet placeholderIcon(size: number)}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
		<circle cx="12" cy="7" r="4" />
	</svg>
{/snippet}

{#snippet avatarOrPlaceholder(size: number)}
	{#if signedIn && avatarSvg}
		<span class="chip-avatar" style:width="{size}px" style:height="{size}px">
			{@html sanitizeSvg(avatarSvg)}
		</span>
	{:else}
		<span class="chip-placeholder" style:width="{size}px" style:height="{size}px">
			{@render placeholderIcon(Math.round(size * 0.7))}
		</span>
	{/if}
{/snippet}

{#if variant === 'inline'}
	<button
		class="chip-inline"
		onclick={signedIn ? handleSignOut : handleSignIn}
		title={signedIn ? 'Sign out' : 'Sign in'}
	>
		<span class="chip-avatar-slot">
			{@render avatarOrPlaceholder(inlineAvatarSize)}
		</span>
		<span class="chip-label">{signedIn ? 'Sign out' : 'Sign in'}</span>
	</button>
{:else}
	<div class="chip-icon-wrap" bind:this={rootEl}>
		<button
			class="chip-icon"
			onclick={toggleMenu}
			aria-label={signedIn ? 'Account menu' : 'Sign in'}
			aria-haspopup="menu"
			aria-expanded={menuOpen}
		>
			{@render avatarOrPlaceholder(iconAvatarSize)}
		</button>
		{#if menuOpen}
			<div class="chip-menu" role="menu">
				{#if signedIn}
					<div class="chip-menu-profile">
						{@render avatarOrPlaceholder(dropdownAvatarSize)}
						<span class="chip-menu-status">Signed in</span>
					</div>
					<button class="chip-menu-action" onclick={handleSignOut} role="menuitem">Sign out</button>
				{:else}
					<div class="chip-menu-profile">
						{@render avatarOrPlaceholder(dropdownAvatarSize)}
						<span class="chip-menu-status">Not signed in</span>
					</div>
					<button class="chip-menu-action" onclick={handleSignIn} role="menuitem">Sign in</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* ─── Inline variant (desktop sidebar footer) ─── */
	/* Layout intent: full-width row that visually matches the Import/Reset
	   buttons it sits above. Avatar is anchored to the left, label is
	   centred in the button's full width (not just the space after the
	   avatar) so the text optically aligns with the buttons below. */
	.chip-inline {
		position: relative;
		display: block;
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
		text-align: center;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.chip-inline:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.chip-avatar-slot {
		position: absolute;
		left: var(--space-2);
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ─── Icon variant (mobile header) ─── */
	.chip-icon-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.chip-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.chip-icon:hover {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	/* ─── Shared avatar/placeholder visuals ─── */
	/* Rounded square matches the forum's identity-trigger / post avatars.
	   The generated SVG has its own rx="12" rounded background, so the
	   wrapper just needs to clip the corners cleanly. */
	.chip-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 5px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.chip-avatar :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.chip-placeholder {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 5px;
		background: var(--color-bg-tertiary);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	/* ─── Mobile dropdown menu ─── */
	.chip-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
		min-width: 180px;
		overflow: hidden;
	}

	.chip-menu-profile {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}

	.chip-menu-status {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.chip-menu-action {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		background: none;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.chip-menu-action:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}
</style>

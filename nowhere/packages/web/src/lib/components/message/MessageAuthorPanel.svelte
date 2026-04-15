<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import NpubInput from '../NpubInput.svelte';
	import HintIcon from '../HintIcon.svelte';
	import SvgImageInput from '../SvgImageInput.svelte';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';

	type AvatarFn = (seed: string, size: number) => string;
	let avatarFn: AvatarFn | null = null;
	const avatarReady: Promise<AvatarFn | null> = import('$lib/nowhere-avatar.js')
		.then(mod => { avatarFn = mod.generateAvatar; return avatarFn; })
		.catch(() => null);

	interface Props {
		pubkey: string;
		name: string;
		image: string;
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, name, image, onUpdate }: Props = $props();

	const usingNowhereAvatar = $derived(image === '@');

	// Generate preview of the nowhere avatar from pubkey
	let avatarPreviewSvg = $state('');
	$effect(() => {
		if (!pubkey) { avatarPreviewSvg = ''; return; }
		const hex = base64urlToHex(pubkey);
		if (avatarFn) {
			avatarPreviewSvg = sanitizeSvg(avatarFn(hex, 48));
		} else {
			avatarReady.then(fn => {
				if (fn && pubkey) avatarPreviewSvg = sanitizeSvg(fn(hex, 48));
			});
		}
	});

	function base64urlToHex(b64: string): string {
		const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
		const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
		const binary = atob(padded);
		return Array.from(binary, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
	}

	function useNowhereAvatar() {
		onUpdate('image', '@');
	}

	function clearNowhereAvatar() {
		onUpdate('image', '');
	}

	// Clear nowhere avatar if pubkey is removed
	$effect(() => {
		if (!pubkey && image === '@') {
			onUpdate('image', '');
		}
	});
</script>

<div class="panel">
	<h3>Author</h3>

	<section class="field-group">
		<label for="msg-pubkey">Public Key <HintIcon tip="Your Nostr public key (npub). Adds a verifiable author identity to your message." /></label>
		<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} required={false} />
	</section>

	<section class="field-group">
		<label for="msg-name">Author Name <span class="required">*</span></label>
		<input
			id="msg-name"
			type="text"
			value={name}
			onchange={(e) => onUpdate('name', e.currentTarget.value)}
			placeholder="Your name or handle"
		/>
	</section>

	<section class="field-group">
		<label for="msg-avatar">
			Author Avatar
			<HintIcon tip="An emoji, image URL, or SVG displayed next to your name." />
		</label>
		{#if usingNowhereAvatar}
			<div class="nowhere-avatar-active">
				{#if avatarPreviewSvg}
					<span class="nowhere-avatar-preview">{@html avatarPreviewSvg}</span>
				{/if}
				<span class="nowhere-avatar-label">Using your nowhere avatar</span>
				<button class="nowhere-avatar-clear" onclick={clearNowhereAvatar}>Clear</button>
			</div>
		{:else}
			<SvgImageInput value={image} onUpdate={(v) => onUpdate('image', v)} allowEmoji={true} placeholder="🦊, https://…, or paste SVG" />
			{#if pubkey && avatarPreviewSvg && !image}
				<button class="nowhere-avatar-btn" onclick={useNowhereAvatar}>
					<span class="nowhere-avatar-preview small">{@html avatarPreviewSvg}</span>
					Use your nowhere avatar
				</button>
			{/if}
		{/if}
	</section>
</div>

<style>
	.required {
		color: var(--color-danger, #dc2626);
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.field-group input {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.field-group input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.nowhere-avatar-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: none;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-family: inherit;
		text-align: left;
	}

	.nowhere-avatar-btn:hover {
		border-color: var(--color-text-muted);
		color: var(--color-text);
	}

	.nowhere-avatar-active {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
	}

	.nowhere-avatar-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		flex: 1;
	}

	.nowhere-avatar-clear {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		padding: 0;
		font-family: inherit;
	}

	.nowhere-avatar-clear:hover {
		color: var(--color-text);
	}

	.nowhere-avatar-preview {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
	}

	.nowhere-avatar-preview.small {
		width: 24px;
		height: 24px;
	}

	.nowhere-avatar-preview :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}

</style>

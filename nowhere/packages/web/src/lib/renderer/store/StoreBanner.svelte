<script lang="ts">
	import { sanitizeUrl } from '$lib/renderer/utils/sanitize-url.js';

	interface Props {
		notice?: string;
		closed?: string;
		redirect?: string;
	}

	let { notice, closed, redirect }: Props = $props();
</script>

{#if notice}
	<div class="banner banner-notice">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
		<p>{notice}</p>
	</div>
{/if}

{#if closed}
	<div class="banner banner-closed">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
		<div>
			<strong>This store is closed</strong>
			<p>{closed}</p>
		</div>
	</div>
{/if}

{#if redirect}
	<div class="banner banner-redirect">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
		<div>
			<strong>A newer version of this store is available</strong>
			<p><a href={sanitizeUrl(redirect)}>Open updated store</a></p>
		</div>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		margin: 0 var(--space-4) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.banner svg {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.banner strong {
		display: block;
		margin-bottom: 2px;
	}

	.banner p {
		margin: 0;
	}

	.banner-closed {
		background: rgba(220, 38, 38, 0.08);
		border: 1px solid var(--color-error);
		color: var(--color-error);
	}

	.banner-redirect {
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid var(--color-primary);
		color: var(--color-primary);
	}

	.banner-redirect a {
		color: inherit;
		text-decoration: underline;
	}

	.banner-notice {
		background: rgba(234, 179, 8, 0.08);
		border: 1px solid var(--color-warning);
		color: var(--color-text);
	}
</style>

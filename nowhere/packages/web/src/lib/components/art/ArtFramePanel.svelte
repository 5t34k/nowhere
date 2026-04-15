<script lang="ts">
	import type { Tag } from '@nowhere/codec';

	interface Props {
		tags: Tag[];
		onTagUpdate: (key: string, value: string) => void;
	}

	let { tags, onTagUpdate }: Props = $props();

	const theme = $derived(tags.find((t) => t.key === 'T')?.value ?? 'g');

	const THEMES = [
		{
			id: 'g',
			name: 'Gallery',
			description: 'Artwork centred with generous white space on all sides, as if hanging on a wall. A subtle shadow separates it from the background.'
		},
		{
			id: 'b',
			name: 'Bleed',
			description: 'SVG fills the entire screen edge to edge. No margin, no frame, no chrome. The art is the screen.'
		},
		{
			id: 'r',
			name: 'Border',
			description: 'A single precise black rule frames the artwork with a consistent margin. Like a technical drawing or an edition print.'
		},
		{
			id: 's',
			name: 'Stamp',
			description: 'Artwork small and centred in a large field of white. The surrounding space gives the image authority. Works well for logos, badges, and marks.'
		},
		{
			id: 'd',
			name: 'Dark Room',
			description: 'Near-black background, artwork centred. For work with white or bright elements that would be lost on white.'
		},
		{
			id: 'w',
			name: 'Broadside',
			description: 'Artwork anchored at the top, full width. Title below in large type. The format of the political broadsheet — image commands, text follows.'
		},
		{
			id: 'm',
			name: 'Manifesto',
			description: 'Split layout. Artwork on the left, title and author on the right. The image and the statement side by side.'
		},
		{
			id: 'p',
			name: 'Paste-up',
			description: 'White background, artwork slightly rotated as if stuck to a wall. Informal, urgent, street feel.'
		}
	] as const;
</script>

<div class="panel">
	<h3>Frame</h3>
	<p class="panel-desc">The frame is part of the design. Choose how the work is encountered.</p>

	<div class="theme-grid">
		{#each THEMES as t}
			<button
				class="theme-card"
				class:selected={theme === t.id}
				onclick={() => onTagUpdate('T', t.id)}
				type="button"
			>
				<div class="theme-card-header">
					<span class="theme-name">{t.name}</span>
					{#if theme === t.id}
						<span class="theme-check">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						</span>
					{/if}
				</div>
				<p class="theme-desc">{t.description}</p>
			</button>
		{/each}
	</div>
</div>

<style>
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

	.panel-desc {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin: 0;
	}

	.theme-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.theme-card {
		display: block;
		width: 100%;
		text-align: left;
		padding: var(--space-3) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		cursor: pointer;
		transition: border-color 150ms ease, background 150ms ease;
	}

	.theme-card:hover {
		border-color: var(--color-text-muted);
	}

	.theme-card.selected {
		border-color: var(--color-primary);
		background: var(--color-primary-subtle, color-mix(in srgb, var(--color-primary) 6%, transparent));
	}

	.theme-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-1);
	}

	.theme-name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.theme-check {
		color: var(--color-primary);
		display: flex;
		align-items: center;
	}

	.theme-desc {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin: 0;
	}
</style>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		headerIcon?: Snippet;
		children: Snippet;
		onclose: () => void;
	}

	let { title, subtitle, headerIcon, children, onclose }: Props = $props();

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdrop}>
	<div class="modal" role="dialog" aria-label={title}>
		<div class="modal-header">
			<div class="header-left">
				{#if headerIcon}
					<div class="header-icon">
						{@render headerIcon()}
					</div>
				{/if}
				<div class="header-text">
					<h2>{title}</h2>
					{#if subtitle}
						<p class="header-subtitle">{subtitle}</p>
					{/if}
				</div>
			</div>
			<button class="close-btn" onclick={onclose} aria-label="Close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>
		<div class="modal-body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: fade-in 200ms ease;
	}

	.modal {
		background: var(--color-bg);
		width: 100%;
		max-height: 80vh;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		display: flex;
		flex-direction: column;
		animation: slide-up 250ms ease;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
		gap: var(--space-3);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	.header-icon {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--color-bg-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	.header-text {
		min-width: 0;
	}

	.modal-header h2 {
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
	}

	.header-subtitle {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin-top: 2px;
		line-height: 1.4;
	}

	.close-btn {
		background: none;
		border: none;
		border-radius: var(--radius-full);
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.close-btn:hover {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.modal-body {
		padding: var(--space-4) var(--space-4) var(--space-6);
		overflow-y: auto;
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text);
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slide-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}

	@media (min-width: 768px) {
		.modal-backdrop {
			align-items: center;
		}

		.modal {
			max-width: 620px;
			border-radius: var(--radius-lg);
			max-height: 70vh;
			animation: scale-in 200ms ease;
		}

		@keyframes scale-in {
			from { opacity: 0; transform: scale(0.95); }
			to { opacity: 1; transform: scale(1); }
		}
	}
</style>

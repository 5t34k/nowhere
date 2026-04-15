<script lang="ts">
	import { tick } from 'svelte';

	let { tip }: { tip: string } = $props();
	let show = $state(false);
	let bubbleEl: HTMLSpanElement;
	let iconEl: HTMLSpanElement;
	let bubbleStyle = $state('');

	async function toggle(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		if (show) {
			show = false;
			return;
		}
		const rect = iconEl.getBoundingClientRect();
		const pad = 8;
		// initial position centered above icon
		bubbleStyle = `top: ${rect.top - 6}px; left: ${rect.left + rect.width / 2}px; transform: translate(-50%, -100%);`;
		show = true;
		await tick();
		// measure and clamp
		const br = bubbleEl.getBoundingClientRect();
		let left = rect.left + rect.width / 2 - br.width / 2;
		if (left < pad) left = pad;
		if (left + br.width > window.innerWidth - pad) left = window.innerWidth - pad - br.width;
		bubbleStyle = `top: ${rect.top - 6}px; left: ${left}px; transform: translateY(-100%); max-width: ${window.innerWidth - pad * 2}px;`;
	}

	function close() {
		show = false;
	}
</script>

<span class="hint-wrap">
	<span class="hint-icon" bind:this={iconEl} onclick={toggle} onkeydown={toggle} role="button" tabindex="-1">?</span>
</span>

{#if show}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<span class="hint-backdrop" onclick={close} onkeydown={close}></span>
	<span class="hint-bubble" bind:this={bubbleEl} style={bubbleStyle}>{tip}</span>
{/if}

<style>
	.hint-wrap {
		display: inline-flex;
		align-items: center;
	}

	.hint-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--color-bg-tertiary, var(--color-border));
		color: var(--color-text-muted);
		font-size: 9px;
		font-weight: 700;
		cursor: help;
		vertical-align: middle;
		margin-left: 2px;
		-webkit-tap-highlight-color: transparent;
	}

	.hint-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9999;
	}

	.hint-bubble {
		position: fixed;
		background: var(--color-bg-tertiary, #333);
		color: var(--color-text, #fff);
		border-radius: 4px;
		padding: 5px 8px;
		font-size: 11px;
		font-weight: 400;
		line-height: 1.4;
		width: max-content;
		max-width: 220px;
		white-space: normal;
		z-index: 10000;
		pointer-events: none;
		box-shadow: 0 2px 8px rgba(0,0,0,0.15);
	}
</style>

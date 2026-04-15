<script lang="ts">
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';

	interface Props {
		images: string[];
		startIndex: number;
		onclose: () => void;
	}

	let { images, startIndex, onclose }: Props = $props();

	let current = $state(startIndex);
	let touchStartX = 0;

	$effect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	});

	function prev() {
		current = (current - 1 + images.length) % images.length;
	}

	function next() {
		current = (current + 1) % images.length;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
		else if (e.key === 'Escape') onclose();
	}

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
	}

	function handleTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="lb"
	role="dialog"
	aria-modal="true"
	aria-label="Image viewer"
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<button class="lb-bg" onclick={onclose} aria-label="Close lightbox" tabindex="-1"></button>

	<img
		src={sanitizeImageUrl(images[current])}
		alt="Image {current + 1} of {images.length}"
		class="lb-img"
		draggable="false"
	/>

	{#if images.length > 1}
		<button class="lb-nav lb-prev" onclick={prev} aria-label="Previous image">&#8249;</button>
		<button class="lb-nav lb-next" onclick={next} aria-label="Next image">&#8250;</button>

		<div class="lb-dots" aria-hidden="true">
			{#each images as _, i}
				<button
					class="lb-dot"
					class:active={i === current}
					onclick={() => (current = i)}
					tabindex="-1"
					aria-hidden="true"
				></button>
			{/each}
		</div>
	{/if}

	<button class="lb-close" onclick={onclose} aria-label="Close">&#215;</button>
</div>

<style>
	.lb {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lb-bg {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.92);
		border: none;
		padding: 0;
		cursor: zoom-out;
		width: 100%;
		height: 100%;
	}

	.lb-img {
		position: relative;
		z-index: 1;
		max-width: min(90vw, 1400px);
		max-height: 90vh;
		object-fit: contain;
		display: block;
		pointer-events: none;
		user-select: none;
		border-radius: 2px;
	}

	.lb-nav {
		position: absolute;
		z-index: 2;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #fff;
		font-size: 2rem;
		line-height: 1;
		width: 44px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.15s;
		padding: 0;
	}
	.lb-nav:hover { background: rgba(255, 255, 255, 0.22); }

	.lb-prev { left: max(1rem, 2vw); }
	.lb-next { right: max(1rem, 2vw); }

	.lb-close {
		position: absolute;
		z-index: 2;
		top: 1rem;
		right: 1rem;
		background: rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #fff;
		font-size: 1.25rem;
		line-height: 1;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 50%;
		transition: background 0.15s;
		padding: 0;
	}
	.lb-close:hover { background: rgba(255, 255, 255, 0.28); }

	.lb-dots {
		position: absolute;
		z-index: 2;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.lb-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		border: none;
		padding: 0;
		cursor: pointer;
		transition: background 0.12s, transform 0.12s;
	}
	.lb-dot.active {
		background: #fff;
		transform: scale(1.3);
	}
	.lb-dot:hover:not(.active) { background: rgba(255, 255, 255, 0.55); }
</style>

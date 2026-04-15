<script lang="ts">
	import { nameToColor, nameToTextColor } from '../utils/colors.js';
	import { sanitizeImageUrl } from '../utils/sanitize-url.js';

	interface Props {
		images: string[];
		name: string;
		activeIndex: number;
		onchange: (index: number) => void;
		ontap?: () => void;
	}

	let { images, name, activeIndex, onchange, ontap }: Props = $props();

	let dragging = $state(false);
	let dragOffset = $state(0);
	let startX = 0;

	const bgColor = $derived(nameToColor(name));
	const textColor = $derived(nameToTextColor(name));
	const firstLetter = $derived(name.charAt(0).toUpperCase());

	function isEmoji(img: string) {
		return !!img && !img.startsWith('http');
	}

	function isUrl(img: string) {
		return !!sanitizeImageUrl(img);
	}

	function prev(e: MouseEvent) {
		e.stopPropagation();
		if (activeIndex > 0) onchange(activeIndex - 1);
	}

	function next(e: MouseEvent) {
		e.stopPropagation();
		if (activeIndex < images.length - 1) onchange(activeIndex + 1);
	}

	function goTo(e: MouseEvent, i: number) {
		e.stopPropagation();
		onchange(i);
	}

	function handleTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		dragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!dragging) return;
		let delta = e.touches[0].clientX - startX;
		// Rubber-band resistance at edges
		if ((activeIndex === 0 && delta > 0) || (activeIndex === images.length - 1 && delta < 0)) {
			delta *= 0.3;
		}
		dragOffset = delta;
	}

	function handleTouchEnd() {
		if (!dragging) return;
		dragging = false;
		if (Math.abs(dragOffset) > 50) {
			if (dragOffset < 0 && activeIndex < images.length - 1) {
				onchange(activeIndex + 1);
			} else if (dragOffset > 0 && activeIndex > 0) {
				onchange(activeIndex - 1);
			}
		}
		dragOffset = 0;
	}

	function handleClick() {
		if (ontap) ontap();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="carousel"
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	onclick={handleClick}
>
	<div
		class="carousel-track"
		style:transform="translateX(calc(-{activeIndex} * 100% + {dragOffset}px))"
		style:transition={dragging ? 'none' : 'transform 300ms ease'}
	>
		{#each images as img, i}
			<div class="carousel-slide">
				{#if isUrl(img)}
					<img src={sanitizeImageUrl(img)} alt="{name} - image {i + 1}" loading={i === 0 ? 'eager' : 'lazy'} />
				{:else if isEmoji(img)}
					<div class="emoji-bg" style:background-color={bgColor}>
						<span class="emoji">{img}</span>
					</div>
				{:else}
					<div class="letter-bg" style:background-color={bgColor}>
						<span class="letter" style:color={textColor}>{firstLetter}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if images.length > 1}
		{#if activeIndex > 0}
			<button class="arrow arrow-prev" onclick={prev} aria-label="Previous image">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
			</button>
		{/if}
		{#if activeIndex < images.length - 1}
			<button class="arrow arrow-next" onclick={next} aria-label="Next image">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 6 15 12 9 18"/>
				</svg>
			</button>
		{/if}
		<div class="dots">
			{#each images as _, i}
				<button
					class="dot"
					class:active={i === activeIndex}
					onclick={(e) => goTo(e, i)}
					aria-label="Go to image {i + 1}"
				></button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.carousel {
		position: relative;
		overflow: hidden;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.carousel-track {
		display: flex;
		width: 100%;
		height: 100%;
	}

	.carousel-slide {
		min-width: 100%;
		width: 100%;
		height: 100%;
	}

	.carousel-slide img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.emoji-bg,
	.letter-bg {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.emoji {
		font-size: 4rem;
		line-height: 1;
	}

	.letter {
		font-size: 4rem;
		font-weight: 700;
		line-height: 1;
		opacity: 0.8;
	}

	.arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.85);
		border: none;
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: opacity 200ms ease;
		color: #333;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
	}

	.carousel:hover .arrow {
		opacity: 1;
	}

	/* Always visible on touch devices */
	@media (hover: none) {
		.arrow {
			opacity: 0.9;
		}
	}

	.arrow-prev {
		left: 8px;
	}

	.arrow-next {
		right: 8px;
	}

	.arrow:hover {
		background: rgba(255, 255, 255, 1);
	}

	.dots {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 6px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.5);
		padding: 0;
		cursor: pointer;
		transition: background 200ms ease;
	}

	.dot.active {
		background: rgba(255, 255, 255, 0.95);
	}

	.dot:hover {
		background: rgba(255, 255, 255, 0.8);
	}
</style>

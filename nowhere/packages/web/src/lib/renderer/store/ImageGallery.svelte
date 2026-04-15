<script lang="ts">
	import { fade } from 'svelte/transition';
	import { nameToColor, nameToTextColor } from '../utils/colors.js';

	interface Props {
		images: string[];
		name: string;
		startIndex: number;
		onclose: () => void;
		onchange: (index: number) => void;
	}

	let { images, name, startIndex, onclose, onchange }: Props = $props();

	let currentIndex = $state(startIndex);
	let dragging = $state(false);
	let dragOffset = $state(0);
	let startX = 0;
	let thumbnailContainer: HTMLDivElement | undefined = $state();

	const bgColor = $derived(nameToColor(name));
	const textColor = $derived(nameToTextColor(name));
	const firstLetter = $derived(name.charAt(0).toUpperCase());

	function isEmoji(img: string) {
		return !!img && !img.startsWith('http');
	}

	function isUrl(img: string) {
		return !!img && img.startsWith('http');
	}

	function goTo(i: number) {
		currentIndex = i;
		onchange(i);
		scrollThumbnailIntoView(i);
	}

	function prev() {
		if (currentIndex > 0) goTo(currentIndex - 1);
	}

	function next() {
		if (currentIndex < images.length - 1) goTo(currentIndex + 1);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		} else if (e.key === 'ArrowLeft') {
			prev();
		} else if (e.key === 'ArrowRight') {
			next();
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		dragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!dragging) return;
		let delta = e.touches[0].clientX - startX;
		if ((currentIndex === 0 && delta > 0) || (currentIndex === images.length - 1 && delta < 0)) {
			delta *= 0.3;
		}
		dragOffset = delta;
	}

	function handleTouchEnd() {
		if (!dragging) return;
		dragging = false;
		if (Math.abs(dragOffset) > 50) {
			if (dragOffset < 0 && currentIndex < images.length - 1) {
				goTo(currentIndex + 1);
			} else if (dragOffset > 0 && currentIndex > 0) {
				goTo(currentIndex - 1);
			}
		}
		dragOffset = 0;
	}

	function scrollThumbnailIntoView(i: number) {
		if (!thumbnailContainer) return;
		const thumb = thumbnailContainer.children[i] as HTMLElement;
		if (thumb) {
			thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gallery-overlay" transition:fade={{ duration: 200 }} onclick={handleBackdrop}>
	<div class="gallery-header">
		<span class="gallery-counter">{currentIndex + 1} / {images.length}</span>
		<button class="gallery-close" onclick={onclose} aria-label="Close gallery">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>

	<div
		class="gallery-main"
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		onclick={handleBackdrop}
	>
		{#if currentIndex > 0}
			<button class="gallery-arrow gallery-arrow-prev" onclick={prev} aria-label="Previous image">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
			</button>
		{/if}

		<div class="gallery-track-wrapper">
			<div
				class="gallery-track"
				style:transform="translateX(calc(-{currentIndex} * 100% + {dragOffset}px))"
				style:transition={dragging ? 'none' : 'transform 300ms ease'}
			>
				{#each images as img, i}
					<div class="gallery-slide" onclick={(e) => e.stopPropagation()}>
						{#if isUrl(img)}
							<img src={img} alt="{name} - image {i + 1}" />
						{:else if isEmoji(img)}
							<div class="gallery-emoji-bg" style:background-color={bgColor}>
								<span class="gallery-emoji">{img}</span>
							</div>
						{:else}
							<div class="gallery-letter-bg" style:background-color={bgColor}>
								<span class="gallery-letter" style:color={textColor}>{firstLetter}</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if currentIndex < images.length - 1}
			<button class="gallery-arrow gallery-arrow-next" onclick={next} aria-label="Next image">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 6 15 12 9 18"/>
				</svg>
			</button>
		{/if}
	</div>

	{#if images.length > 1}
		<div class="gallery-thumbnails" bind:this={thumbnailContainer}>
			{#each images as img, i}
				<button
					class="thumbnail"
					class:active={i === currentIndex}
					onclick={() => goTo(i)}
					aria-label="View image {i + 1}"
				>
					{#if isUrl(img)}
						<img src={img} alt="" />
					{:else if isEmoji(img)}
						<span class="thumb-emoji">{img}</span>
					{:else}
						<span class="thumb-letter" style:color={textColor} style:background-color={bgColor}>{firstLetter}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.gallery-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.92);
		display: flex;
		flex-direction: column;
	}

	.gallery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		flex-shrink: 0;
	}

	.gallery-counter {
		color: rgba(255, 255, 255, 0.85);
		font-size: 14px;
		font-weight: 500;
	}

	.gallery-close {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.85);
		cursor: pointer;
		padding: 4px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.gallery-close:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}

	.gallery-main {
		flex: 1;
		display: flex;
		align-items: center;
		position: relative;
		min-height: 0;
	}

	.gallery-track-wrapper {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.gallery-track {
		display: flex;
		height: 100%;
	}

	.gallery-slide {
		min-width: 100%;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.gallery-slide img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 4px;
	}

	.gallery-emoji-bg,
	.gallery-letter-bg {
		width: 200px;
		height: 200px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.gallery-emoji {
		font-size: 6rem;
		line-height: 1;
	}

	.gallery-letter {
		font-size: 6rem;
		font-weight: 700;
		line-height: 1;
		opacity: 0.8;
	}

	.gallery-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 50%;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #fff;
		z-index: 1;
		transition: background 200ms ease;
	}

	.gallery-arrow:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.gallery-arrow-prev {
		left: 12px;
	}

	.gallery-arrow-next {
		right: 12px;
	}

	.gallery-thumbnails {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
		overflow-x: auto;
		justify-content: center;
		flex-shrink: 0;
		-webkit-overflow-scrolling: touch;
	}

	.thumbnail {
		width: 56px;
		height: 56px;
		border-radius: 6px;
		overflow: hidden;
		border: 2px solid transparent;
		background: rgba(255, 255, 255, 0.1);
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color 200ms ease;
	}

	.thumbnail.active {
		border-color: #fff;
	}

	.thumbnail:hover:not(.active) {
		border-color: rgba(255, 255, 255, 0.4);
	}

	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-emoji {
		font-size: 1.5rem;
		line-height: 1;
	}

	.thumb-letter {
		font-size: 1.2rem;
		font-weight: 700;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>

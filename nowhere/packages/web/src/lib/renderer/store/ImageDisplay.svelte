<script lang="ts">
	import { nameToColor, nameToTextColor } from '../utils/colors.js';
	import { sanitizeImageUrl } from '../utils/sanitize-url.js';

	interface Props {
		image?: string;
		name: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let { image, name, size = 'md' }: Props = $props();

	const firstImage = $derived(image?.split(' ').filter(Boolean)[0] ?? '');
	const isEmoji = $derived(!!firstImage && !firstImage.startsWith('http'));
	const isUrl = $derived(!!sanitizeImageUrl(firstImage));
	const firstLetter = $derived(name.charAt(0).toUpperCase());
	const bgColor = $derived(nameToColor(name));
	const textColor = $derived(nameToTextColor(name));

	const fontSizes = { sm: '1.5rem', md: '3rem', lg: '4rem' };
	const emojiSizes = { sm: '2rem', md: '3rem', lg: '4rem' };
</script>

<div class="image-display image-display--{size}">
	{#if isUrl}
		<img src={sanitizeImageUrl(firstImage)} alt={name} loading="lazy" />
	{:else if isEmoji}
		<div class="emoji-bg" style:background-color={bgColor}>
			<span class="emoji" style:font-size={emojiSizes[size]}>{firstImage}</span>
		</div>
	{:else}
		<div class="letter-bg" style:background-color={bgColor}>
			<span class="letter" style:font-size={fontSizes[size]} style:color={textColor}>
				{firstLetter}
			</span>
		</div>
	{/if}
</div>

<style>
	.image-display {
		width: 100%;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: var(--radius-md) var(--radius-md) 0 0;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
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
		line-height: 1;
	}

	.letter {
		font-weight: 700;
		line-height: 1;
		opacity: 0.8;
	}
</style>

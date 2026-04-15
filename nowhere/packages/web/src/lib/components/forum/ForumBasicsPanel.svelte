<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import NpubInput from '../NpubInput.svelte';
	import HintIcon from '../HintIcon.svelte';
	import SvgImageInput from '../SvgImageInput.svelte';
	import RelayAdvancedSection from '../RelayAdvancedSection.svelte';
	import { generateMonogram, nameToInitials } from '$lib/utils/monogram';
	import { minifySvg } from '$lib/utils/svg';
	import type { MonogramShape, MonogramFont } from '$lib/utils/monogram';

	interface Props {
		pubkey: string;
		name: string;
		description: string;
		image: string;
		tags: Tag[];
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, name, description, image, tags, onUpdate }: Props = $props();

	const identityMode = $derived(parseInt(tags.find(t => t.key === 'i')?.value ?? '1', 10));

	// ─── Monogram generator ───
	let monoLetters = $state('');
	let monoBg = $state('#2563eb');
	let monoTextColor = $state('#ffffff');
	let monoShape = $state<MonogramShape>('circle');
	let monoFont = $state<MonogramFont>('sans-serif');
	let monoSize = $state(0.40);
	let lettersManuallyEdited = $state(false);

	$effect(() => {
		if (!lettersManuallyEdited) {
			monoLetters = nameToInitials(name);
		}
	});

	function applyMonogram() {
		const svg = generateMonogram(monoLetters || '?', monoBg, monoShape, monoFont, monoTextColor, monoSize);
		onUpdate('image', minifySvg(svg));
	}
</script>

<div class="panel">
	<h3>Forum</h3>

	<section class="field-group">
		<label for="fm-pubkey">Public Key <HintIcon tip="Your Nostr public key (npub). Used for verification and as the forum owner identity." /></label>
		<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} />
	</section>

	<section class="field-group">
		<label for="fm-name">Forum Name <span class="required">*</span></label>
		<input
			id="fm-name"
			type="text"
			value={name}
			onchange={(e) => onUpdate('name', e.currentTarget.value)}
			placeholder="My Forum"
		/>
	</section>

	<section class="field-group">
		<label for="fm-desc">
			Description			<HintIcon tip="A short description shown in the forum header." />
		</label>
		<textarea
			id="fm-desc"
			value={description}
			onchange={(e) => onUpdate('description', e.currentTarget.value)}
			placeholder="What is this forum about?"
			rows="3"
		></textarea>
	</section>

	<section class="field-group">
		<label for="fm-image">
			Icon			<HintIcon tip="Small icon shown in the forum header. Enter an image URL, paste SVG, or upload an SVG file." />
		</label>
		<SvgImageInput value={image} onUpdate={(v) => onUpdate('image', v)} placeholder="https://… or paste SVG" />
		<div class="monogram-tool">
			<span class="monogram-label">Generate monogram</span>
			<div class="monogram-row">
				<input
					class="mono-letters"
					type="text"
					maxlength="4"
					value={monoLetters}
					placeholder="AB"
					oninput={(e) => {
						lettersManuallyEdited = true;
						monoLetters = e.currentTarget.value.toUpperCase().slice(0, 4);
					}}
					aria-label="Monogram letters"
				/>
				<input class="mono-color" type="color" value={monoBg} oninput={(e) => (monoBg = e.currentTarget.value)} aria-label="Background color" title="Background color" />
				<input class="mono-color" type="color" value={monoTextColor} oninput={(e) => (monoTextColor = e.currentTarget.value)} aria-label="Text color" title="Text color" />
				<div class="shape-btns" role="group" aria-label="Shape">
					<button class="shape-btn" class:active={monoShape === 'circle'} onclick={() => (monoShape = 'circle')} title="Circle" aria-pressed={monoShape === 'circle'}>○</button>
					<button class="shape-btn" class:active={monoShape === 'rounded'} onclick={() => (monoShape = 'rounded')} title="Rounded square" aria-pressed={monoShape === 'rounded'}>▣</button>
					<button class="shape-btn" class:active={monoShape === 'square'} onclick={() => (monoShape = 'square')} title="Square" aria-pressed={monoShape === 'square'}>□</button>
				</div>
			</div>
			<div class="monogram-row">
				<input class="mono-size" type="range" min="0.1" max="1.5" step="0.02" value={monoSize} oninput={(e) => (monoSize = parseFloat(e.currentTarget.value))} aria-label="Font size" />
				<div class="font-btns" role="group" aria-label="Font">
					<button class="font-btn" class:active={monoFont === 'sans-serif'} onclick={() => (monoFont = 'sans-serif')} aria-pressed={monoFont === 'sans-serif'}>Sans</button>
					<button class="font-btn font-serif" class:active={monoFont === 'serif'} onclick={() => (monoFont = 'serif')} aria-pressed={monoFont === 'serif'}>Serif</button>
					<button class="font-btn font-mono" class:active={monoFont === 'monospace'} onclick={() => (monoFont = 'monospace')} aria-pressed={monoFont === 'monospace'}>Mono</button>
				</div>
				<button class="use-btn" onclick={applyMonogram} disabled={!monoLetters.trim()}>Use</button>
			</div>
		</div>

	</section>

	<RelayAdvancedSection
		{tags}
		onUpdate={(newTags) => onUpdate('tags', newTags)}
		primaryLabel="Event relays"
		primaryHint="Relays where forum posts, replies, and chat messages are stored and fetched. These carry the content of the forum."
		secondaryLabel="Profile relays"
		secondaryHint="Relays used to look up Nostr user profiles (display names, avatars). Only used when identity mode allows real profiles."
		showSecondary={identityMode !== 2}
	/>
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

	.required {
		color: var(--color-danger, #dc2626);
	}

	.field-group > input,
	.field-group > textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		resize: vertical;
	}

	.field-group > input:focus,
	.field-group > textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.monogram-tool {
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.monogram-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.monogram-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.mono-letters {
		width: 3rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 700;
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--color-bg);
		color: var(--color-text);
		font-family: inherit;
	}

	.mono-letters:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.mono-color {
		width: 2.5rem;
		height: 2rem;
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		background: none;
	}

	.shape-btns {
		display: flex;
		gap: 2px;
	}

	.shape-btn {
		width: 28px;
		height: 28px;
		border: 1px solid var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		font-size: 1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0;
	}

	.shape-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.shape-btn.active {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

	.use-btn {
		margin-left: auto;
		padding: var(--space-1) var(--space-3);
		background: var(--color-primary);
		color: var(--color-primary-text);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
	}

	.use-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.use-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.mono-size {
		flex: 1;
		cursor: pointer;
		accent-color: var(--color-primary);
	}

	.font-btns {
		display: flex;
		gap: 2px;
	}

	.font-btn {
		padding: 0 var(--space-2);
		height: 28px;
		border: 1px solid var(--color-border);
		background: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		color: var(--color-text-secondary);
		font-family: sans-serif;
		white-space: nowrap;
	}

	.font-btn.font-serif {
		font-family: serif;
	}

	.font-btn.font-mono {
		font-family: monospace;
	}

	.font-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.font-btn.active {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-primary-text);
	}

</style>

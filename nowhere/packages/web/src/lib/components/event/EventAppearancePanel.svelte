<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	function getTagValue(key: string): string {
		return tags.find((t) => t.key === key)?.value ?? '';
	}

	function setTagValue(key: string, value: string) {
		const newTags = tags.filter((t) => t.key !== key);
		if (value) newTags.push({ key, value });
		onUpdate(newTags);
	}

	const preset = $derived(getTagValue('T') || 'g');
	const accentColour = $derived(getTagValue('C'));

	const PRESETS = [
		{
			code: 'g',
			name: 'Generic',
			description: 'Clean and readable. Works for any event. Gets out of the way.'
		},
		{
			code: 'u',
			name: 'Underground',
			description: 'Black background, neon accents, dense grid layout. Club nights, raves, electronic music.'
		},
		{
			code: 'd',
			name: 'Declaration',
			description: 'Enormous type. Stark and urgent. Protests, rallies, open calls, political meetings.'
		},
		{
			code: 'w',
			name: 'Warm',
			description: 'Ornamental borders, serif type, cream tones. Festivals, fairs, celebrations, community events.'
		},
		{
			code: 'r',
			name: 'Refined',
			description: 'Generous space, restrained elegance. Gallery openings, private dinners, literary events.'
		},
		{
			code: 'm',
			name: 'Monumental',
			description: 'Full-bleed image, enormous centred title. Stadiums, major conferences, solemn gatherings.'
		},
		{
			code: 'b',
			name: 'Broadcast',
			description: 'Vivid saturated background, heavy type. Sports events, tournaments, high-energy drives.'
		}
	];

	const PRESET_DEFAULTS: Record<string, string> = {
		g: '2563EB',
		u: '00FF99',
		d: 'DC2626',
		w: 'D97706',
		r: '1B4F72',
		m: 'F59E0B',
		b: 'EF4444'
	};

	// Colour picker value: user's saved colour, or default for current preset
	const colourPickerValue = $derived(
		'#' + (accentColour || PRESET_DEFAULTS[preset] || '2563EB')
	);

	function handlePresetChange(code: string) {
		// When switching preset, clear any stored accent colour so the
		// new preset's default takes effect in the preview
		const newTags = tags.filter((t) => t.key !== 'T' && t.key !== 'C');
		newTags.push({ key: 'T', value: code });
		onUpdate(newTags);
	}

	function handleColourChange(e: Event) {
		const hex = (e.currentTarget as HTMLInputElement).value.replace('#', '').toUpperCase();
		setTagValue('C', hex);
	}

	function resetColour() {
		const newTags = tags.filter((t) => t.key !== 'C');
		onUpdate(newTags);
	}
</script>

<div class="panel">
	<h3>Appearance</h3>
	<p class="panel-intro">Choose a visual style for your event. This is the personality of the poster — pick it first, then fill in your details.</p>

	<section class="field-group">
		<label>Style <HintIcon tip="Each style is a completely different visual language. The live preview on the right shows exactly how your event will look." /></label>
		<div class="preset-list" role="radiogroup" aria-label="Event style">
			{#each PRESETS as p}
				<button
					class="preset-option"
					class:active={preset === p.code}
					role="radio"
					aria-checked={preset === p.code}
					onclick={() => handlePresetChange(p.code)}
				>
					<span class="preset-name">{p.name}</span>
					<span class="preset-desc">{p.description}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="field-group">
		<label for="ev-colour">
			Accent Colour
			<HintIcon tip="Applied throughout the design as the primary highlight colour. Each style has a strong default — only override if you need a specific colour." />
		</label>
		<div class="colour-row">
			<input
				id="ev-colour"
				type="color"
				value={colourPickerValue}
				oninput={handleColourChange}
				aria-label="Accent colour picker"
			/>
			<span class="colour-hex">{colourPickerValue.toUpperCase()}</span>
			{#if accentColour}
				<button class="colour-reset" onclick={resetColour} title="Reset to style default">
					Reset to default
				</button>
			{:else}
				<span class="colour-default-note">Using style default</span>
			{/if}
		</div>
		<div class="colour-swatch-row">
			{#each Object.entries(PRESET_DEFAULTS) as [code, hex]}
				{#if code === preset}
					<span class="colour-swatch-label">Default for {PRESETS.find(p => p.code === code)?.name}:</span>
					<span class="colour-swatch" style="background: #{hex};" title="#{hex}"></span>
				{/if}
			{/each}
		</div>
	</section>
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

	.panel-intro {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field-group > label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.preset-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.preset-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: border-color 0.15s, background 0.15s;
	}

	.preset-option:hover {
		border-color: var(--color-primary);
	}

	.preset-option.active {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.preset-name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.preset-option.active .preset-name {
		color: var(--color-primary);
	}

	.preset-desc {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.4;
	}

	.colour-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.colour-row input[type="color"] {
		width: 2.5rem;
		height: 2rem;
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		background: none;
	}

	.colour-hex {
		font-size: var(--text-sm);
		font-family: monospace;
		color: var(--color-text-secondary);
	}

	.colour-reset {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 2px var(--space-2);
		cursor: pointer;
	}

	.colour-reset:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.colour-default-note {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.colour-swatch-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.colour-swatch-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.colour-swatch {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 1px solid rgba(0,0,0,0.1);
	}
</style>

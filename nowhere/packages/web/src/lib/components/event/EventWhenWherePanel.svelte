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

	// Codec format: YYYYMMDDHHmm (12 chars)
	// UI format: separate date (YYYY-MM-DD) and time (HH:MM) inputs
	function toCodecDatetime(date: string, time: string): string {
		if (!date) return '';
		const d = date.replace(/-/g, '');       // YYYYMMDD
		const t = (time || '00:00').replace(':', ''); // HHmm
		return d + t;
	}

	function fromCodecDate(codec: string): string {
		if (!codec || codec.length < 8) return '';
		return `${codec.slice(0, 4)}-${codec.slice(4, 6)}-${codec.slice(6, 8)}`;
	}

	function fromCodecTime(codec: string): string {
		if (!codec || codec.length < 12) return '';
		return `${codec.slice(8, 10)}:${codec.slice(10, 12)}`;
	}

	const startCodec = $derived(getTagValue('D'));
	const endCodec = $derived(getTagValue('d'));

	let startDate = $state(fromCodecDate(startCodec));
	let startTime = $state(fromCodecTime(startCodec) || '19:00');
	let endDate = $state(fromCodecDate(endCodec));
	let endTime = $state(fromCodecTime(endCodec) || '22:00');
	let hasEndTime = $state(!!endCodec);

	function handleStartDate(v: string) {
		startDate = v;
		setTagValue('D', toCodecDatetime(v, startTime));
	}

	function handleStartTime(v: string) {
		startTime = v;
		if (startDate) setTagValue('D', toCodecDatetime(startDate, v));
	}

	function handleEndDate(v: string) {
		endDate = v;
		if (v) setTagValue('d', toCodecDatetime(v, endTime));
		else setTagValue('d', '');
	}

	function handleEndTime(v: string) {
		endTime = v;
		if (endDate) setTagValue('d', toCodecDatetime(endDate, v));
	}

	function toggleEndTime() {
		hasEndTime = !hasEndTime;
		if (!hasEndTime) setTagValue('d', '');
	}

	const venueName = $derived(getTagValue('L'));
	const venueAddress = $derived(getTagValue('l'));
	const onlineUrl = $derived(getTagValue('O'));
</script>

<div class="panel">
	<h3>When &amp; Where</h3>

	<section class="field-group">
		<label>Start <span class="required">*</span></label>
		<div class="datetime-row">
			<input
				type="date"
				value={startDate}
				onchange={(e) => handleStartDate(e.currentTarget.value)}
				aria-label="Start date"
			/>
			<input
				type="time"
				value={startTime}
				onchange={(e) => handleStartTime(e.currentTarget.value)}
				aria-label="Start time"
			/>
		</div>
	</section>

	<section class="field-group">
		<div class="end-toggle-row">
			<label>End time</label>
			<button class="toggle-btn" onclick={toggleEndTime}>
				{hasEndTime ? 'Remove' : 'Add end time'}
			</button>
		</div>
		{#if hasEndTime}
			<div class="datetime-row">
				<input
					type="date"
					value={endDate || startDate}
					onchange={(e) => handleEndDate(e.currentTarget.value)}
					aria-label="End date"
				/>
				<input
					type="time"
					value={endTime}
					onchange={(e) => handleEndTime(e.currentTarget.value)}
					aria-label="End time"
				/>
			</div>
		{/if}
	</section>

	<section class="field-group">
		<label for="ev-venue">
			Venue			<HintIcon tip="Name of the venue or location." />
		</label>
		<input
			id="ev-venue"
			type="text"
			value={venueName}
			onchange={(e) => setTagValue('L', e.currentTarget.value)}
			placeholder="Venue name"
		/>
	</section>

	<section class="field-group">
		<label for="ev-address">
			Address			<HintIcon tip="Street address or city. Shown below the venue name." />
		</label>
		<input
			id="ev-address"
			type="text"
			value={venueAddress}
			onchange={(e) => setTagValue('l', e.currentTarget.value)}
			placeholder="Street, city, postcode"
		/>
	</section>

	<section class="field-group">
		<label for="ev-online">
			Online / Stream Link			<HintIcon tip="For virtual or hybrid events. A link to where the event can be watched or attended online." />
		</label>
		<input
			id="ev-online"
			type="url"
			value={onlineUrl}
			onchange={(e) => setTagValue('O', e.currentTarget.value)}
			placeholder="https://..."
		/>
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

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-group label,
	.end-toggle-row label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.required {
		color: var(--color-danger, #dc2626);
	}

	.field-group input {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.field-group input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.datetime-row {
		display: flex;
		gap: var(--space-2);
	}

	.datetime-row input[type="date"] {
		flex: 1;
	}

	.datetime-row input[type="time"] {
		width: 7rem;
		flex-shrink: 0;
	}

	.end-toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.toggle-btn {
		font-size: var(--text-xs);
		color: var(--color-primary);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}

	.toggle-btn:hover {
		text-decoration: underline;
	}
</style>

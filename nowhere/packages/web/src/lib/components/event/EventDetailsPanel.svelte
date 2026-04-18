<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import HintIcon from '../HintIcon.svelte';
	import ContactDetailsPanel from '../ContactDetailsPanel.svelte';

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

	const body = $derived(getTagValue('b'));
	const admissionRaw = $derived(getTagValue('$'));
	const admissionCurrency = $derived(getTagValue('K'));
	const rsvpUrl = $derived(getTagValue('r'));
	const agenda = $derived(getTagValue('A'));
	const capacity = $derived(getTagValue('q'));
	const ageRestriction = $derived(getTagValue('R'));
	const dressCode = $derived(getTagValue('v'));

	// Admission: store in cents, show in base units
	const admissionDisplay = $derived(
		admissionRaw === '0' ? '0' : admissionRaw ? String(parseInt(admissionRaw, 10) / 100) : ''
	);

	function handleAdmission(v: string) {
		const trimmed = v.trim();
		if (!trimmed) { setTagValue('$', ''); return; }
		const num = parseFloat(trimmed);
		if (isNaN(num)) return;
		setTagValue('$', String(Math.round(num * 100)));
	}

	// Lineup: pipe-separated in tag P, list in UI
	const lineupRaw = $derived(getTagValue('P'));
	const lineup = $derived(
		lineupRaw ? lineupRaw.split('\\p').map(n => n.replace(/\\(.)/g, (_, c) => {
			const map: Record<string, string> = { d: '.', c: ',', s: ';', q: '"', o: ':', l: '<', '\\': '\\' };
			return map[c] ?? c;
		})) : []
	);

	let lineupInput = $state('');
	let lineupRoleInput = $state('');

	function escapeLineupPart(s: string): string {
		return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\p').replace(/\./g, '\\d').replace(/:/g, '\\o');
	}

	function addLineupEntry() {
		const name = lineupInput.trim();
		if (!name) return;
		const role = lineupRoleInput.trim();
		const entry = role
			? escapeLineupPart(name) + ':' + escapeLineupPart(role)
			: escapeLineupPart(name);
		const current = getTagValue('P');
		setTagValue('P', current ? current + '\\p' + entry : entry);
		lineupInput = '';
		lineupRoleInput = '';
	}

	function removeLineupEntry(index: number) {
		const parts = lineupRaw ? lineupRaw.split('\\p') : [];
		parts.splice(index, 1);
		setTagValue('P', parts.join('\\p'));
	}

	function updateLineupEntry(index: number, name: string, role: string) {
		const parts = lineupRaw ? lineupRaw.split('\\p') : [];
		const trimmedName = name.trim();
		if (!trimmedName) {
			removeLineupEntry(index);
			return;
		}
		const trimmedRole = role.trim();
		parts[index] = trimmedRole
			? escapeLineupPart(trimmedName) + ':' + escapeLineupPart(trimmedRole)
			: escapeLineupPart(trimmedName);
		setTagValue('P', parts.join('\\p'));
	}

	function handleLineupKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); addLineupEntry(); }
	}

	// Parse stored entry for display in the builder list
	function parseLineupDisplay(raw: string): { name: string; role: string } {
		const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) =>
			({ d: '.', c: ',', s: ';', q: '"', o: ':', l: '<', '\\': '\\' }[c] ?? c));
		let i = 0;
		while (i < raw.length) {
			if (raw[i] === '\\') { i += 2; continue; }
			if (raw[i] === ':') return { name: unescape(raw.slice(0, i)), role: unescape(raw.slice(i + 1)) };
			i++;
		}
		return { name: unescape(raw), role: '' };
	}

	const lineupParsed = $derived(
		lineupRaw ? lineupRaw.split('\\p').map(parseLineupDisplay) : []
	);

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'CHF', 'BTC', 'SATS'];
</script>

<div class="panel">
	<h3>Details</h3>

	<section class="field-group">
		<label for="ev-body">
			Description			<HintIcon tip="Full details about the event. Shown as the main body of the event page. Links supported: [label](https://example.com)" />
		</label>
		<textarea
			id="ev-body"
			value={body}
			onchange={(e) => setTagValue('b', e.currentTarget.value)}
			placeholder="Tell people what to expect..."
			rows="5"
		></textarea>
	</section>

	<section class="field-group">
		<label>Admission</label>
		<div class="admission-row">
			<input
				type="number"
				min="0"
				step="0.01"
				value={admissionDisplay}
				onchange={(e) => handleAdmission(e.currentTarget.value)}
				placeholder="0 = Free"
				aria-label="Admission price"
				class="admission-price"
			/>
			<select
				value={admissionCurrency}
				onchange={(e) => setTagValue('K', e.currentTarget.value)}
				aria-label="Currency"
				class="admission-currency"
			>
				<option value="">Currency</option>
				{#each CURRENCIES as c}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</div>
		<p class="field-hint">Leave blank if admission is not applicable. Enter 0 for a free event.</p>
	</section>

	<section class="field-group">
		<label for="ev-rsvp">
			RSVP / Tickets			<HintIcon tip="A URL for tickets or registration, or plain text like 'Free entry' or 'Tickets at the door'." />
		</label>
		<input
			id="ev-rsvp"
			type="text"
			value={rsvpUrl}
			onchange={(e) => setTagValue('r', e.currentTarget.value)}
			placeholder="https://... or 'Tickets at the door'"
		/>
	</section>

	<section class="field-group">
		<label>
			Lineup / Speakers			<HintIcon tip="Add performers, speakers, or guests one at a time." />
		</label>
		{#if lineupParsed.length > 0}
			<ul class="lineup-list">
				{#each lineupParsed as entry, i (i)}
					<li class="lineup-item">
						<input
							type="text"
							value={entry.name}
							onchange={(e) => updateLineupEntry(i, e.currentTarget.value, entry.role)}
							placeholder="Name"
							aria-label="Name"
							class="lineup-edit-name"
						/>
						<input
							type="text"
							value={entry.role}
							onchange={(e) => updateLineupEntry(i, entry.name, e.currentTarget.value)}
							placeholder="Role / subtitle (optional)"
							aria-label="Role"
							class="lineup-edit-role"
						/>
						<button class="remove-btn" onclick={() => removeLineupEntry(i)} aria-label="Remove {entry.name}">×</button>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="lineup-add-row">
			<input
				type="text"
				bind:value={lineupInput}
				onkeydown={handleLineupKeydown}
				placeholder="Name"
				aria-label="Lineup name"
			/>
			<input
				type="text"
				bind:value={lineupRoleInput}
				onkeydown={handleLineupKeydown}
				placeholder="Role / subtitle (optional)"
				aria-label="Lineup role"
				class="role-input"
			/>
			<button class="add-btn" onclick={addLineupEntry} disabled={!lineupInput.trim()}>Add</button>
		</div>
	</section>

	<section class="field-group">
		<label for="ev-agenda">
			Schedule / Agenda			<HintIcon tip="Running order or timetable. Freeform text. Links supported: [label](https://example.com)" />
		</label>
		<textarea
			id="ev-agenda"
			value={agenda}
			onchange={(e) => setTagValue('A', e.currentTarget.value)}
			placeholder="6:00 PM – Doors open&#10;7:00 PM – Support act&#10;9:00 PM – Headline"
			rows="4"
		></textarea>
	</section>

	<section class="field-group details-row">
		<div class="field-group">
			<label for="ev-capacity">
				Capacity			</label>
			<input
				id="ev-capacity"
				type="number"
				min="1"
				value={capacity}
				onchange={(e) => setTagValue('q', e.currentTarget.value)}
				placeholder="Max attendees"
			/>
		</div>
		<div class="field-group">
			<label for="ev-age">
				Age Restriction			</label>
			<input
				id="ev-age"
				type="text"
				value={ageRestriction}
				onchange={(e) => setTagValue('R', e.currentTarget.value)}
				placeholder="18+, All ages…"
			/>
		</div>
		<div class="field-group">
			<label for="ev-dress">
				Dress Code			</label>
			<input
				id="ev-dress"
				type="text"
				value={dressCode}
				onchange={(e) => setTagValue('v', e.currentTarget.value)}
				placeholder="Smart casual, Black tie…"
			/>
		</div>
	</section>

	<ContactDetailsPanel {tags} onUpdate={onUpdate} />
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

.field-group input,
	.field-group textarea,
	.field-group select {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		resize: vertical;
	}

	.field-group input:focus,
	.field-group textarea:focus,
	.field-group select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.admission-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.admission-price {
		flex: 1 1 6rem;
	}

	.admission-currency {
		flex: 0 1 7rem;
		min-width: 5rem;
	}

	.lineup-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.lineup-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.lineup-item input {
		padding: var(--space-1) var(--space-2);
		border: 1px solid transparent;
		background: transparent;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
		min-width: 0;
	}

	.lineup-item input:focus {
		outline: none;
		border-color: var(--color-primary);
		background: var(--color-bg);
	}

	.lineup-edit-name {
		flex: 1 1 auto;
		font-weight: 500;
	}

	.lineup-edit-role {
		flex: 0 1 160px;
		color: var(--color-text-muted);
	}

	.remove-btn {
		background: none;
		border: none;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 0 2px;
	}

	.remove-btn:hover {
		color: var(--color-danger, #dc2626);
	}

	.lineup-add-row {
		display: flex;
		gap: var(--space-2);
	}

	.lineup-add-row input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.role-input {
		flex: 0 1 160px;
	}

	.lineup-add-row input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.add-btn {
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

	.add-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.add-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.details-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
		gap: var(--space-3);
	}
</style>

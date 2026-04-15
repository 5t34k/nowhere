<script lang="ts">
	import type { Tag } from '@nowhere/codec';
	import { parseTipMethods, serializeTipMethods } from '$lib/tips.js';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	const tipMethods = $derived(parseTipMethods(tags.find((t) => t.key === 'l')?.value ?? ''));

	const lightningAddress = $derived(
		tipMethods.find((m) => m.type === 'lightning')?.value ?? ''
	);

	const customMethods = $derived(
		tipMethods.filter((m) => m.type === 'custom')
	);

	function updateTag(methods: { type: 'lightning' | 'custom'; label: string; value: string; showQr?: boolean }[]) {
		const newTags = tags.filter((t) => t.key !== 'l');
		const serialized = serializeTipMethods(methods);
		if (serialized) newTags.push({ key: 'l', value: serialized });
		onUpdate(newTags);
	}

	function setLightningAddress(value: string) {
		const lightning = value ? [{ type: 'lightning' as const, label: 'Lightning', value }] : [];
		updateTag([...lightning, ...customMethods]);
	}

	function addCustomMethod() {
		const lightning = lightningAddress
			? [{ type: 'lightning' as const, label: 'Lightning', value: lightningAddress }]
			: [];
		updateTag([...lightning, ...customMethods, { type: 'custom' as const, label: '', value: '', showQr: false }]);
	}

	function updateCustomAt(index: number, changes: { label?: string; value?: string; showQr?: boolean }) {
		const lightning = lightningAddress
			? [{ type: 'lightning' as const, label: 'Lightning', value: lightningAddress }]
			: [];
		const updated = customMethods.map((m, i) =>
			i === index ? { ...m, ...changes } : m
		);
		updateTag([...lightning, ...updated]);
	}

	function removeCustomAt(index: number) {
		const lightning = lightningAddress
			? [{ type: 'lightning' as const, label: 'Lightning', value: lightningAddress }]
			: [];
		const updated = customMethods.filter((_, i) => i !== index);
		updateTag([...lightning, ...updated]);
	}
</script>

<div class="panel">
	<h3>Tips</h3>

	<section class="field-group">
		<label for="msg-lightning">
			Lightning Address
			<HintIcon tip="A Lightning address where readers can send tips. Shown at the bottom of your message." />
		</label>
		<input
			id="msg-lightning"
			type="text"
			value={lightningAddress}
			onchange={(e) => setLightningAddress(e.currentTarget.value)}
			placeholder="you@lightning.com"
		/>
		<span class="field-hint">
			Readers can send sats directly from the tip dialog.
		</span>
	</section>

	<section class="field-group">
		<label>
			Other Payment Methods
			<HintIcon tip="Add custom payment methods like PayPal, CashApp, Venmo, etc. Readers will see the service name and your handle." />
		</label>

		{#each customMethods as method, i}
			<div class="custom-row">
				<input
					type="text"
					value={method.label}
					onchange={(e) => updateCustomAt(i, { label: e.currentTarget.value })}
					placeholder="Service name"
					class="custom-name"
				/>
				<input
					type="text"
					value={method.value}
					onchange={(e) => updateCustomAt(i, { value: e.currentTarget.value })}
					placeholder="Address, username or ID"
					class="custom-handle"
				/>
				<label class="custom-qr-toggle" title="Show QR code for this value">
					<input type="checkbox" checked={method.showQr ?? false} onchange={() => updateCustomAt(i, { showQr: !method.showQr })} />
					QR
				</label>
				<button class="custom-remove" onclick={() => removeCustomAt(i)} aria-label="Remove payment method">&times;</button>
			</div>
		{/each}

		<button class="add-method" onclick={addCustomMethod}>+ Add payment method</button>
		<span class="field-hint">
			e.g. PayPal, CashApp, Venmo — enter the service name and your handle.
		</span>
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

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.field-group input {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.field-group input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: 10px;
		color: var(--color-text-muted);
	}

	.custom-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.custom-name {
		width: 120px;
		flex-shrink: 0;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.custom-name:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.custom-handle {
		flex: 1;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.custom-handle:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.custom-remove {
		border: none;
		background: none;
		padding: 0;
		font-size: 13px;
		color: var(--color-text-muted);
		cursor: pointer;
		line-height: 1;
	}

	.custom-remove:hover {
		color: var(--color-error);
	}

	.custom-qr-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		cursor: pointer;
	}

	.add-method {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		text-align: left;
	}

	.add-method:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}
</style>

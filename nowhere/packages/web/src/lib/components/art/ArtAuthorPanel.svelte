<script lang="ts">
	import NpubInput from '../NpubInput.svelte';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		pubkey: string;
		attribution: string;
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, attribution, onUpdate }: Props = $props();
</script>

<div class="panel">
	<h3>Author</h3>

	<section class="field-group">
		<label for="art-pubkey">Public Key <HintIcon tip="Your Nostr public key (npub). Adds a verifiable author identity to your artwork." /></label>
		<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} required={false} />
	</section>

	<section class="field-group">
		<label for="art-attribution">
			Attribution
			<HintIcon tip="Display name shown on the artwork. Not cryptographic — use signing for verified authorship." />
		</label>
		<input
			id="art-attribution"
			type="text"
			value={attribution}
			onchange={(e) => onUpdate('attribution', e.currentTarget.value)}
			placeholder="e.g. Artist Name, @handle, anonymous"
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
		font-family: inherit;
	}

	.field-group input:focus {
		outline: none;
		border-color: var(--color-primary);
	}
</style>

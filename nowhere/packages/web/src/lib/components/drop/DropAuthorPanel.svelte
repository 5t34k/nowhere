<script lang="ts">
	import NpubInput from '../NpubInput.svelte';
	import HintIcon from '../HintIcon.svelte';

	interface Props {
		pubkey: string;
		onUpdate: (field: string, value: unknown) => void;
	}

	let { pubkey, onUpdate }: Props = $props();
</script>

<div class="panel">
	<h3>Author</h3>

	<section class="field-group">
		<label for="drop-pubkey">Public Key <HintIcon tip="Your Nostr public key (npub). Adds a verifiable author identity to your drop." /></label>
		<NpubInput value={pubkey} onUpdate={(v) => onUpdate('pubkey', v)} required={false} />
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

</style>

<script lang="ts">
	import type { Tag } from '@nowhere/codec';

	interface Props {
		tags: Tag[];
		onUpdate: (tags: Tag[]) => void;
	}

	let { tags, onUpdate }: Props = $props();

	const inventoryEnabled = $derived(tags.some((t) => t.key === 'k'));

	$effect(() => {
		if (!inventoryEnabled) {
			onUpdate([...tags, { key: 'k', value: '1' }]);
		}
	});
</script>

<div class="panel">
	<h3>Inventory Management</h3>

	<div class="toggle-btn" aria-disabled="true">
		<span class="toggle-track active">
			<span class="toggle-thumb"></span>
		</span>
		<span class="toggle-label">Store and inventory management (required while in beta)</span>
	</div>

	<div class="info-block">
		<h4>What this does</h4>
		<p>
			Your store queries Nostr relays for live stock data each time a buyer opens it. You publish
			updates including stock levels, sold out notices, quantity limits, and store closures directly
			from the <a href="/manage/store" class="manage-link">Manage Store</a> page. Without inventory
			management a store link would be permanent and immutable, with no way to close it or push
			updates to buyers after sharing.
		</p>
		<p>
			Inventory tracking has a privacy cost. Each time a buyer opens your store, their device
			connects to a relay to fetch stock data, and relay operators can log that connection and
			infer that someone is browsing a store at that moment. The relay learns nothing further: no
			store identity, no owner, no item details. All of that lives only in the URL, which never
			touches a relay.
		</p>
	</div>

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

	.toggle-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0;
		border: none;
		background: none;
		cursor: default;
		text-align: left;
	}

	.toggle-track {
		position: relative;
		display: inline-block;
		width: 36px;
		height: 20px;
		background: var(--color-border);
		border-radius: 10px;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.toggle-track.active {
		background: var(--color-primary);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		background: white;
		border-radius: 50%;
		transition: transform var(--transition-fast);
	}

	.toggle-track.active .toggle-thumb {
		transform: translateX(16px);
	}

	.toggle-label {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.info-block {
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
	}

	.info-block p {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.info-block p + p {
		margin-top: var(--space-3);
	}

	.manage-link {
		color: var(--color-primary);
		font-weight: 500;
		text-decoration: none;
	}

	.manage-link:hover {
		text-decoration: underline;
	}



</style>

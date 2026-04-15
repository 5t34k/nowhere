<script lang="ts">
	interface Props {
		siteType: 'store' | 'petition';
	}

	let { siteType }: Props = $props();
</script>

<div class="panel">
	{#if siteType === 'store'}
		<h3>Reading Orders</h3>

		<section class="info-section warning-section">
			<h4>Before you share your store</h4>
			<p>
				Orders placed in your store are encrypted with your public key and published to
				Nostr relays. Only the corresponding private key can decrypt them. There is no
				server, no account, and no support team. If you lose your private key, every
				order becomes permanently unreadable — you will not know what was ordered, where
				to ship it, or who paid you.
			</p>
			<p>
				If that feels uncomfortable, do not share your store link. People will be sending
				you real money. You are solely responsible for being able to read their orders.
			</p>
		</section>

		<section class="info-section">
			<h4>What you need</h4>
			<ul>
				<li>A Nostr browser extension (<span class="mono">nos2x</span>, <span class="mono">Alby</span>, or similar) with the private key that matches the public key in your store settings.</li>
				<li>A desktop browser. Extensions may not work on mobile.</li>
			</ul>
		</section>

		<section class="info-section">
			<h4>Reading your orders</h4>
			<p>
				Go to the manage dashboard. The extension will sign a request to fetch your
				encrypted orders from Nostr relays, then decrypt each one so you can read the
				order details, verify payment amounts, and export to CSV.
			</p>
			<a href="https://hostednowhere.com/manage" target="_blank" rel="noopener noreferrer" class="manage-link">
				hostednowhere.com/manage
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
			</a>
		</section>

		<section class="info-section warning-section">
			<h4>Verifying orders</h4>
			<p>
				Anyone can submit an order without making a payment. Customers can also
				put anything they want in the order details. An order appearing in your
				dashboard does not mean it is legitimate or paid.
			</p>
			<p>
				Before fulfilling any order, verify that the payment was actually received
				and that the amount matches what was owed. The manage dashboard can help
				check amounts, but the payment itself must be confirmed in your own wallet
				or payment provider. Do not ship anything until you have done this.
			</p>
		</section>

		<section class="info-section warning-section">
			<h4>Test first</h4>
			<p>
				Before telling anyone about your store: share the link with yourself, place a
				test order, then go to the manage dashboard and confirm you can decrypt and read
				it. Do not skip this.
			</p>
		</section>

	{:else}
		<h3>Reading Signatures</h3>

		<section class="info-section">
			<p>
				Signatures submitted to your petition are encrypted with your public key and
				published to Nostr relays. Only the corresponding private key can decrypt the
				details of who signed and what they submitted. If you lose your private key,
				all signature details become permanently unreadable.
			</p>
		</section>

		<section class="info-section">
			<h4>What you need</h4>
			<ul>
				<li>A Nostr browser extension (<span class="mono">nos2x</span>, <span class="mono">Alby</span>, or similar) with the private key that matches the public key in your petition settings.</li>
				<li>A desktop browser. Extensions may not work on mobile.</li>
			</ul>
		</section>

		<section class="info-section">
			<h4>Reading your signatures</h4>
			<p>
				Go to the manage dashboard. The extension will sign a request to fetch your
				encrypted signatures from Nostr relays, then decrypt each one so you can see
				signer details, track progress toward your goal, and export to CSV.
			</p>
			<a href="https://hostednowhere.com/manage" target="_blank" rel="noopener noreferrer" class="manage-link">
				hostednowhere.com/manage
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
			</a>
		</section>
	{/if}
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

	h4 {
		font-size: var(--text-sm);
		font-weight: 600;
		margin-bottom: var(--space-2);
	}

	.info-section {
		padding: var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.warning-section {
		background: rgba(220, 38, 38, 0.04);
		border: 1px solid rgba(220, 38, 38, 0.15);
	}

	.info-section p {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	.info-section ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.info-section li {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
		padding-left: var(--space-3);
		position: relative;
	}

	.info-section li::before {
		content: '·';
		position: absolute;
		left: 2px;
		color: var(--color-text-muted);
		font-weight: 700;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-size: 0.9em;
	}

	.manage-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary);
		text-decoration: none;
		margin-top: var(--space-1);
	}

	.manage-link:hover {
		text-decoration: underline;
	}
</style>

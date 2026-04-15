<script lang="ts">
	import { onMount } from 'svelte';
	import { builderState, encodedResult, toStoreData, type BuilderState, type ItemState } from '$lib/stores/builder-state';
	import { decode, serialize } from '@nowhere/codec';
	import { RENDERER_ORIGIN } from '$lib/config.js';
	import BuilderLayout from '$lib/components/BuilderLayout.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import StoreSettingsPanel from '$lib/components/StoreSettingsPanel.svelte';
	import PaymentPanel from '$lib/components/PaymentPanel.svelte';
	import ItemsPanel from '$lib/components/ItemsPanel.svelte';
	import TagsPanel from '$lib/components/TagsPanel.svelte';
	import StorePoliciesPanel from '$lib/components/StorePoliciesPanel.svelte';
	import ContactDetailsPanel from '$lib/components/ContactDetailsPanel.svelte';
	import InventoryPanel from '$lib/components/InventoryPanel.svelte';
	import VerificationPanel from '$lib/components/VerificationPanel.svelte';
	import PublishPanel from '$lib/components/PublishPanel.svelte';
	import ManageInfoPanel from '$lib/components/ManageInfoPanel.svelte';
	import CharacterBudget from '$lib/components/CharacterBudget.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import CompressionView from '$lib/components/CompressionView.svelte';

	let activePanel = $state('settings');
	let showBetaNotice = $state(true);

	const inventoryConfigured = $derived($builderState.tags.some((t) => t.key === 'k'));
	let showImport = $state(false);
	let lastValidLength = $state(0);
	let editorCollapsed = $state(false);
	let mobileShowPreview = $state(false);
	let compressionExpanded = $state(false);

	// Encryption state — lifted here so it survives panel switches
	// Only non-secret data: the toggle and the encrypted output (no password)
	let encryptEnabled = $state(false);
	let encryptedFragment = $state('');
	let encryptedSourceFragment = $state('');

	// Notification for encryption invalidation
	let encryptionAlert = $state(false);
	let alertTimer: ReturnType<typeof setTimeout> | null = null;

	// Invalidate encryption when store data changes
	$effect(() => {
		const currentFragment = $encodedResult?.fragment;
		if (encryptedFragment && currentFragment !== encryptedSourceFragment) {
			encryptedFragment = '';
			encryptedSourceFragment = '';
			encryptEnabled = false;
			// Show notification
			encryptionAlert = true;
			if (alertTimer) clearTimeout(alertTimer);
			alertTimer = setTimeout(() => (encryptionAlert = false), 6000);
		}
	});

	// Derive preview URL from encryption state
	const encryptedPreviewUrl = $derived(
		encryptEnabled && encryptedFragment
			? `/s#${encryptedFragment}`
			: ''
	);

	// Track the actual published URL (may be signed or encrypted) for budget display
	let publishUrl = $state('');
	$effect(() => {
		$encodedResult?.fragment;
		publishUrl = '';
	});
	const activeUrlLength = $derived(
		publishUrl
			? publishUrl.length
			: $encodedResult
				? (RENDERER_ORIGIN + '/s#' + $encodedResult.fragment).length
				: lastValidLength
	);

	// Remember which panel was active before collapsing so we can restore
	let lastActivePanel = $state('settings');

	const PLACEHOLDER_PUBKEY = 'A'.repeat(43);
	const pubkeyIsPlaceholder = $derived($builderState.pubkey === PLACEHOLDER_PUBKEY);

	// Derive weight unit and currency from store tags
	const weightUnit = $derived($builderState.tags.find((t) => t.key === 'w')?.value ?? 'g');
	const storeCurrency = $derived($builderState.tags.find((t) => t.key === '$')?.value ?? 'USD');

	// Track last valid length so the bar doesn't snap to zero
	$effect(() => {
		if ($encodedResult) {
			lastValidLength = (RENDERER_ORIGIN + '/s#' + $encodedResult.fragment).length;
		}
	});

	function handleNavigate(panel: string) {
		if (editorCollapsed) {
			// Reopen editor when a sidebar item is clicked
			editorCollapsed = false;
			activePanel = panel;
		} else if (activePanel === panel) {
			// Clicking the already-active panel collapses the editor
			editorCollapsed = true;
			lastActivePanel = panel;
			activePanel = '';
		} else {
			activePanel = panel;
		}
	}

	function handleToggleCollapse() {
		if (editorCollapsed) {
			editorCollapsed = false;
			activePanel = lastActivePanel || 'settings';
		} else {
			lastActivePanel = activePanel;
			editorCollapsed = true;
			activePanel = '';
		}
	}

	function handleImport(fragment: string) {
		try {
			const data = decode(fragment);
			if (data.siteType !== 'store') {
				console.error(`Import failed: expected a store fragment, got "${data.siteType}"`);
				return;
			}
			builderState.importFromUrl(data);
			showImport = false;
			editorCollapsed = false;
			activePanel = 'settings';
		} catch (e) {
			console.error('Import failed:', e);
		}
	}

	onMount(() => {
		const fragment = window.location.hash.slice(1);
		if (fragment) {
			handleImport(fragment);
			history.replaceState(null, '', window.location.pathname);
		}
	});

	function handleReset() {
		if (confirm('Reset all store data? This cannot be undone.')) {
			builderState.reset();
			lastValidLength = 0;
			encryptEnabled = false;
			encryptedFragment = '';
			encryptedSourceFragment = '';
			editorCollapsed = false;
			activePanel = 'settings';
		}
	}
</script>

<svelte:head>
	<title>Create Store · Nowhere</title>
</svelte:head>

<BuilderLayout {editorCollapsed} onToggleCollapse={handleToggleCollapse} {mobileShowPreview} scrollKey={activePanel}>
	{#snippet sidebar()}
		<Sidebar
			siteType="Store"
			beta
			{activePanel}
			onNavigate={handleNavigate}
			onImport={() => (showImport = true)}
			onReset={handleReset}
			{mobileShowPreview}
			onTogglePreview={() => (mobileShowPreview = !mobileShowPreview)}
		/>
	{/snippet}

	{#snippet editor()}
		{#if activePanel === 'settings'}
			<StoreSettingsPanel
				pubkey={$builderState.pubkey}
				name={$builderState.name}
				description={$builderState.description}
				image={$builderState.image}
				tags={$builderState.tags}
				onUpdate={(field, value) => builderState.updateField(field as keyof BuilderState, value)}
				onGenerateKeypair={() => {}}
			/>
		{:else if activePanel === 'policies'}
			<StorePoliciesPanel
				tags={$builderState.tags}
				onUpdate={(tags) => builderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'contacts'}
			<ContactDetailsPanel
				tags={$builderState.tags}
				onUpdate={(tags) => builderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'payment'}
			<PaymentPanel
				pubkey={$builderState.pubkey}
				paymentMethods={$builderState.paymentMethods}
				customPaymentMethods={$builderState.customPaymentMethods}
				tags={$builderState.tags}
				onUpdate={(field, value) => builderState.updateField(field as keyof BuilderState, value)}
			/>
		{:else if activePanel === 'items'}
			<ItemsPanel
				items={$builderState.items}
				{weightUnit}
				onUpdateItem={(index, field, value) => builderState.updateItem(index, field as keyof ItemState, value)}
				onRemoveItem={(index) => builderState.removeItem(index)}
				onMoveItem={(from, to) => builderState.moveItem(from, to)}
				onCloneItem={(index) => builderState.cloneItem(index)}
				onAddItem={() => builderState.addItem()}
			/>
		{:else if activePanel === 'inventory'}
			<InventoryPanel
				tags={$builderState.tags}
				onUpdate={(tags) => builderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'tags'}
			<TagsPanel
				tags={$builderState.tags}
				{weightUnit}
				{storeCurrency}
				onUpdate={(tags) => builderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'verification'}
			<VerificationPanel
				storeData={toStoreData($builderState)}
				onTagUpdate={(key, value) => {
					builderState.update(s => {
						const tags = s.tags.filter(t => t.key !== key);
						tags.push({ key, value });
						return { ...s, tags };
					});
				}}
			/>
		{:else if activePanel === 'publish'}
			{#if pubkeyIsPlaceholder}
				<div class="pubkey-block">
					<h3>Public key required</h3>
					<p>
						Order details are encrypted with your public key. Without the corresponding private key
						you will not be able to read any order details — they will be permanently unreadable.
					</p>
					<p>
						Set your public key in <button class="pubkey-block-link" onclick={() => handleNavigate('settings')}>Store Settings</button> before sharing.
					</p>
				</div>
			{:else}
				<PublishPanel
					result={$encodedResult}
					{encryptEnabled}
					{encryptedFragment}
					onEncryptToggle={(enabled) => (encryptEnabled = enabled)}
					onEncrypted={(source, encrypted) => { encryptedSourceFragment = source; encryptedFragment = encrypted; }}
					onRemoveEncryption={() => { encryptedFragment = ''; encryptedSourceFragment = ''; }}
					onUrlChange={(url) => (publishUrl = url)}
					expectedPubkey={$builderState.pubkey}
					{inventoryConfigured}
					onNavigateToInventory={() => handleNavigate('inventory')}
				/>
			{/if}
		{:else if activePanel === 'manage'}
			<ManageInfoPanel siteType="store" />
		{/if}
	{/snippet}

	{#snippet preview()}
		<LivePreview result={$encodedResult} openUrl={encryptedPreviewUrl} hideOpenLink />
	{/snippet}

	{#snippet budget()}
		<CharacterBudget
			length={activeUrlLength}
			expanded={compressionExpanded}
			onToggle={() => compressionExpanded = !compressionExpanded}
		>
			<CompressionView serializedText={(() => { try { const d = toStoreData($builderState); return d ? serialize(d) : null; } catch { return null; } })()}  encodedResult={$encodedResult} />
		</CharacterBudget>
	{/snippet}
</BuilderLayout>

{#if showImport}
	<ImportDialog onImport={handleImport} onClose={() => (showImport = false)} />
{/if}

{#if showBetaNotice}
	<div class="beta-notice-overlay" role="dialog" aria-modal="true" aria-label="Stop and read this">
		<div class="beta-notice-dialog">
			<div class="beta-notice-header">
				<div class="beta-notice-eyebrow">Nowhere · Early release</div>
				<h2 class="beta-notice-title">Stop and read this</h2>
			</div>
			<div class="beta-notice-body">
				<p class="beta-notice-lede">
					A nowhere store lets you sell directly to buyers with no platform in between. That is the whole point of it, but it also means every risk of running a shop sits with you. Please read the rest of this carefully before you publish.
				</p>
				<p>
					Orders travel through public relays. Relays have not promised to store orders. An order a buyer pays you for may never reach you, and there is no way to recover it unless the buyer directly provides you with their receipt.
				</p>
				<p>
					An order showing in the manage portal is not proof of anything. There is no way to know that the order is real or that their payment has actually been sent, and you will need to verify both yourself before you ship.
				</p>
				<p>
					There is no dispute system and no refunds path. If something goes wrong between you and a buyer there is no company behind Nowhere to escalate to.
				</p>
				<p>
					Nothing here has been proven under real load or against real adversaries. Testing is not the same as production, and we do not yet know what may break.
				</p>
				<p>
					We do want people to test Nowhere stores with real orders. That is how the system gets proven. If you publish, start with small orders and low-value items. Make sure your contact details are provided so buyers can reach you outside nowhere if their order does not come through or there are any issues.
				</p>
			</div>
			<div class="beta-notice-actions">
				<button class="beta-notice-btn" onclick={() => (showBetaNotice = false)}>I understand, continue</button>
			</div>
		</div>
	</div>
{/if}

{#if encryptionAlert}
	<div class="encrypt-alert" class:dismiss={!encryptionAlert}>
		<div class="encrypt-alert-content">
			<span class="encrypt-alert-icon">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
			</span>
			<div>
				<strong>Encryption disabled</strong>
				<p>Store data changed.<br/>Go to Share Link to re-encrypt.</p>
			</div>
			<button class="encrypt-alert-close" onclick={() => (encryptionAlert = false)}>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.beta-notice-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 15, 0.72);
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		overflow-y: auto;
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}

	.beta-notice-dialog {
		background: #ffffff;
		border-radius: 12px;
		max-width: 620px;
		width: 100%;
		max-height: calc(100vh - 3rem);
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.04);
		overflow: hidden;
	}

	.beta-notice-header {
		padding: 2rem 2rem 1.25rem;
		border-bottom: 1px solid #ececec;
		background:
			linear-gradient(180deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0) 100%);
		position: relative;
	}

	.beta-notice-header::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: #000000;
	}

	.beta-notice-eyebrow {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #000000;
		margin-bottom: 0.5rem;
	}

	.beta-notice-title {
		font-size: 1.625rem;
		font-weight: 700;
		line-height: 1.2;
		color: #1a1a1a;
		letter-spacing: -0.01em;
	}

	.beta-notice-body {
		padding: 1.5rem 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.beta-notice-body p {
		font-size: 0.9375rem;
		line-height: 1.6;
		color: #2a2a2a;
		margin-bottom: 1rem;
	}

	.beta-notice-body p.beta-notice-lede {
		font-size: 1rem;
		color: #1a1a1a;
		font-weight: 500;
	}

	.beta-notice-body p:last-child {
		margin-bottom: 0;
	}

	.beta-notice-actions {
		padding: 1.25rem 2rem 1.5rem;
		border-top: 1px solid #ececec;
		background: #fafafa;
		display: flex;
		justify-content: flex-end;
	}

	.beta-notice-btn {
		background: #000000;
		color: #ffffff;
		border: none;
		border-radius: 8px;
		padding: 0.75rem 1.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.beta-notice-btn:hover {
		background: #2a2a2a;
	}

	.beta-notice-btn:focus-visible {
		outline: 2px solid #000000;
		outline-offset: 2px;
	}

	@media (max-width: 560px) {
		.beta-notice-overlay {
			padding: 0;
			align-items: stretch;
		}
		.beta-notice-dialog {
			max-height: 100vh;
			border-radius: 0;
		}
		.beta-notice-header {
			padding: 1.5rem 1.25rem 1rem;
		}
		.beta-notice-title {
			font-size: 1.375rem;
		}
		.beta-notice-body {
			padding: 1.25rem 1.25rem;
		}
		.beta-notice-actions {
			padding: 1rem 1.25rem 1.25rem;
		}
		.beta-notice-btn {
			width: 100%;
		}
	}

	.encrypt-alert {
		position: fixed;
		top: var(--space-3);
		left: var(--space-3);
		z-index: 1000;
		animation: slideDown 0.3s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-100%);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.encrypt-alert-content {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg);
		border: 1px solid var(--color-warning);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg, 0 4px 12px rgba(0, 0, 0, 0.15));
		max-width: 320px;
	}

	.encrypt-alert-icon {
		color: var(--color-warning);
		flex-shrink: 0;
		margin-top: 1px;
	}

	.encrypt-alert-content strong {
		font-size: var(--text-sm);
		display: block;
	}

	.encrypt-alert-content p {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		margin-top: 2px;
		line-height: 1.4;
	}

	.encrypt-alert-close {
		background: none;
		border: none;
		padding: 2px;
		cursor: pointer;
		color: var(--color-text-muted);
		flex-shrink: 0;
		margin-top: 1px;
	}

	.encrypt-alert-close:hover {
		color: var(--color-text);
	}

	.pubkey-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: rgba(220, 38, 38, 0.04);
		border: 1px solid rgba(220, 38, 38, 0.2);
		border-radius: var(--radius-md);
	}

	.pubkey-block h3 {
		font-size: var(--text-sm);
		font-weight: 600;
		color: #991b1b;
	}

	.pubkey-block p {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.pubkey-block-link {
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		color: var(--color-primary);
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
	}
</style>

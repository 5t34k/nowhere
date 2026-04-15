<script lang="ts">
	import { onMount } from 'svelte';
	import { petitionBuilderState, petitionEncodedResult, toPetitionData } from '$lib/stores/petition-builder-state';
	import { decode, serializePetition } from '@nowhere/codec';
	import { RENDERER_ORIGIN } from '$lib/config.js';
	import type { PetitionData } from '@nowhere/codec';
	import BuilderLayout from '$lib/components/BuilderLayout.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import PetitionBasicsPanel from '$lib/components/petition/PetitionBasicsPanel.svelte';
	import PetitionStatementPanel from '$lib/components/petition/PetitionStatementPanel.svelte';
	import PetitionSignerFieldsPanel from '$lib/components/petition/PetitionSignerFieldsPanel.svelte';
	import ContactDetailsPanel from '$lib/components/ContactDetailsPanel.svelte';
	import VerificationPanel from '$lib/components/VerificationPanel.svelte';
	import PublishPanel from '$lib/components/PublishPanel.svelte';
	import ManageInfoPanel from '$lib/components/ManageInfoPanel.svelte';
	import CharacterBudget from '$lib/components/CharacterBudget.svelte';
	import CompressionView from '$lib/components/CompressionView.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';

	const petitionPanels = [
		{ id: 'petition', label: 'Petition', step: '1' },
		{ id: 'statement', label: 'Statement', step: '2' },
		{ id: 'signerfields', label: 'Signer Fields', step: '3' },
		{ id: 'contacts', label: 'Contact', step: '4' },
		{ id: 'verification', label: 'Verification', step: '5' },
		{ id: 'manage', label: 'Manage', step: '6' },
		{ id: 'publish', label: 'Share Link', step: '7' }
	];

	const PLACEHOLDER_PUBKEY = 'A'.repeat(43);
	const pubkeyIsPlaceholder = $derived($petitionBuilderState.pubkey === PLACEHOLDER_PUBKEY);

	let showImport = $state(false);
	let mobileShowPreview = $state(false);
	let activePanel = $state('petition');
	let lastValidLength = $state(0);
	let editorCollapsed = $state(false);
	let compressionExpanded = $state(false);

	// Encryption state
	let encryptEnabled = $state(false);
	let encryptedFragment = $state('');
	let encryptedSourceFragment = $state('');

	let encryptionAlert = $state(false);
	let alertTimer: ReturnType<typeof setTimeout> | null = null;

	// Invalidate encryption when data changes
	$effect(() => {
		const currentFragment = $petitionEncodedResult?.fragment;
		if (encryptedFragment && currentFragment !== encryptedSourceFragment) {
			encryptedFragment = '';
			encryptedSourceFragment = '';
			encryptEnabled = false;
			encryptionAlert = true;
			if (alertTimer) clearTimeout(alertTimer);
			alertTimer = setTimeout(() => (encryptionAlert = false), 6000);
		}
	});

	const encryptedPreviewUrl = $derived(
		encryptEnabled && encryptedFragment
			? `/s#${encryptedFragment}`
			: ''
	);

	// Track the actual published URL (may be signed or encrypted) for budget display
	let publishUrl = $state('');
	$effect(() => {
		$petitionEncodedResult?.fragment;
		publishUrl = '';
	});
	const activeUrlLength = $derived(
		publishUrl
			? publishUrl.length
			: $petitionEncodedResult
				? (RENDERER_ORIGIN + '/s#' + $petitionEncodedResult.fragment).length
				: lastValidLength
	);

	let lastActivePanel = $state('petition');

	$effect(() => {
		if ($petitionEncodedResult) {
			lastValidLength = (RENDERER_ORIGIN + '/s#' + $petitionEncodedResult.fragment).length;
		}
	});

	function handleNavigate(panel: string) {
		if (editorCollapsed) {
			editorCollapsed = false;
			activePanel = panel;
		} else if (activePanel === panel) {
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
			activePanel = lastActivePanel || 'petition';
		} else {
			lastActivePanel = activePanel;
			editorCollapsed = true;
			activePanel = '';
		}
	}

	function handleReset() {
		if (confirm('Reset all petition data? This cannot be undone.')) {
			petitionBuilderState.reset();
			lastValidLength = 0;
			encryptEnabled = false;
			encryptedFragment = '';
			encryptedSourceFragment = '';
			editorCollapsed = false;
			activePanel = 'petition';
		}
	}

	function handleImport(fragment: string) {
		try {
			const data = decode(fragment);
			if (data.siteType !== 'petition') {
				console.error('Import failed: not a petition');
				return;
			}
			petitionBuilderState.importFromData(data as PetitionData);
			showImport = false;
			editorCollapsed = false;
			activePanel = 'petition';
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

	const petitionNotReadyItems = [
		'Public key (43 characters)',
		'Petition title'
	];
</script>

<svelte:head>
	<title>Create Petition · Nowhere</title>
</svelte:head>

<BuilderLayout {editorCollapsed} onToggleCollapse={handleToggleCollapse} {mobileShowPreview} scrollKey={activePanel}>
	{#snippet sidebar()}
		<Sidebar
			siteType="Petition"
			{activePanel}
			onNavigate={handleNavigate}
			onImport={() => (showImport = true)}
			onReset={handleReset}
			panels={petitionPanels}
			resetLabel="Reset All"
			importLabel="Import Petition"
			{mobileShowPreview}
			onTogglePreview={() => (mobileShowPreview = !mobileShowPreview)}
		/>
	{/snippet}

	{#snippet editor()}
		{#if activePanel === 'petition'}
			<PetitionBasicsPanel
				pubkey={$petitionBuilderState.pubkey}
				name={$petitionBuilderState.name}
				image={$petitionBuilderState.image}
				tags={$petitionBuilderState.tags}
				onUpdate={(field, value) => petitionBuilderState.updateField(field as any, value as any)}
			/>
		{:else if activePanel === 'statement'}
			<PetitionStatementPanel
				description={$petitionBuilderState.description}
				tags={$petitionBuilderState.tags}
				onUpdate={(field, value) => petitionBuilderState.updateField(field as any, value as any)}
				onTagUpdate={(tags) => petitionBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'signerfields'}
			<PetitionSignerFieldsPanel
				tags={$petitionBuilderState.tags}
				onUpdate={(tags) => petitionBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'contacts'}
			<ContactDetailsPanel
				tags={$petitionBuilderState.tags}
				onUpdate={(tags) => petitionBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'verification'}
			<VerificationPanel
				storeData={toPetitionData($petitionBuilderState)}
				labels={{ entityLabel: 'Petition', ownerLabel: 'Creator' }}
				showSharingSection={false}
				onTagUpdate={(key, value) => {
					petitionBuilderState.update(s => {
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
						Signature submissions are encrypted with your public key. Without the corresponding
						private key you will not be able to read any submission details — they will be
						permanently unreadable.
					</p>
					<p>
						Set your public key in <button class="pubkey-block-link" onclick={() => handleNavigate('petition')}>Petition Settings</button> before sharing.
					</p>
				</div>
			{:else}
				<PublishPanel
					result={$petitionEncodedResult}
					{encryptEnabled}
					{encryptedFragment}
					onEncryptToggle={(enabled) => (encryptEnabled = enabled)}
					onEncrypted={(source, encrypted) => { encryptedSourceFragment = source; encryptedFragment = encrypted; }}
					onRemoveEncryption={() => { encryptedFragment = ''; encryptedSourceFragment = ''; }}
					onUrlChange={(url) => (publishUrl = url)}
					notReadyItems={petitionNotReadyItems}
					expectedPubkey={$petitionBuilderState.pubkey}
				siteType="petition"
				/>
			{/if}
		{:else if activePanel === 'manage'}
			<ManageInfoPanel siteType="petition" />
		{/if}
	{/snippet}

	{#snippet preview()}
		<LivePreview result={$petitionEncodedResult} openUrl={encryptedPreviewUrl} hideOpenLink />
	{/snippet}

	{#snippet budget()}
		<CharacterBudget
			length={activeUrlLength}
			expanded={compressionExpanded}
			onToggle={() => compressionExpanded = !compressionExpanded}
		>
			<CompressionView serializedText={(() => { try { const d = toPetitionData($petitionBuilderState); return d ? serializePetition(d) : null; } catch { return null; } })()} encodedResult={$petitionEncodedResult} label="petition" />
		</CharacterBudget>
	{/snippet}
</BuilderLayout>

{#if showImport}
	<ImportDialog label="petition" onImport={handleImport} onClose={() => (showImport = false)} />
{/if}

{#if encryptionAlert}
	<div class="encrypt-alert">
		<div class="encrypt-alert-content">
			<span class="encrypt-alert-icon">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
			</span>
			<div>
				<strong>Encryption disabled</strong>
				<p>Petition data changed.<br/>Go to Share Link to re-encrypt.</p>
			</div>
			<button class="encrypt-alert-close" onclick={() => (encryptionAlert = false)} aria-label="Dismiss">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>
	</div>
{/if}

<style>
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

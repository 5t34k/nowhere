<script lang="ts">
	import { onMount } from 'svelte';
	import { dropBuilderState, dropEncodedResult, toDropData } from '$lib/stores/drop-builder-state';
	import { decode, serializeDrop } from '@nowhere/codec';
	import { RENDERER_ORIGIN } from '$lib/config.js';
	import type { DropData } from '@nowhere/codec';
	import BuilderLayout from '$lib/components/BuilderLayout.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import DropAuthorPanel from '$lib/components/drop/DropAuthorPanel.svelte';
	import DropContentPanel from '$lib/components/drop/DropContentPanel.svelte';
	import VerificationPanel from '$lib/components/VerificationPanel.svelte';
	import PublishPanel from '$lib/components/PublishPanel.svelte';
	import CharacterBudget from '$lib/components/CharacterBudget.svelte';
	import CompressionView from '$lib/components/CompressionView.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';

	const dropPanels = [
		{ id: 'author', label: 'Author', step: '1' },
		{ id: 'content', label: 'Content', step: '2' },
		{ id: 'verification', label: 'Verification', step: '3' },
		{ id: 'publish', label: 'Share Link', step: '4' }
	];

	let showImport = $state(false);
	let mobileShowPreview = $state(false);
	let activePanel = $state('author');
	let lastValidLength = $state(0);
	let editorCollapsed = $state(false);
	let compressionExpanded = $state(false);

	// Encryption state
	let encryptEnabled = $state(false);
	let encryptedFragment = $state('');
	let encryptedSourceFragment = $state('');

	let encryptionAlert = $state(false);
	let alertTimer: ReturnType<typeof setTimeout> | null = null;

	// Invalidate encryption when drop data changes
	$effect(() => {
		const currentFragment = $dropEncodedResult?.fragment;
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
		$dropEncodedResult?.fragment;
		publishUrl = '';
	});
	const activeUrlLength = $derived(
		publishUrl
			? publishUrl.length
			: $dropEncodedResult
				? (RENDERER_ORIGIN + '/s#' + $dropEncodedResult.fragment).length
				: lastValidLength
	);

	let lastActivePanel = $state('author');

	$effect(() => {
		if ($dropEncodedResult) {
			lastValidLength = (RENDERER_ORIGIN + '/s#' + $dropEncodedResult.fragment).length;
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
			activePanel = lastActivePanel || 'author';
		} else {
			lastActivePanel = activePanel;
			editorCollapsed = true;
			activePanel = '';
		}
	}

	function handleReset() {
		if (confirm('Reset all drop data? This cannot be undone.')) {
			dropBuilderState.reset();
			lastValidLength = 0;
			encryptEnabled = false;
			encryptedFragment = '';
			encryptedSourceFragment = '';
			editorCollapsed = false;
			activePanel = 'author';
		}
	}

	function handleImport(fragment: string) {
		try {
			const data = decode(fragment);
			if (data.siteType !== 'drop') {
				console.error('Import failed: not a drop');
				return;
			}
			dropBuilderState.importFromData(data as DropData);
			showImport = false;
			editorCollapsed = false;
			activePanel = 'author';
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

	const dropNotReadyItems = [
		'Drop content'
	];
</script>

<svelte:head>
	<title>Create Drop · Nowhere</title>
</svelte:head>

<BuilderLayout {editorCollapsed} onToggleCollapse={handleToggleCollapse} {mobileShowPreview} scrollKey={activePanel}>
	{#snippet sidebar()}
		<Sidebar
			siteType="Drop"
			{activePanel}
			onNavigate={handleNavigate}
			onImport={() => (showImport = true)}
			onReset={handleReset}
			panels={dropPanels}
			resetLabel="Reset All"
			importLabel="Import Drop"
			{mobileShowPreview}
			onTogglePreview={() => (mobileShowPreview = !mobileShowPreview)}
		/>
	{/snippet}

	{#snippet editor()}
		{#if activePanel === 'author'}
			<DropAuthorPanel
				pubkey={$dropBuilderState.pubkey}
				onUpdate={(field, value) => dropBuilderState.updateField(field as any, value as any)}
			/>
		{:else if activePanel === 'content'}
			<DropContentPanel
				name={$dropBuilderState.name}
				description={$dropBuilderState.description}
				onUpdate={(field, value) => dropBuilderState.updateField(field as any, value as any)}
			/>
		{:else if activePanel === 'verification'}
			<VerificationPanel
				storeData={toDropData($dropBuilderState)}
				labels={{ entityLabel: 'Drop', ownerLabel: 'Author' }}
				onTagUpdate={(key, value) => {
					dropBuilderState.update(s => {
						const tags = s.tags.filter(t => t.key !== key);
						tags.push({ key, value });
						return { ...s, tags };
					});
				}}
			/>
		{:else if activePanel === 'publish'}
			<PublishPanel
				result={$dropEncodedResult}
				{encryptEnabled}
				{encryptedFragment}
				onEncryptToggle={(enabled) => (encryptEnabled = enabled)}
				onEncrypted={(source, encrypted) => { encryptedSourceFragment = source; encryptedFragment = encrypted; }}
				onRemoveEncryption={() => { encryptedFragment = ''; encryptedSourceFragment = ''; }}
				onUrlChange={(url) => (publishUrl = url)}
				notReadyItems={dropNotReadyItems}
				expectedPubkey={$dropBuilderState.pubkey}
				siteType="drop"
			/>
		{/if}
	{/snippet}

	{#snippet preview()}
		<LivePreview result={$dropEncodedResult} openUrl={encryptedPreviewUrl} />
	{/snippet}

	{#snippet budget()}
		<CharacterBudget
			length={activeUrlLength}
			expanded={compressionExpanded}
			onToggle={() => compressionExpanded = !compressionExpanded}
		>
			<CompressionView serializedText={(() => { try { const d = toDropData($dropBuilderState); return d ? serializeDrop(d) : null; } catch { return null; } })()} encodedResult={$dropEncodedResult} label="drop" />
		</CharacterBudget>
	{/snippet}
</BuilderLayout>

{#if showImport}
	<ImportDialog label="drop" onImport={handleImport} onClose={() => (showImport = false)} />
{/if}

{#if encryptionAlert}
	<div class="encrypt-alert">
		<div class="encrypt-alert-content">
			<span class="encrypt-alert-icon">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
			</span>
			<div>
				<strong>Encryption disabled</strong>
				<p>Drop data changed.<br/>Go to Share Link to re-encrypt.</p>
			</div>
			<button class="encrypt-alert-close" onclick={() => (encryptionAlert = false)}>
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
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { artBuilderState, artEncodedResult, toArtData } from '$lib/stores/art-builder-state';
	import { decode, serializeArt } from '@nowhere/codec';
	import { RENDERER_ORIGIN } from '$lib/config.js';
	import type { ArtData, Tag } from '@nowhere/codec';
	import BuilderLayout from '$lib/components/BuilderLayout.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import ArtAuthorPanel from '$lib/components/art/ArtAuthorPanel.svelte';
	import ArtArtworkPanel from '$lib/components/art/ArtArtworkPanel.svelte';
	import ArtFramePanel from '$lib/components/art/ArtFramePanel.svelte';
	import VerificationPanel from '$lib/components/VerificationPanel.svelte';
	import PublishPanel from '$lib/components/PublishPanel.svelte';
	import CharacterBudget from '$lib/components/CharacterBudget.svelte';
	import CompressionView from '$lib/components/CompressionView.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';

	const artPanels = [
		{ id: 'author', label: 'Author', step: '1' },
		{ id: 'artwork', label: 'Artwork', step: '2' },
		{ id: 'frame', label: 'Frame', step: '3' },
		{ id: 'verification', label: 'Verification', step: '4' },
		{ id: 'publish', label: 'Share Link', step: '5' }
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

	$effect(() => {
		const currentFragment = $artEncodedResult?.fragment;
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
		$artEncodedResult?.fragment;
		publishUrl = '';
	});
	const activeUrlLength = $derived(
		publishUrl
			? publishUrl.length
			: $artEncodedResult
				? (RENDERER_ORIGIN + '/s#' + $artEncodedResult.fragment).length
				: lastValidLength
	);

	let lastActivePanel = $state('author');

	$effect(() => {
		if ($artEncodedResult) {
			lastValidLength = (RENDERER_ORIGIN + '/s#' + $artEncodedResult.fragment).length;
		}
	});

	// Helper: get attribution tag value
	function getAttribution(tags: typeof $artBuilderState.tags): string {
		return tags.find((t: Tag) => t.key === 'A')?.value ?? '';
	}

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
		if (confirm('Reset all art data? This cannot be undone.')) {
			artBuilderState.reset();
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
			if (data.siteType !== 'art') {
				console.error('Import failed: not an art piece');
				return;
			}
			artBuilderState.importFromData(data as ArtData);
			showImport = false;
			editorCollapsed = false;
			activePanel = 'author';
		} catch (e) {
			console.error('Import failed:', e);
		}
	}

	function handleTagUpdate(key: string, value: string) {
		artBuilderState.update((s) => {
			const tags = s.tags.filter((t: Tag) => t.key !== key);
			tags.push({ key, value });
			return { ...s, tags };
		});
	}

	function handleAttributionUpdate(value: string) {
		artBuilderState.update((s) => {
			const tags = s.tags.filter((t: Tag) => t.key !== 'A');
			if (value.trim()) tags.push({ key: 'A', value });
			return { ...s, tags };
		});
	}

	onMount(() => {
		const fragment = window.location.hash.slice(1);
		if (fragment) {
			handleImport(fragment);
			history.replaceState(null, '', window.location.pathname);
		}
	});

	const artNotReadyItems = [
		'SVG artwork'
	];
</script>

<svelte:head>
	<title>Create Art · Nowhere</title>
</svelte:head>

<BuilderLayout {editorCollapsed} onToggleCollapse={handleToggleCollapse} {mobileShowPreview} scrollKey={activePanel}>
	{#snippet sidebar()}
		<Sidebar
			siteType="Art"
			{activePanel}
			onNavigate={handleNavigate}
			onImport={() => (showImport = true)}
			onReset={handleReset}
			panels={artPanels}
			resetLabel="Reset All"
			importLabel="Import Art"
			{mobileShowPreview}
			onTogglePreview={() => (mobileShowPreview = !mobileShowPreview)}
		/>
	{/snippet}

	{#snippet editor()}
		{#if activePanel === 'author'}
			<ArtAuthorPanel
				pubkey={$artBuilderState.pubkey}
				attribution={getAttribution($artBuilderState.tags)}
				onUpdate={(field, value) => {
					if (field === 'pubkey') {
						artBuilderState.updateField('pubkey', value);
					} else if (field === 'attribution') {
						handleAttributionUpdate(value as string);
					}
				}}
			/>
		{:else if activePanel === 'artwork'}
			<ArtArtworkPanel
				name={$artBuilderState.name}
				svg={$artBuilderState.svg}
				onUpdate={(field, value) => artBuilderState.updateField(field as any, value as any)}
			/>
		{:else if activePanel === 'frame'}
			<ArtFramePanel
				tags={$artBuilderState.tags}
				onTagUpdate={handleTagUpdate}
			/>
		{:else if activePanel === 'verification'}
			<VerificationPanel
				storeData={toArtData($artBuilderState)}
				labels={{ entityLabel: 'Art', ownerLabel: 'Author' }}
				onTagUpdate={handleTagUpdate}
			/>
		{:else if activePanel === 'publish'}
			<PublishPanel
				result={$artEncodedResult}
				{encryptEnabled}
				{encryptedFragment}
				onEncryptToggle={(enabled) => (encryptEnabled = enabled)}
				onEncrypted={(source, encrypted) => { encryptedSourceFragment = source; encryptedFragment = encrypted; }}
				onRemoveEncryption={() => { encryptedFragment = ''; encryptedSourceFragment = ''; }}
				onUrlChange={(url) => (publishUrl = url)}
				notReadyItems={artNotReadyItems}
				expectedPubkey={$artBuilderState.pubkey}
				siteType="art"
			/>
		{/if}
	{/snippet}

	{#snippet preview()}
		<LivePreview result={$artEncodedResult} openUrl={encryptedPreviewUrl} />
	{/snippet}

	{#snippet budget()}
		<CharacterBudget
			length={activeUrlLength}
			expanded={compressionExpanded}
			onToggle={() => compressionExpanded = !compressionExpanded}
		>
			<CompressionView serializedText={(() => { try { const d = toArtData($artBuilderState); return d ? serializeArt(d) : null; } catch { return null; } })()} encodedResult={$artEncodedResult} label="art" />
		</CharacterBudget>
	{/snippet}
</BuilderLayout>

{#if showImport}
	<ImportDialog label="art" onImport={handleImport} onClose={() => (showImport = false)} />
{/if}

{#if encryptionAlert}
	<div class="encrypt-alert">
		<div class="encrypt-alert-content">
			<span class="encrypt-alert-icon">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
			</span>
			<div>
				<strong>Encryption disabled</strong>
				<p>Art data changed.<br/>Go to Share Link to re-encrypt.</p>
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
		from { opacity: 0; transform: translateY(-100%); }
		to { opacity: 1; transform: translateY(0); }
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

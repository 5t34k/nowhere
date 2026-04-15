<script lang="ts">
	import { onMount } from 'svelte';
	import { eventBuilderState, eventEncodedResult, toEventData } from '$lib/stores/event-builder-state';
	import { decode, serializeEvent } from '@nowhere/codec';
	import { RENDERER_ORIGIN } from '$lib/config.js';
	import type { EventData } from '@nowhere/codec';
	import BuilderLayout from '$lib/components/BuilderLayout.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import EventAppearancePanel from '$lib/components/event/EventAppearancePanel.svelte';
	import EventBasicsPanel from '$lib/components/event/EventBasicsPanel.svelte';
	import EventWhenWherePanel from '$lib/components/event/EventWhenWherePanel.svelte';
	import EventDetailsPanel from '$lib/components/event/EventDetailsPanel.svelte';
	import EventImagesPanel from '$lib/components/event/EventImagesPanel.svelte';
	import VerificationPanel from '$lib/components/VerificationPanel.svelte';
	import PublishPanel from '$lib/components/PublishPanel.svelte';
	import CharacterBudget from '$lib/components/CharacterBudget.svelte';
	import CompressionView from '$lib/components/CompressionView.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';

	const eventPanels = [
		{ id: 'appearance', label: 'Style',        step: '1' },
		{ id: 'basics',     label: 'Basics',       step: '2' },
		{ id: 'when-where', label: 'When & Where', step: '3' },
		{ id: 'details',    label: 'Details',      step: '4' },
		{ id: 'images',     label: 'Images',       step: '5' },
		{ id: 'verification', label: 'Verification', step: '6' },
		{ id: 'publish',    label: 'Share Link',   step: '7' }
	];

	let showImport = $state(false);
	let mobileShowPreview = $state(false);
	let activePanel = $state('appearance');
	let lastValidLength = $state(0);
	let editorCollapsed = $state(false);
	let compressionExpanded = $state(false);

	let encryptEnabled = $state(false);
	let encryptedFragment = $state('');
	let encryptedSourceFragment = $state('');
	let encryptionAlert = $state(false);
	let alertTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const currentFragment = $eventEncodedResult?.fragment;
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
		encryptEnabled && encryptedFragment ? `/s#${encryptedFragment}` : ''
	);

	// Track the actual published URL (may be signed or encrypted) for budget display
	let publishUrl = $state('');
	$effect(() => {
		$eventEncodedResult?.fragment;
		publishUrl = '';
	});
	const activeUrlLength = $derived(
		publishUrl
			? publishUrl.length
			: $eventEncodedResult
				? (RENDERER_ORIGIN + '/s#' + $eventEncodedResult.fragment).length
				: lastValidLength
	);

	let lastActivePanel = $state('appearance');

	$effect(() => {
		if ($eventEncodedResult) lastValidLength = (RENDERER_ORIGIN + '/s#' + $eventEncodedResult.fragment).length;
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
			activePanel = lastActivePanel || 'appearance';
		} else {
			lastActivePanel = activePanel;
			editorCollapsed = true;
			activePanel = '';
		}
	}

	function handleReset() {
		if (confirm('Reset all event data? This cannot be undone.')) {
			eventBuilderState.reset();
			lastValidLength = 0;
			encryptEnabled = false;
			encryptedFragment = '';
			encryptedSourceFragment = '';
			editorCollapsed = false;
			activePanel = 'appearance';
		}
	}

	function handleImport(fragment: string) {
		try {
			const data = decode(fragment);
			if (data.siteType !== 'event') {
				console.error('Import failed: not an event');
				return;
			}
			eventBuilderState.importFromData(data as EventData);
			showImport = false;
			editorCollapsed = false;
			activePanel = 'appearance';
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

	const eventNotReadyItems = ['Event name'];
</script>

<svelte:head>
	<title>Create Event · Nowhere</title>
</svelte:head>

<BuilderLayout {editorCollapsed} onToggleCollapse={handleToggleCollapse} {mobileShowPreview} scrollKey={activePanel}>
	{#snippet sidebar()}
		<Sidebar
			siteType="Event"
			{activePanel}
			onNavigate={handleNavigate}
			onImport={() => (showImport = true)}
			onReset={handleReset}
			panels={eventPanels}
			resetLabel="Reset All"
			importLabel="Import Event"
			{mobileShowPreview}
			onTogglePreview={() => (mobileShowPreview = !mobileShowPreview)}
		/>
	{/snippet}

	{#snippet editor()}
		{#if activePanel === 'appearance'}
			<EventAppearancePanel
				tags={$eventBuilderState.tags}
				onUpdate={(tags) => eventBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'basics'}
			<EventBasicsPanel
				pubkey={$eventBuilderState.pubkey}
				name={$eventBuilderState.name}
				description={$eventBuilderState.description}
				tags={$eventBuilderState.tags}
				onUpdate={(field, value) => eventBuilderState.updateField(field as any, value as any)}
			/>
		{:else if activePanel === 'when-where'}
			<EventWhenWherePanel
				tags={$eventBuilderState.tags}
				onUpdate={(tags) => eventBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'details'}
			<EventDetailsPanel
				tags={$eventBuilderState.tags}
				onUpdate={(tags) => eventBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'images'}
			<EventImagesPanel
				image={$eventBuilderState.image}
				tags={$eventBuilderState.tags}
				onUpdateImage={(v) => eventBuilderState.updateField('image', v)}
				onUpdateTags={(tags) => eventBuilderState.updateField('tags', tags)}
			/>
		{:else if activePanel === 'verification'}
			<VerificationPanel
				storeData={toEventData($eventBuilderState)}
				labels={{ entityLabel: 'Event', ownerLabel: 'Organiser' }}
				showSharingSection={false}
				onTagUpdate={(key, value) => {
					eventBuilderState.update(s => {
						const tags = s.tags.filter(t => t.key !== key);
						tags.push({ key, value });
						return { ...s, tags };
					});
				}}
			/>
		{:else if activePanel === 'publish'}
			<PublishPanel
				result={$eventEncodedResult}
				{encryptEnabled}
				{encryptedFragment}
				onEncryptToggle={(enabled) => (encryptEnabled = enabled)}
				onEncrypted={(source, encrypted) => { encryptedSourceFragment = source; encryptedFragment = encrypted; }}
				onRemoveEncryption={() => { encryptedFragment = ''; encryptedSourceFragment = ''; }}
				onUrlChange={(url) => (publishUrl = url)}
				notReadyItems={eventNotReadyItems}
				expectedPubkey={$eventBuilderState.pubkey}
				siteType="event"
			/>
		{/if}
	{/snippet}

	{#snippet preview()}
		<LivePreview result={$eventEncodedResult} openUrl={encryptedPreviewUrl} />
	{/snippet}

	{#snippet budget()}
		<CharacterBudget
			length={activeUrlLength}
			expanded={compressionExpanded}
			onToggle={() => compressionExpanded = !compressionExpanded}
		>
			<CompressionView
				serializedText={(() => { try { const d = toEventData($eventBuilderState); return d ? serializeEvent(d) : null; } catch { return null; } })()}
				encodedResult={$eventEncodedResult}
				label="event"
			/>
		</CharacterBudget>
	{/snippet}
</BuilderLayout>

{#if showImport}
	<ImportDialog label="event" onImport={handleImport} onClose={() => (showImport = false)} />
{/if}

{#if encryptionAlert}
	<div class="encrypt-alert">
		<div class="encrypt-alert-content">
			<span class="encrypt-alert-icon">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
			</span>
			<div>
				<strong>Encryption disabled</strong>
				<p>Event data changed.<br/>Go to Share Link to re-encrypt.</p>
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
		to   { opacity: 1; transform: translateY(0); }
	}

	.encrypt-alert-content {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg);
		border: 1px solid var(--color-warning);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg, 0 4px 12px rgba(0,0,0,0.15));
		max-width: 320px;
	}

	.encrypt-alert-icon { color: var(--color-warning); flex-shrink: 0; margin-top: 1px; }

	.encrypt-alert-content strong { font-size: var(--text-sm); display: block; }

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

	.encrypt-alert-close:hover { color: var(--color-text); }
</style>

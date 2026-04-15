<script lang="ts">
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import QRCode from 'qrcode';

	interface Props {
		name: string;
		description?: string;
		image?: string;
		verificationPhrase: string;
		signed: boolean;
		privacyMode: number;
		saltEnabled?: boolean;
		salt?: string;
		qrSharingEnabled?: boolean;
		onSaltChange?: (salt: string) => void;
		persistEnabled?: boolean;
		hasAnyHistory?: boolean;
		onEnableHistory?: () => void;
		onDisableHistory?: () => void;
		onClearAll?: () => void;
	}

	let { name, description, image, verificationPhrase, signed, privacyMode, saltEnabled, salt, qrSharingEnabled = true, onSaltChange, persistEnabled = false, hasAnyHistory = false, onEnableHistory, onDisableHistory, onClearAll }: Props = $props();

	// ─── Salt state ───
	let saltOpen = $state(false);
	let saltInput = $state('');

	$effect(() => { saltInput = salt ?? ''; });

	function applySalt() {
		onSaltChange?.(saltInput);
		saltOpen = false;
	}

	function clearSalt() {
		saltInput = '';
		onSaltChange?.('');
		saltOpen = false;
	}

	// ─── History panel state ───
	type HistoryPanelState = 'main' | 'confirm-disable' | 'confirm-clear-1' | 'confirm-clear-2';
	let historyOpen = $state(false);
	let historyPanelState = $state<HistoryPanelState>('main');
	// Tracks the toggle value inside the panel before Save is clicked
	let pendingEnabled = $state(false);

	function openHistoryPanel() {
		pendingEnabled = persistEnabled;
		historyPanelState = 'main';
		historyOpen = !historyOpen;
		if (saltOpen) saltOpen = false;
	}

	function saveHistory() {
		if (pendingEnabled === persistEnabled) {
			historyOpen = false;
			return;
		}
		if (pendingEnabled) {
			confirmEnable();
		} else {
			historyPanelState = 'confirm-disable';
		}
	}

	function confirmEnable() {
		onEnableHistory?.();
		historyOpen = false;
		historyPanelState = 'main';
	}

	function confirmDisable() {
		onDisableHistory?.();
		historyOpen = false;
		historyPanelState = 'main';
	}

	function cancelHistory() {
		historyOpen = false;
		historyPanelState = 'main';
	}

	function startClearAll() {
		historyPanelState = 'confirm-clear-1';
	}

	function confirmClearStep1() {
		historyPanelState = 'confirm-clear-2';
	}

	function confirmClearStep2() {
		onClearAll?.();
		historyOpen = false;
		historyPanelState = 'main';
	}

	function cancelClear() {
		historyPanelState = 'main';
	}

	// ─── Share QR ───
	let shareOpen = $state(false);
	let qrDataUrl = $state('');
	let linkCopied = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			QRCode.toDataURL(window.location.href, {
				width: 512,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url: string) => { qrDataUrl = url; });
		}
	});

	async function copyUrl() {
		if (typeof window === 'undefined') return;
		try {
			await navigator.clipboard.writeText(window.location.href);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = window.location.href;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		linkCopied = true;
		setTimeout(() => (linkCopied = false), 2000);
	}
</script>

<div class="forum-header">
	{#if image}
		{#if image.startsWith('<')}
			<div class="forum-header-icon forum-header-icon-svg" role="img" aria-label={name}>{@html sanitizeSvg(image)}</div>
		{:else}
			<img class="forum-header-icon" src={sanitizeImageUrl(image)} alt={name} />
		{/if}
	{/if}

	<div class="forum-header-info">
		<h1 class="forum-title">{name}</h1>

		{#if description}
			<p class="forum-description">{description}</p>
		{/if}

		<div class="forum-meta">
			{#if signed && verificationPhrase}
				<span class="signed-badge">
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					Verified
				</span>
				<span class="forum-meta-sep">·</span>
			{/if}
			{#if privacyMode === 1}
				<span>Private</span>
				<span class="forum-meta-sep">·</span>
			{/if}
			{#if verificationPhrase}
				<span class="forum-verification-phrase">
					{verificationPhrase.split(' ').join(' · ')}
				</span>
			{/if}
		</div>
	</div>

	<div class="forum-header-controls">
		<!-- Share button -->
		{#if qrSharingEnabled}
			<button
				class="forum-share-btn"
				onclick={() => { shareOpen = true; if (historyOpen) historyOpen = false; if (saltOpen) saltOpen = false; }}
				title="Share forum"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="20" y1="14" x2="20" y2="14.01"/><line x1="17" y1="20" x2="17" y2="20.01"/><line x1="20" y1="20" x2="20" y2="20.01"/><line x1="20" y1="17" x2="20" y2="17.01"/>
				</svg>
			</button>
		{/if}

		<!-- History button -->
		<button
			class="history-btn"
			class:history-active={persistEnabled}
			onclick={openHistoryPanel}
			title={persistEnabled ? 'Local history on' : 'Local history'}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="9"/>
				<polyline points="12 7 12 12 15 15"/>
			</svg>
		</button>

		<!-- Salt button -->
		{#if saltEnabled}
			<button
				class="salt-btn"
				class:salt-active={!!salt}
				onclick={() => { saltOpen = !saltOpen; if (historyOpen) historyOpen = false; }}
				title={salt ? 'Salt active' : 'Add salt'}
			>
				<svg width="18" height="18" viewBox="0 0 24 24"
					fill="none" stroke="currentColor" stroke-width="1.5"
					stroke-linecap="round" stroke-linejoin="round">
					<path d="M8 2h8a1 1 0 011 1v4H7V3a1 1 0 011-1z" fill="currentColor"/>
					<circle cx="10" cy="4.5" r="0.7" fill="var(--fm-bg)" stroke="none"/>
					<circle cx="14" cy="4.5" r="0.7" fill="var(--fm-bg)" stroke="none"/>
					<circle cx="12" cy="3" r="0.7" fill="var(--fm-bg)" stroke="none"/>
					<rect x="5" y="7" width="14" height="2" rx="0.5" fill="currentColor"/>
					<path d="M5 9h14v12a2 2 0 01-2 2H7a2 2 0 01-2-2V9z"/>
					<path d="M5 19l14-5v7a2 2 0 01-2 2H7a2 2 0 01-2-2z" fill="currentColor" stroke="none"/>
					<circle cx="9" cy="15" r="0.6" fill="currentColor" stroke="none"/>
					<circle cx="14" cy="13" r="0.6" fill="currentColor" stroke="none"/>
					<circle cx="11" cy="12" r="0.6" fill="currentColor" stroke="none"/>
					<circle cx="16" cy="15" r="0.6" fill="currentColor" stroke="none"/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<!-- Salt panel -->
{#if saltEnabled && saltOpen}
	<div class="salt-panel">
		<div class="salt-panel-inner">
			<p class="salt-hint">
				A salt opens a completely separate space within this forum — different posts, different chat, no visible connection to the original or to any other salt.
				The forum link, settings, topics, and rules all stay the same. Only the content changes.
				Each salt produces a unique space. Anyone who enters the same salt will find the same place.
			</p>
			<div class="salt-input-row">
				<input
					type="text"
					class="salt-input"
					bind:value={saltInput}
					placeholder="Enter salt"
					onkeydown={(e) => { if (e.key === 'Enter') applySalt(); }}
				/>
				<button class="salt-apply-btn" onclick={applySalt}>Apply</button>
				{#if salt}
					<button class="salt-clear-btn" onclick={clearSalt}>Clear</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- History panel -->
{#if historyOpen}
	<div class="salt-panel">
		<div class="salt-panel-inner">
			{#if historyPanelState === 'main'}
				<p class="salt-hint">
					Save posts and replies on this forum to your browser between visits. Stored locally and encrypted — readable only with this forum's link. Chat messages are never saved.
				</p>
				<label class="history-panel-toggle">
					<input type="checkbox" bind:checked={pendingEnabled} />
					Remember posts on this forum
				</label>
				<div class="history-panel-actions">
					<button class="salt-apply-btn" onclick={saveHistory}>Save</button>
					<button class="salt-clear-btn" onclick={cancelHistory}>Cancel</button>
				</div>
				{#if hasAnyHistory}
					<div class="history-panel-wipe">
						<button class="history-wipe-btn" onclick={startClearAll}>Clear all Nowhere history</button>
					</div>
				{/if}

			{:else if historyPanelState === 'confirm-disable'}
				<p class="salt-hint"><strong>Turn off and clear saved posts for this forum?</strong><br>All locally stored posts and replies will be deleted.</p>
				<div class="history-panel-actions">
					<button class="salt-apply-btn" onclick={confirmDisable}>Confirm</button>
					<button class="salt-clear-btn" onclick={cancelHistory}>Cancel</button>
				</div>

			{:else if historyPanelState === 'confirm-clear-1'}
				<p class="salt-hint"><strong>Clear all Nowhere history from this browser?</strong><br>This will delete saved posts from every Nowhere forum you have visited.</p>
				<div class="history-panel-actions">
					<button class="salt-apply-btn" onclick={confirmClearStep1}>Yes, clear everything</button>
					<button class="salt-clear-btn" onclick={cancelClear}>Cancel</button>
				</div>

			{:else if historyPanelState === 'confirm-clear-2'}
				<p class="salt-hint"><strong>This cannot be undone.</strong></p>
				<div class="history-panel-actions">
					<button class="salt-apply-btn" onclick={confirmClearStep2}>I understand, clear now</button>
					<button class="salt-clear-btn" onclick={cancelClear}>Cancel</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if shareOpen && qrDataUrl}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="forum-share-backdrop" onclick={() => (shareOpen = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="forum-share-modal" onclick={(e) => e.stopPropagation()}>
			<div class="forum-share-header">
				<span class="forum-share-title">Share</span>
				<button class="forum-share-close" onclick={() => (shareOpen = false)} aria-label="Close">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<div class="forum-share-body">
				<img src={qrDataUrl} alt="QR code" class="forum-share-qr" />
				<button class="forum-share-copy" onclick={copyUrl}>
					{linkCopied ? 'Copied!' : 'Copy Link'}
				</button>
			</div>
		</div>
	</div>
{/if}

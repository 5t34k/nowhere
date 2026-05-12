<script lang="ts">
	import { onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import { signInRequest, resolveSignIn, cancelSignIn } from '$lib/nostr/signin-modal-store';
	import { Nip07Signer, hasRealNostrExtension } from '$lib/nostr/signer';
	import { connectViaBunkerURI, startNostrConnect, DEFAULT_NOSTRCONNECT_RELAYS } from '$lib/nostr/nip46-signer';

	type Screen = 'choose' | 'qr' | 'bunker-url' | 'extension' | 'deeplink';

	let screen: Screen = $state('choose');
	let busy = $state(false);
	let error = $state('');
	let authUrl = $state('');

	// QR flow state
	let qrUri = $state('');
	let qrDataUrl = $state('');
	let qrAbort: (() => void) | null = null;

	// Bunker URL flow state
	let bunkerInput = $state('');

	const visible = $derived($signInRequest !== null);
	const isMobile = $derived(typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
	// Re-evaluated each time the modal opens — extensions inject window.nostr
	// via a content script that can race our bundle on first paint.
	const extOk = $derived(visible && hasRealNostrExtension());

	function reset() {
		screen = 'choose';
		busy = false;
		error = '';
		authUrl = '';
		qrUri = '';
		qrDataUrl = '';
		bunkerInput = '';
		if (qrAbort) { qrAbort(); qrAbort = null; }
	}

	function close() {
		if (qrAbort) { qrAbort(); qrAbort = null; }
		cancelSignIn();
		reset();
	}

	async function pickExtension() {
		screen = 'extension';
		busy = true;
		error = '';
		try {
			const signer = await Nip07Signer.connect();
			// Browser-extension sessions are deliberately not persisted; the
			// extension is the source of truth.
			const { setActiveSigner } = await import('$lib/nostr/signer');
			setActiveSigner(signer);
			resolveSignIn(signer.pubkey);
			reset();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			busy = false;
		}
	}

	function describeError(e: unknown): string {
		if (!(e instanceof Error)) return String(e);
		if (e.name === 'AggregateError' && Array.isArray((e as AggregateError).errors)) {
			const causes = (e as AggregateError).errors.map((x: unknown) => x instanceof Error ? x.message : String(x));
			return `Couldn't reach any signer relay. Underlying errors: ${causes.join('; ')}`;
		}
		return e.message || String(e);
	}

	async function pickDeepLink() {
		screen = 'deeplink';
		busy = true;
		error = '';
		authUrl = '';
		try {
			const handle = startNostrConnect({
				onAuthUrl: (url) => { authUrl = url; }
			});
			qrUri = handle.uri;
			qrAbort = handle.abort;
			busy = false;
			// Hand off to a registered nostrconnect:// handler. If none is
			// installed the navigation is dropped silently; the screen renders
			// a manual link as fallback.
			window.location.href = qrUri;
			const signer = await handle.signerPromise;
			// Signer now owns the client; drop the abort handle so reset() doesn't close it.
			qrAbort = null;
			resolveSignIn(signer.pubkey);
			reset();
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return;
			console.error('[signin] deeplink flow failed', e);
			error = describeError(e);
			busy = false;
		}
	}

	async function pickQR() {
		screen = 'qr';
		busy = true;
		error = '';
		authUrl = '';
		try {
			const handle = startNostrConnect({
				onAuthUrl: (url) => { authUrl = url; }
			});
			qrUri = handle.uri;
			qrAbort = handle.abort;
			qrDataUrl = await QRCode.toDataURL(qrUri, {
				width: 320,
				margin: 1,
				color: { dark: '#000000', light: '#ffffff' }
			});
			busy = false;
			const signer = await handle.signerPromise;
			// Signer now owns the client; drop the abort handle so reset() doesn't close it.
			qrAbort = null;
			resolveSignIn(signer.pubkey);
			reset();
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return;
			console.error('[signin] QR flow failed', e);
			error = describeError(e);
			busy = false;
		}
	}

	function pickBunkerUrl() {
		screen = 'bunker-url';
		error = '';
	}

	async function submitBunkerUrl() {
		if (!bunkerInput.trim()) return;
		busy = true;
		error = '';
		try {
			const signer = await connectViaBunkerURI(bunkerInput, {
				onAuthUrl: (url) => { authUrl = url; }
			});
			resolveSignIn(signer.pubkey);
			reset();
		} catch (e) {
			console.error('[signin] bunker URL flow failed', e);
			error = describeError(e);
			busy = false;
		}
	}

	function backToChoose() {
		if (qrAbort) { qrAbort(); qrAbort = null; }
		screen = 'choose';
		busy = false;
		error = '';
		authUrl = '';
		qrUri = '';
		qrDataUrl = '';
	}

	function copyUri() {
		if (qrUri) navigator.clipboard?.writeText(qrUri).catch(() => {});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	onDestroy(() => {
		if (qrAbort) qrAbort();
	});
</script>

{#if visible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={close} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Sign in" tabindex="-1">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>

			{#if screen === 'choose'}
				<h3>Sign in with Nostr</h3>
				<p class="hint">Pick how you want to sign.</p>
				<div class="choices">
					<button class="choice" onclick={pickExtension} disabled={!extOk}>
						<strong>Browser extension</strong>
						<span>{extOk ? 'Sign with your installed Nostr extension (Alby, nos2x, etc).' : 'No Nostr extension detected in this browser.'}</span>
					</button>
					<div class="section-note">
						<strong>Remote signer apps</strong>
						<span>These options save a connection on this device. It stays until you sign out.</span>
					</div>
					{#if isMobile}
						<button class="choice" onclick={pickDeepLink}>
							<strong>Open signer app</strong>
							<span>Open Amber, Primal, or another signer installed on this phone.</span>
						</button>
					{/if}
					<button class="choice" onclick={pickQR}>
						<strong>Scan QR with phone</strong>
						<span>Open Amber, Primal, or another mobile signer and scan a QR code.</span>
					</button>
					<button class="choice" onclick={pickBunkerUrl}>
						<strong>Paste bunker URL</strong>
						<span>Use a bunker:// URL or a name@domain from your signer.</span>
					</button>
				</div>
				<div class="actions">
					<button class="btn-secondary" onclick={close}>Cancel</button>
				</div>

			{:else if screen === 'extension'}
				<h3>Sign in with extension</h3>
				{#if busy}
					<p class="hint">Approve in your extension popup…</p>
				{:else if error}
					<p class="error">{error}</p>
				{/if}
				<div class="actions">
					<button class="btn-secondary" onclick={backToChoose}>Back</button>
				</div>

			{:else if screen === 'qr'}
				<h3>Scan with your signer</h3>
				<p class="hint">Open Amber, Primal, or another mobile signer and scan this QR code.</p>
				{#if qrDataUrl}
					<div class="qr-wrap">
						<img src={qrDataUrl} alt="Connection QR code" class="qr-img" />
					</div>
					<div class="uri-row">
						<code class="uri-text">{qrUri}</code>
						<button class="btn-secondary" onclick={copyUri}>Copy</button>
					</div>
				{:else if busy}
					<p class="hint">Generating connection…</p>
				{/if}
				{#if authUrl}
					<div class="auth-banner">
						<strong>Approve this connection</strong>
						<p>Your signer needs you to authorise the connection at:</p>
						<a href={authUrl} target="_blank" rel="noopener">{authUrl}</a>
					</div>
				{/if}
				{#if error}
					<p class="error">{error}</p>
				{/if}
				{#if !error}
					<p class="status">Waiting for signer…</p>
				{/if}
				<p class="relays-hint">Signer relay: {DEFAULT_NOSTRCONNECT_RELAYS.join(', ')}</p>
				<div class="actions">
					<button class="btn-secondary" onclick={backToChoose}>Back</button>
				</div>

			{:else if screen === 'deeplink'}
				<h3>Opening signer app…</h3>
				{#if busy}
					<p class="hint">Generating connection…</p>
				{:else}
					<p class="hint">If your signer didn't open, tap below to try again. If nothing happens, you may not have a signer app installed on this phone.</p>
					<a class="deeplink-btn" href={qrUri}>Open signer app</a>
				{/if}
				{#if authUrl}
					<div class="auth-banner">
						<strong>Approve this connection</strong>
						<p>Your signer needs you to authorise the connection at:</p>
						<a href={authUrl} target="_blank" rel="noopener">{authUrl}</a>
					</div>
				{/if}
				{#if error}
					<p class="error">{error}</p>
				{/if}
				{#if !busy && !error}
					<p class="status">Waiting for signer…</p>
				{/if}
				<div class="actions">
					<button class="btn-secondary" onclick={backToChoose}>Back</button>
				</div>

			{:else if screen === 'bunker-url'}
				<h3>Paste bunker URL</h3>
				<p class="hint">Paste a <code>bunker://</code> URL or a <code>name@domain</code> from your signer.</p>
				<textarea
					rows="3"
					bind:value={bunkerInput}
					placeholder="bunker://&lt;pubkey&gt;?relay=wss://...   or   alice@nsec.app"
					disabled={busy}
				></textarea>
				{#if authUrl}
					<div class="auth-banner">
						<strong>Approve this connection</strong>
						<p>Your signer needs you to authorise the connection at:</p>
						<a href={authUrl} target="_blank" rel="noopener">{authUrl}</a>
					</div>
				{/if}
				{#if error}
					<p class="error">{error}</p>
				{/if}
				{#if busy}
					<p class="status">Connecting…</p>
				{/if}
				<div class="actions">
					<button class="btn-secondary" onclick={backToChoose} disabled={busy}>Back</button>
					<button class="btn-primary" onclick={submitBunkerUrl} disabled={busy || !bunkerInput.trim()}>Connect</button>
				</div>
			{/if}

		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		padding: var(--space-4);
	}

	.dialog {
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		width: 100%;
		max-width: 480px;
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin: 0;
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.choice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		text-align: left;
		cursor: pointer;
	}

	.choice:hover:not(:disabled) {
		background: var(--color-bg-secondary);
		border-color: var(--color-primary);
	}

	.choice:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.choice strong {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.choice span {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.section-note {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-1) 0;
		margin-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.section-note strong {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
	}

	.section-note span {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.btn-primary, .btn-secondary {
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
	}

	.btn-secondary {
		background: var(--color-bg);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-bg-secondary);
	}

	.btn-primary {
		background: var(--color-primary);
		color: var(--color-primary-text);
		border-color: var(--color-primary);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-primary:disabled, .btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.qr-wrap {
		display: flex;
		justify-content: center;
		padding: var(--space-2);
		background: white;
		border-radius: var(--radius-sm);
	}

	.qr-img {
		display: block;
		width: 280px;
		height: 280px;
	}

	.deeplink-btn {
		display: block;
		text-align: center;
		padding: var(--space-2) var(--space-4);
		background: var(--color-primary);
		color: var(--color-primary-text);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.uri-row {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
	}

	.uri-text {
		flex: 1;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		padding: var(--space-2);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		word-break: break-all;
		max-height: 80px;
		overflow-y: auto;
	}

	textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		resize: vertical;
		background: var(--color-bg);
		color: var(--color-text);
	}

	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.error {
		font-size: var(--text-sm);
		color: var(--color-error, #dc2626);
		padding: var(--space-2);
		background: rgba(220, 38, 38, 0.08);
		border-radius: var(--radius-sm);
		margin: 0;
	}

	.status {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-align: center;
		margin: 0;
	}

	.relays-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted, var(--color-text-secondary));
		text-align: center;
		margin: 0;
	}

	.auth-banner {
		padding: var(--space-3);
		border: 1px solid rgba(245, 158, 11, 0.4);
		background: rgba(245, 158, 11, 0.08);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.auth-banner strong {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.auth-banner p {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		margin: 0;
	}

	.auth-banner a {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-primary);
		word-break: break-all;
	}
</style>

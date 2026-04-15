<script lang="ts">
	import { decode, decryptFragment } from '@nowhere/codec';

	interface Props {
		onImport: (url: string) => void;
		onClose: () => void;
		label?: string;
	}

	let { onImport, onClose, label = 'store' }: Props = $props();

	let url = $state('');
	let error = $state('');

	// Decrypt mode — shown when initial decode fails
	let decryptMode = $state(false);
	let password = $state('');
	let showPassword = $state(false);
	let decryptError = $state('');
	let decrypting = $state(false);
	let pendingFragment = $state('');

	function extractFragment(raw: string): string | null {
		if (!raw.trim()) return null;
		let fragment = raw.trim();
		const hashIdx = fragment.indexOf('#');
		if (hashIdx !== -1) fragment = fragment.slice(hashIdx + 1);
		const starIdx = fragment.indexOf('*');
		if (starIdx !== -1) fragment = fragment.slice(0, starIdx);
		return fragment || null;
	}

	function resetDecryptMode() {
		decryptMode = false;
		password = '';
		decryptError = '';
		pendingFragment = '';
		showPassword = false;
	}

	// Reset decrypt mode whenever URL field is edited
	$effect(() => {
		url;
		resetDecryptMode();
	});

	function handleImport() {
		error = '';
		resetDecryptMode();

		if (!url.trim()) {
			error = `Please paste a ${label} URL`;
			return;
		}

		const fragment = extractFragment(url);

		if (!fragment) {
			error = `No ${label} data found in URL (missing # fragment)`;
			return;
		}

		try {
			decode(fragment);
			onImport(fragment);
		} catch {
			// May be encrypted — offer password prompt
			pendingFragment = fragment;
			decryptMode = true;
		}
	}

	async function handleDecrypt() {
		decryptError = '';
		decrypting = true;
		try {
			const decrypted = await decryptFragment(pendingFragment, password);
			decode(decrypted); // validate it's a recognised site type
			onImport(decrypted);
		} catch {
			decryptError = 'Incorrect password.';
		} finally {
			decrypting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
		if (e.key === 'Enter' && !decryptMode) handleImport();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="Import {label}" tabindex="-1">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
		<h3>Import Existing {label.charAt(0).toUpperCase() + label.slice(1)}</h3>
		<p class="hint">Paste a {label} URL to edit it in the builder.</p>

		<div class="field">
			<label for="import-url">{label.charAt(0).toUpperCase() + label.slice(1)} URL</label>
			<textarea
				id="import-url"
				rows="4"
				bind:value={url}
				placeholder="https://nowhr.xyz/s#..."
				onkeydown={handleKeydown}
			></textarea>
		</div>

		{#if decryptMode}
			<p class="hint-warn">
				This URL could not be loaded. It may be encrypted — enter a password to try, or check that the URL is correct.
			</p>
			<div class="field">
				<label for="import-password">Password</label>
				<div class="password-wrap">
					<input
						id="import-password"
						type={showPassword ? 'text' : 'password'}
						bind:value={password}
						placeholder="Enter password"
						onkeydown={(e) => e.key === 'Enter' && !decrypting && password && handleDecrypt()}
						autofocus
					/>
					<button type="button" class="show-toggle" onclick={() => showPassword = !showPassword}>
						{showPassword ? 'Hide' : 'Show'}
					</button>
				</div>
			</div>
			{#if decryptError}
				<p class="error">{decryptError}</p>
			{/if}
		{/if}

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<div class="actions">
			<button class="btn-secondary" onclick={onClose}>Cancel</button>
			{#if decryptMode}
				<button
					class="btn-primary"
					onclick={handleDecrypt}
					disabled={!password || decrypting}
				>
					{decrypting ? 'Decrypting…' : 'Decrypt & Import'}
				</button>
			{:else}
				<button class="btn-primary" onclick={handleImport}>Import</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--space-4);
	}

	.dialog {
		background: var(--color-bg);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		width: 100%;
		max-width: 500px;
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.hint-warn {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		padding: var(--space-2) var(--space-3);
		background: rgba(234, 179, 8, 0.08);
		border: 1px solid rgba(234, 179, 8, 0.25);
		border-radius: var(--radius-sm);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		resize: vertical;
	}

	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.password-wrap {
		display: flex;
		gap: var(--space-2);
	}

	.password-wrap input {
		flex: 1;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.password-wrap input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.show-toggle {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
	}

	.show-toggle:hover {
		background: var(--color-border);
	}

	.error {
		font-size: var(--text-sm);
		color: var(--color-error);
		padding: var(--space-2);
		background: rgba(220, 38, 38, 0.1);
		border-radius: var(--radius-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.btn-secondary {
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.btn-secondary:hover {
		background: var(--color-bg-secondary);
	}

	.btn-primary {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

<script lang="ts">
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import HintIcon from './HintIcon.svelte';

	interface Props {
		value: string;
		onUpdate: (base64url: string) => void;
		onGenerate?: () => void;
		required?: boolean;
	}

	let { value, onUpdate, onGenerate, required = true }: Props = $props();

	let inputValue = $state('');
	let format = $state<'base64url' | 'hex' | 'npub' | 'invalid'>('base64url');
	let error = $state('');
	let lastEmitted = '';
	let inputEl: HTMLInputElement | undefined = $state();

	// Ephemeral nsec state (never persisted)
	let generatedNsec = $state('');
	let nsecCopied = $state(false);

	// On load / when value changes externally (import), convert to npub if possible
	$effect(() => {
		if (value !== lastEmitted) {
			if (value && /^[A-Za-z0-9_-]{43}$/.test(value)) {
				try {
					const bytes = base64urlToBytes(value);
					if (bytes.length === 32) {
						const npub = bytesToBech32(bytes, 'npub');
						inputValue = npub;
						format = 'npub';
						lastEmitted = value;
						return;
					}
				} catch {
					// fall through
				}
			}
			inputValue = value;
		}
	});

	function handleBlur() {
		if (inputEl) {
			inputEl.setSelectionRange(0, 0);
			inputEl.scrollLeft = 0;
		}
	}

	// Detect format and convert to base64url
	function handleInput(raw: string) {
		inputValue = raw;
		error = '';

		if (!raw) {
			format = 'base64url';
			lastEmitted = '';
			onUpdate('');
			return;
		}

		// npub format
		if (raw.startsWith('npub1')) {
			try {
				const bytes = bech32Decode(raw);
				if (bytes.length !== 32) {
					error = 'Invalid npub: wrong length';
					format = 'invalid';
					return;
				}
				format = 'npub';
				const b64 = bytesToBase64url(bytes);
				lastEmitted = b64;
				onUpdate(b64);
			} catch {
				error = 'Invalid npub format';
				format = 'invalid';
			}
			return;
		}

		// hex format (64 hex chars = 32 bytes)
		if (/^[0-9a-fA-F]{64}$/.test(raw)) {
			const bytes = hexToBytes(raw);
			format = 'hex';
			const b64 = bytesToBase64url(bytes);
			lastEmitted = b64;
			onUpdate(b64);
			return;
		}

		// base64url format (43 chars)
		if (/^[A-Za-z0-9_-]{43}$/.test(raw)) {
			format = 'base64url';
			lastEmitted = raw;
			onUpdate(raw);
			return;
		}

		// Partial input - pass through for editing
		if (raw.length < 43) {
			format = 'base64url';
			lastEmitted = raw;
			onUpdate(raw);
			return;
		}

		error = 'Enter a base64url key (43 chars), hex key (64 chars), or npub';
		format = 'invalid';
		lastEmitted = raw;
		onUpdate(raw);
	}

	function generateKeypair() {
		const sk = generateSecretKey();
		const pkHex = getPublicKey(sk);
		const pkBytes = hexToBytes(pkHex);
		const b64 = bytesToBase64url(pkBytes);
		const npub = bytesToBech32(pkBytes, 'npub');

		inputValue = npub;
		format = 'npub';
		lastEmitted = b64;
		onUpdate(b64);

		generatedNsec = bytesToBech32(sk, 'nsec');
		nsecCopied = false;
		onGenerate?.();
	}

	function copyNsec() {
		navigator.clipboard.writeText(generatedNsec);
		nsecCopied = true;
	}

	function hexToBytes(hex: string): Uint8Array {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		}
		return bytes;
	}

	function base64urlToBytes(b64: string): Uint8Array {
		const std = b64.replace(/-/g, '+').replace(/_/g, '/');
		const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}

	function bytesToBase64url(bytes: Uint8Array): string {
		let binary = '';
		for (const b of bytes) binary += String.fromCharCode(b);
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	// Bech32 encoder for npub/nsec
	const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

	function bytesToBech32(bytes: Uint8Array, hrp: string): string {
		// Convert 8-bit bytes to 5-bit groups
		const words: number[] = [];
		let acc = 0;
		let bits = 0;
		for (const b of bytes) {
			acc = (acc << 8) | b;
			bits += 8;
			while (bits >= 5) {
				bits -= 5;
				words.push((acc >> bits) & 0x1f);
			}
		}
		if (bits > 0) {
			words.push((acc << (5 - bits)) & 0x1f);
		}

		// Compute bech32 checksum
		const checksum = bech32Checksum(hrp, words);
		const allWords = [...words, ...checksum];

		let result = hrp + '1';
		for (const w of allWords) {
			result += BECH32_ALPHABET[w];
		}
		return result;
	}

	function bech32Checksum(hrp: string, data: number[]): number[] {
		const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
		const polymod = bech32Polymod(values) ^ 1;
		const checksum: number[] = [];
		for (let i = 0; i < 6; i++) {
			checksum.push((polymod >> (5 * (5 - i))) & 31);
		}
		return checksum;
	}

	function bech32HrpExpand(hrp: string): number[] {
		const result: number[] = [];
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) >> 5);
		result.push(0);
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) & 31);
		return result;
	}

	function bech32Polymod(values: number[]): number {
		const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
		let chk = 1;
		for (const v of values) {
			const b = chk >> 25;
			chk = ((chk & 0x1ffffff) << 5) ^ v;
			for (let i = 0; i < 5; i++) {
				if ((b >> i) & 1) chk ^= GEN[i];
			}
		}
		return chk;
	}

	// Minimal bech32 decoder for npub
	function bech32Decode(str: string): Uint8Array {
		const lower = str.toLowerCase();
		const sepIdx = lower.lastIndexOf('1');
		if (sepIdx < 1) throw new Error('No separator');

		const data: number[] = [];
		for (let i = sepIdx + 1; i < lower.length; i++) {
			const v = BECH32_ALPHABET.indexOf(lower[i]);
			if (v === -1) throw new Error('Invalid character');
			data.push(v);
		}

		// Remove 6-char checksum
		const values = data.slice(0, -6);

		// Convert 5-bit groups to 8-bit bytes
		let acc = 0;
		let bits = 0;
		const result: number[] = [];
		for (const v of values) {
			acc = (acc << 5) | v;
			bits += 5;
			if (bits >= 8) {
				bits -= 8;
				result.push((acc >> bits) & 0xff);
			}
		}
		return new Uint8Array(result);
	}

	const isValid = $derived(value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value));
</script>

<div class="npub-input">
	<div class="label-row">
		<label for="pubkey-input">Enter npub {#if required}<span class="required">*</span>{/if} <HintIcon tip="Your Nostr public key. Used to decrypt order details, verify your store, and display your profile data." /></label>
		<button type="button" class="generate-btn" onclick={generateKeypair}>Generate npub</button>
	</div>
	<input
		id="pubkey-input"
		type="text"
		bind:this={inputEl}
		value={inputValue}
		onchange={(e) => handleInput(e.currentTarget.value)}
		onblur={handleBlur}
		placeholder="npub1..., hex, or base64url"
		class:error={error !== ''}
		class:valid={isValid}
	/>
	<div class="input-meta">
		{#if error}
			<span class="error-text">{error}</span>
		{:else if isValid}
			<span class="valid-text">Valid key ({format})</span>
		{:else if value}
			<span class="hint-text">{value.length}/43 characters</span>
		{:else}
			<span class="hint-text">Your nostr public key for receiving payments</span>
		{/if}
	</div>

	{#if generatedNsec}
		<div class="nsec-section">
			<label for="nsec-display">Secret Key (nsec)</label>
			<div class="nsec-row">
				<input id="nsec-display" type="password" value={generatedNsec} readonly />
				<button type="button" class="copy-btn" onclick={copyNsec}>
					{nsecCopied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<span class="warning-text">Save your nsec now. It won't be shown again.</span>
		</div>
	{/if}
</div>

<style>
	.npub-input {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.required {
		color: var(--color-danger, #dc2626);
	}

	.generate-btn {
		padding: 2px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		font-size: 11px;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.generate-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	input {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
	}

	input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	input.error {
		border-color: var(--color-error);
	}

	input.valid {
		border-color: var(--color-success);
	}

	input[readonly] {
		background: var(--color-bg-secondary);
	}

	.input-meta {
		font-size: 11px;
		min-height: 16px;
	}

	.error-text {
		color: var(--color-error);
	}

	.valid-text {
		color: var(--color-success);
	}

	.hint-text {
		color: var(--color-text-muted);
	}

	.nsec-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.nsec-row {
		display: flex;
		gap: var(--space-2);
	}

	.nsec-row input {
		flex: 1;
		min-width: 0;
	}

	.copy-btn {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}

	.copy-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.warning-text {
		font-size: 11px;
		color: var(--color-error);
		font-weight: 500;
	}

	.tip-box {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.25);
		border-radius: var(--radius-sm);
		font-size: 12px;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}
</style>

<script lang="ts">
	import type { EncodeResult } from '@nowhere/codec';
	import { encryptFragment, base64urlToHex } from '@nowhere/codec';
	import { hasNostrExtension, signFragment } from '$lib/nostr/nip07.js';
	import HintIcon from './HintIcon.svelte';
	import QRCode from 'qrcode';
	import { RENDERER_ORIGIN } from '$lib/config.js';
	interface Props {
		result: EncodeResult | null;
		encryptEnabled: boolean;
		encryptedFragment: string;
		onEncryptToggle: (enabled: boolean) => void;
		onEncrypted: (sourceFragment: string, encryptedFragment: string) => void;
		onRemoveEncryption: () => void;
		onUrlChange?: (url: string) => void;
		notReadyItems?: string[];
		pubkeyWarning?: boolean;
		siteType?: string;
		expectedPubkey?: string;
		inventoryConfigured?: boolean;
		onNavigateToInventory?: () => void;
	}

	const defaultNotReadyItems = [
		'Public key (43 characters)',
		'Store name',
		'At least 1 item with name and price'
	];

	let { result, encryptEnabled, encryptedFragment, onEncryptToggle, onEncrypted, onRemoveEncryption, onUrlChange, notReadyItems = defaultNotReadyItems, pubkeyWarning = false, siteType = 'store', expectedPubkey = '', inventoryConfigured = true, onNavigateToInventory }: Props = $props();

	const encryptLabel = $derived(
		siteType === 'store' ? 'Encrypt Store' :
		siteType === 'message' ? 'Encrypt Message' :
		siteType === 'discussion' ? 'Encrypt Forum' :
		siteType === 'petition' ? 'Encrypt Petition' :
		siteType === 'fundraiser' ? 'Encrypt Fundraiser' :
		siteType === 'event' ? 'Encrypt Event' :
		'Encrypt'
	);

	const urlLabel = $derived(
		siteType === 'store' ? 'Store URL' :
		siteType === 'message' ? 'Message URL' :
		siteType === 'discussion' ? 'Forum URL' :
		siteType === 'petition' ? 'Petition URL' :
		siteType === 'fundraiser' ? 'Fundraiser URL' :
		siteType === 'event' ? 'Event URL' :
		siteType === 'drop' ? 'Drop URL' :
		'URL'
	);

	// Warning acknowledgement — persisted per site type in sessionStorage
	const ackKey = `nowhere-publish-ack-${siteType}`;
	let warningAcknowledged = $state(
		typeof sessionStorage !== 'undefined' && sessionStorage.getItem(ackKey) === '1'
	);

	let learnMoreOpen = $state(false);

	function acknowledgeWarning() {
		warningAcknowledged = true;
		sessionStorage.setItem(ackKey, '1');
	}

	let qrDataUrl = $state('');
	let copied = $state(false);

	// Signing state
	let urlRevealed = $state(false);
	let signing = $state(false);
	let signedFragment = $state('');
	let isSigned = $state(false);
	let signError = $state('');

	// Ephemeral form state — password never outlives the encrypt click
	let passwordInput = $state('');
	let confirmInput = $state('');
	let showPassword = $state(false);
	let encrypting = $state(false);
	let encryptError = $state('');

	function passwordStrength(pw: string): { score: number; label: string } {
		if (pw.length < 6) return { score: 0, label: 'Weak' };

		// Charset size based on character classes present
		const hasUpper = /[A-Z]/.test(pw);
		const hasLower = /[a-z]/.test(pw);
		const hasDigit = /\d/.test(pw);
		const hasSpecial = /[^A-Za-z0-9]/.test(pw);
		let charset = 0;
		if (hasLower) charset += 26;
		if (hasUpper) charset += 26;
		if (hasDigit) charset += 10;
		if (hasSpecial) charset += 32;
		const entropy = Math.log2(charset) * pw.length;

		// Repetition penalty: low unique-char ratio reduces entropy
		const uniqueRatio = new Set(pw).size / pw.length;
		const effectiveEntropy = entropy * Math.sqrt(uniqueRatio);

		// Sequential pattern penalty: runs of 4+ consecutive chars (abc, 123, qwer)
		let seqPenalty = 0;
		for (let i = 0; i < pw.length - 3; i++) {
			const codes = [pw.charCodeAt(i), pw.charCodeAt(i+1), pw.charCodeAt(i+2), pw.charCodeAt(i+3)];
			const diffs = [codes[1]-codes[0], codes[2]-codes[1], codes[3]-codes[2]];
			if (diffs[0] !== 0 && diffs[0] === diffs[1] && diffs[1] === diffs[2] && Math.abs(diffs[0]) === 1)
				seqPenalty += 8;
		}
		const finalEntropy = Math.max(0, effectiveEntropy - seqPenalty);

		if (finalEntropy >= 80) return { score: 3, label: 'Strong' };
		if (finalEntropy >= 55) return { score: 2, label: 'Good' };
		if (finalEntropy >= 30) return { score: 1, label: 'Fair' };
		return { score: 0, label: 'Weak' };
	}

	const strength = $derived(passwordStrength(passwordInput));
	const passwordsMatch = $derived(passwordInput === confirmInput);
	const canEncrypt = $derived(passwordInput.length > 0 && passwordsMatch && !encrypting);

	function revealUnsigned() {
		signedFragment = '';
		isSigned = false;
		urlRevealed = true;
	}

	async function signAndReveal() {
		const fragment = result?.fragment;
		if (!fragment) return;
		signing = true;
		signError = '';
		try {
			const { signedFragment: sf, signerPubkey } = await signFragment(fragment);
			if (expectedPubkey && signerPubkey !== base64urlToHex(expectedPubkey)) {
				signError = 'Wrong key — the signing extension used a different key than the one in your store. Switch to the correct key in your extension and try again.';
				return;
			}
			signedFragment = sf;
			isSigned = true;
			urlRevealed = true;
			// If encryption was applied before signing, the encrypted content is unsigned — clear it
			// so the user re-encrypts with the signed fragment included
			if (encryptedFragment) {
				onRemoveEncryption();
			}
		} catch {
			// Signing failed/rejected — fall back to unsigned reveal
			signedFragment = '';
			isSigned = false;
			urlRevealed = true;
		} finally {
			signing = false;
		}
	}

	// Reset reveal state when store data changes
	$effect(() => {
		// Track result.fragment to detect changes
		result?.fragment;
		urlRevealed = false;
		signedFragment = '';
		isSigned = false;
		signError = '';
	});

	// The active fragment: signed if available, else raw
	const activeFragment = $derived(isSigned && signedFragment ? signedFragment : result?.fragment ?? '');

	async function applyEncryption() {
		if (!activeFragment || !canEncrypt) return;
		encryptError = '';
		encrypting = true;
		try {
			const encrypted = await encryptFragment(activeFragment, passwordInput);
			// Pass the raw (unsigned) fragment as the staleness source — the parent uses this to
			// detect when store data changes, not when signing changes the fragment
			onEncrypted(result?.fragment ?? '', encrypted);
		} catch {
			encryptError = 'Encryption failed. Please try again.';
		} finally {
			// Zero password immediately — never retained
			passwordInput = '';
			confirmInput = '';
			encrypting = false;
		}
	}

	function removeEncryption() {
		onRemoveEncryption();
		passwordInput = '';
		confirmInput = '';
		encryptError = '';
	}

	// Whether encryption is stale (store data changed since last encrypt)
	const encryptionStale = $derived(
		encryptEnabled && !encryptedFragment && !encrypting
	);

	const storeUrl = $derived.by(() => {
		if (!result) return '';
		if (encryptEnabled && encryptedFragment) {
			return `${RENDERER_ORIGIN}/s#${encryptedFragment}`;
		}
		return `${RENDERER_ORIGIN}/s#${activeFragment}`;
	});

	// Notify parent of current URL length whenever it changes
	$effect(() => {
		onUrlChange?.(storeUrl);
	});

	// Generate QR code as high-res PNG (1024px — crisp up to QR version 40)
	$effect(() => {
		if (storeUrl) {
			QRCode.toDataURL(storeUrl, {
				width: 1024,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url) => {
				qrDataUrl = url;
			});
		} else {
			qrDataUrl = '';
		}
	});

	async function copyUrl() {
		if (!storeUrl) return;
		try {
			await navigator.clipboard.writeText(storeUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback
			const ta = document.createElement('textarea');
			ta.value = storeUrl;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

</script>

<div class="panel">
	<h3>Share Link</h3>

	{#if !result}
		<div class="not-ready">
			<p>Complete all required fields to generate your URL.</p>
			<ul>
				{#each notReadyItems as item}
					<li>{item}</li>
				{/each}
			</ul>
		</div>
	{:else}
		{#if siteType === 'store' || siteType === 'forum' || siteType === 'petition'}
		<div class="critical-warning">
			<div class="critical-warning-header">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
				<strong>Read this before sharing your link</strong>
			</div>
			<p class="critical-warning-lead">
				{#if siteType === 'petition'}
					Signatures submitted to this petition are encrypted with your public key. <span class="critical-emphasis">If you do not control the private key for that npub, every submission will be permanently unreadable. You will never see who signed.</span>
				{:else}
					Orders placed through this store are encrypted with your public key. <span class="critical-emphasis">If you do not control the private key for that npub, every order will be permanently unreadable. Buyers will pay and you will never know.</span>
				{/if}
			</p>
			<ul class="critical-warning-list">
				<li><strong>You must have the private key (nsec) for the npub entered in your settings.</strong> Without it you have no access to {siteType === 'petition' ? 'any submissions' : 'any orders'}. There is no recovery.</li>
				<li><strong>You must have a NIP-07 browser extension installed</strong> (such as Alby or nos2x) loaded with that same key to sign in to your manage page. Without it you cannot view {siteType === 'petition' ? 'signatures' : 'orders'}.</li>
			</ul>
			{#if !warningAcknowledged}
			<button type="button" class="critical-warning-ack-btn" onclick={acknowledgeWarning}>
				I understand. I have the private key and a NIP-07 extension.
			</button>
		{:else}
			<p class="critical-warning-acked">Acknowledged</p>
		{/if}
			<button type="button" class="learn-more-toggle" onclick={() => learnMoreOpen = !learnMoreOpen}>
				{learnMoreOpen ? 'Hide' : 'What is Nostr signing?'}
			</button>
			{#if learnMoreOpen}
			<div class="learn-more">
				<p><strong>Nostr keys</strong></p>
				<p>Nostr is a decentralized protocol. Your identity is a key pair:</p>
				<ul>
					<li><strong>npub</strong> — your public key. This is your identity that others can see. It goes in the public key field of your {siteType === 'petition' ? 'petition' : siteType === 'forum' ? 'forum' : 'store'} settings.</li>
					<li><strong>nsec</strong> — your private key. This is your secret. Anyone who has it can act as you and decrypt {siteType === 'petition' ? 'submissions' : 'orders'} sent to your npub. Never share it.</li>
				</ul>
				<p>If you don't have keys yet, a browser extension will generate them for you.</p>

				<p style="margin-top: var(--space-3)"><strong>Browser extensions (NIP-07)</strong></p>
				<p>A NIP-07 extension stores your private key in your browser and signs things on your behalf — so the key never leaves your device and websites never see your nsec directly.</p>
				<p>Popular extensions:</p>
				<ul>
					<li><strong>Alby</strong> — browser extension with a built-in Lightning wallet</li>
					<li><strong>nos2x</strong> — lightweight, signing-only extension</li>
					<li><strong>Nostore</strong> — minimal Firefox extension</li>
				</ul>
				<p>Install one, import or generate your keys inside it, and you're ready.</p>

				<p style="margin-top: var(--space-3)"><strong>Why this matters</strong></p>
				<p>{#if siteType === 'petition'}When someone signs your petition, their submission is encrypted with your npub so that only the holder of the matching private key can read it. If you don't control the nsec for the npub in your settings, those submissions are locked forever — no one can decrypt them.{:else if siteType === 'forum'}Your forum uses your npub to derive encryption keys. If you don't control the nsec for that npub, you won't be able to manage your forum or verify your identity as the owner.{:else}When a buyer places an order, it is encrypted with your npub so that only the holder of the matching private key can read it. If you don't control the nsec for the npub in your settings, those orders are locked forever — buyers will pay and you will never see their details.{/if}</p>
			</div>
			{/if}
		</div>
		{/if}

		{#if pubkeyWarning}
			<div class="pubkey-warning">
				<strong>Placeholder key detected</strong>
				<p>Your public key is still the AI-generated placeholder. Update it in the settings panel before sharing — anyone who responds may not be able to reach you.</p>
			</div>
		{/if}

		{#if siteType === 'store' && !inventoryConfigured}
			<div class="inventory-warning">
				<strong>Inventory management not configured</strong>
				<p>Once shared, this link is permanent. Without inventory management enabled, there is no way to close the store, mark items as sold out, or communicate any update to buyers. <button type="button" class="inventory-warning-link" onclick={onNavigateToInventory}>Configure it in the Inventory tab.</button></p>
			</div>
		{/if}

		{#if siteType === 'store' && inventoryConfigured}
			<div class="inventory-tip">
				<strong>Next step: publish an inventory event</strong>
				<p>Your store expects live stock data. Until you publish an inventory event, buyers opening your link cannot check out. Go to <a href="https://hostednowhere.com/manage/store" target="_blank" rel="noopener">hostednowhere.com/manage/store</a> to publish one. You can also close the store from there at any time.</p>
			</div>
		{/if}

		{#if warningAcknowledged || (siteType !== 'store' && siteType !== 'forum' && siteType !== 'petition')}
		<div class="encrypt-section">
			<button type="button" class="encrypt-toggle" onclick={() => onEncryptToggle(!encryptEnabled)}>
				<span class="toggle-track" class:active={encryptEnabled}>
					<span class="toggle-thumb"></span>
				</span>
				<span class="toggle-label">{encryptLabel} <HintIcon tip="When enabled, the store data is encrypted. Buyers need the password to open it." /></span>
			</button>

			{#if encryptEnabled}
				<div class="encrypt-options">
					<p class="encrypt-info">
						Only people with the link AND the password will be able to view your store. Without the password, the link will appear broken.
					</p>

					{#if encryptedFragment}
						<div class="encrypt-active">
							<div class="encrypt-active-row">
								<span class="encrypt-active-label">Encryption active</span>
								<button type="button" class="remove-encrypt-btn" onclick={removeEncryption}>Remove</button>
							</div>
						</div>
					{:else}
						{#if encryptionStale}
							<p class="encrypt-stale">Store data changed since last encryption. Re-enter your password to re-encrypt.</p>
						{/if}
						<div class="password-field">
							<input
								type={showPassword ? 'text' : 'password'}
								bind:value={passwordInput}
								placeholder="Enter password"
								class="password-input"
							/>
							<button
								type="button"
								class="toggle-visibility"
								onclick={() => (showPassword = !showPassword)}
							>
								{showPassword ? 'Hide' : 'Show'}
							</button>
						</div>
						<div class="password-field">
							<input
								type={showPassword ? 'text' : 'password'}
								bind:value={confirmInput}
								placeholder="Confirm password"
								class="password-input"
							/>
						</div>
						{#if confirmInput && !passwordsMatch}
							<p class="encrypt-error">Passwords do not match</p>
						{/if}
						{#if passwordInput}
							<div class="strength-bar">
								{#each [0, 1, 2, 3] as i}
									<div
										class="strength-segment"
										class:filled={i <= strength.score}
										class:weak={strength.score === 0}
										class:fair={strength.score === 1}
										class:good={strength.score === 2}
										class:strong={strength.score === 3}
									></div>
								{/each}
								<span
									class="strength-label"
									class:weak={strength.score === 0}
									class:fair={strength.score === 1}
									class:good={strength.score === 2}
									class:strong={strength.score === 3}
								>{strength.label}</span>
							</div>
						{/if}
						{#if encryptError}
							<p class="encrypt-error">{encryptError}</p>
						{/if}
						<button type="button" class="encrypt-btn" onclick={applyEncryption} disabled={!canEncrypt}>
							{encrypting ? 'Encrypting...' : 'Encrypt'}
						</button>
					{/if}
				</div>
			{/if}
		</div>

		{#if !urlRevealed}
			<div class="reveal-section">
				<div class="reveal-buttons">
					<button type="button" class="reveal-btn" onclick={revealUnsigned}>
						Reveal Link
					</button>
					<button
						type="button"
						class="reveal-btn reveal-btn-sign"
						onclick={signAndReveal}
						disabled={signing || !hasNostrExtension()}
						title={!hasNostrExtension() ? 'Nostr signing extension required' : ''}
					>
						{signing ? 'Signing...' : 'Sign & Reveal Link'}
					</button>
				</div>
				{#if signError}
					<div class="sign-error">
						<strong>Signature failed</strong>
						<p>{signError}</p>
					</div>
				{:else if !hasNostrExtension()}
					<p class="sign-hint">Install a Nostr signing extension to sign your store.</p>
				{/if}
			</div>
		{:else}
			<div class="url-section">
				<div class="url-header">
					<span class="section-label">{urlLabel}</span>
					{#if isSigned}
						<span class="signed-badge">Signed</span>
					{/if}
				</div>
				{#if encrypting}
					<div class="url-display">
						<code class="url-text encrypting">Encrypting...</code>
					</div>
				{:else}
					<div class="url-display">
						<code class="url-text">{storeUrl}</code>
					</div>
				{/if}
				<button class="copy-btn" onclick={copyUrl} disabled={encrypting || !storeUrl}>
					{copied ? 'Copied!' : 'Copy URL'}
				</button>

				{#if result.warn}
					<p class="warning">URL is {result.length} characters (over 2000 limit). Some platforms may not support it.</p>
				{/if}
			</div>

			{#if qrDataUrl}
				<div class="qr-section">
					<span class="section-label">QR Code</span>
					<img src={qrDataUrl} alt="Store QR code" class="qr-img" />
				</div>
			{/if}
		{/if}
		{/if}

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

	.section-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.critical-warning {
		padding: var(--space-4);
		background: rgba(220, 38, 38, 0.06);
		border: 2px solid rgba(220, 38, 38, 0.5);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.critical-warning-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: #b91c1c;
	}

	.critical-warning-header svg {
		flex-shrink: 0;
	}

	.critical-warning-header strong {
		font-size: var(--text-sm);
		font-weight: 700;
		color: #b91c1c;
	}

	.critical-warning-lead {
		font-size: var(--text-sm);
		color: var(--color-text);
		line-height: 1.6;
	}

	.critical-emphasis {
		font-weight: 700;
		color: #b91c1c;
	}

	.critical-warning-list {
		margin: 0;
		padding-left: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.critical-warning-list li {
		font-size: var(--text-sm);
		color: var(--color-text);
		line-height: 1.5;
	}

	.critical-warning-list li strong {
		color: var(--color-text);
	}

	.critical-warning-ack-btn {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: #b91c1c;
		color: white;
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.critical-warning-ack-btn:hover {
		background: #991b1b;
	}

	.critical-warning-acked {
		font-size: var(--text-xs);
		font-weight: 600;
		color: #b91c1c;
		text-align: center;
		opacity: 0.6;
	}

	.learn-more-toggle {
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		align-self: center;
	}

	.learn-more-toggle:hover {
		color: var(--color-text);
	}

	.learn-more {
		padding: var(--space-3) var(--space-4);
		background: rgba(0, 0, 0, 0.03);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.learn-more p {
		font-size: var(--text-xs);
		color: var(--color-text);
		line-height: 1.6;
		margin: 0;
	}

	.learn-more ul {
		margin: var(--space-1) 0;
		padding-left: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.learn-more li {
		font-size: var(--text-xs);
		color: var(--color-text);
		line-height: 1.5;
	}

	.learn-more strong {
		font-weight: 600;
	}

	.pubkey-warning {
		padding: var(--space-3) var(--space-4);
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.35);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.pubkey-warning strong {
		font-size: var(--text-sm);
		font-weight: 600;
		color: #92400e;
	}

	.pubkey-warning p {
		font-size: var(--text-xs);
		color: #78350f;
		line-height: 1.5;
	}

	.inventory-warning {
		padding: var(--space-3) var(--space-4);
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.35);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.inventory-warning strong {
		font-size: var(--text-sm);
		font-weight: 600;
		color: #92400e;
	}

	.inventory-warning p {
		font-size: var(--text-xs);
		color: #78350f;
		line-height: 1.5;
	}

	.inventory-warning-link {
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		color: #92400e;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}

	.inventory-warning-link:hover {
		color: #78350f;
	}

	.inventory-tip {
		padding: var(--space-3) var(--space-4);
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.35);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.inventory-tip strong {
		font-size: var(--text-sm);
		font-weight: 600;
		color: #1e40af;
	}

	.inventory-tip p {
		font-size: var(--text-xs);
		color: #1e3a8a;
		line-height: 1.5;
	}

	.inventory-tip a {
		color: #1e40af;
		font-weight: 600;
		text-decoration: underline;
	}

	.inventory-tip a:hover {
		color: #1e3a8a;
	}

	.not-ready {
		padding: var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
	}

	.not-ready ul {
		margin-top: var(--space-2);
		padding-left: var(--space-6);
		font-size: var(--text-sm);
	}

	.not-ready li {
		margin-bottom: var(--space-1);
	}

	/* Encryption section */
	.encrypt-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.encrypt-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
	}

	.toggle-track {
		position: relative;
		display: inline-block;
		width: 36px;
		height: 20px;
		background: var(--color-border);
		border-radius: 10px;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.toggle-track.active {
		background: var(--color-primary);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		background: white;
		border-radius: 50%;
		transition: transform var(--transition-fast);
	}

	.toggle-track.active .toggle-thumb {
		transform: translateX(16px);
	}

	.toggle-label {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.encrypt-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
	}

	.encrypt-info {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.encrypt-active {
		padding: var(--space-2) 0;
	}

	.encrypt-active-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.encrypt-active-label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-success, #22c55e);
	}

	.remove-encrypt-btn {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		color: var(--color-text-secondary);
	}

	.remove-encrypt-btn:hover {
		background: var(--color-bg-tertiary);
		color: #e53e3e;
		border-color: #e53e3e;
	}

	.encrypt-error {
		font-size: var(--text-xs);
		color: #e53e3e;
	}

	.encrypt-btn {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.encrypt-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.encrypt-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.encrypt-stale {
		font-size: var(--text-xs);
		color: var(--color-warning);
		padding: var(--space-2);
		background: rgba(245, 158, 11, 0.1);
		border-radius: var(--radius-sm);
		line-height: 1.4;
	}

	.password-field {
		display: flex;
		gap: var(--space-2);
	}

	.password-input {
		flex: 1;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
	}

	.password-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.toggle-visibility {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
	}

	.toggle-visibility:hover {
		background: var(--color-bg-tertiary);
	}

	.strength-bar {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.strength-segment {
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: var(--color-border);
		transition: background var(--transition-fast);
	}

	.strength-segment.filled.weak {
		background: #e53e3e;
	}

	.strength-segment.filled.fair {
		background: #d69e2e;
	}

	.strength-segment.filled.good {
		background: #3182ce;
	}

	.strength-segment.filled.strong {
		background: #38a169;
	}

	.strength-label {
		font-size: var(--text-xs);
		font-weight: 600;
		margin-left: var(--space-1);
		white-space: nowrap;
	}

	.strength-label.weak { color: #e53e3e; }
	.strength-label.fair { color: #d69e2e; }
	.strength-label.good { color: #3182ce; }
	.strength-label.strong { color: #38a169; }

	.url-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.url-display {
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow-x: auto;
	}

	.url-text {
		font-size: var(--text-xs);
		word-break: break-all;
		font-family: var(--font-mono);
	}

	.url-text.encrypting {
		color: var(--color-text-muted);
		font-style: italic;
		font-family: var(--font-body);
	}

	.copy-btn {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 600;
		font-size: var(--text-sm);
		transition: all var(--transition-fast);
	}

	.copy-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.copy-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.warning {
		font-size: var(--text-xs);
		color: var(--color-warning);
		padding: var(--space-2);
		background: rgba(245, 158, 11, 0.1);
		border-radius: var(--radius-sm);
	}

	.qr-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
	}

	.qr-img {
		width: 256px;
		height: 256px;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}

	.reveal-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: center;
	}

	.reveal-buttons {
		display: flex;
		gap: var(--space-2);
		width: 100%;
	}

	.reveal-btn {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		color: var(--color-text);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.reveal-btn:hover:not(:disabled) {
		background: var(--color-bg-tertiary);
	}

	.reveal-btn-sign {
		background: var(--color-primary);
		color: var(--color-primary-text);
		border-color: var(--color-primary);
	}

	.reveal-btn-sign:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.reveal-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sign-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.sign-error {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		background: rgba(220, 38, 38, 0.06);
		border: 1px solid rgba(220, 38, 38, 0.25);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.sign-error strong {
		font-size: var(--text-sm);
		font-weight: 600;
		color: #dc2626;
	}

	.sign-error p {
		font-size: var(--text-xs);
		color: #7f1d1d;
		line-height: 1.5;
		margin: 0;
	}

	.url-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.signed-badge {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-success, #22c55e);
		background: rgba(34, 197, 94, 0.1);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
	}
</style>

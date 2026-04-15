<script lang="ts">
	import { onMount } from 'svelte';
	import { decryptFragment } from '@nowhere/codec';
	import { initHashReader } from '$lib/renderer/utils/hash-reader.js';
	import { siteData, decodeError, v1Deprecated, isLoading, decodeFromHash } from '$lib/renderer/stores/site-data.js';
	import LoadingScreen from '$lib/renderer/components/LoadingScreen.svelte';
	// Static imports — all types loaded regardless (privacy requirement)
	import StoreRenderer from '$lib/renderer/store/StoreRenderer.svelte';
	import EventRenderer from '$lib/renderer/event/EventRenderer.svelte';
	import MessageRenderer from '$lib/renderer/message/MessageRenderer.svelte';
	import FundraiserRenderer from '$lib/renderer/fundraiser/FundraiserRenderer.svelte';
	import PetitionRenderer from '$lib/renderer/petition/PetitionRenderer.svelte';
	import ForumRenderer from '$lib/renderer/forum/ForumRenderer.svelte';
	import DropRenderer from '$lib/renderer/drop/DropRenderer.svelte';
	import ArtRenderer from '$lib/renderer/art/ArtRenderer.svelte';

	let urlInput = $state('');
	let decryptPassword = $state('');
	let decryptError = $state('');
	let decrypting = $state(false);

	function loadUrl() {
		const input = urlInput.trim();
		if (!input) return;
		const hashIndex = input.indexOf('#');
		const fragment = hashIndex !== -1 ? input.slice(hashIndex + 1) : input;
		if (!fragment) return;
		window.location.hash = fragment;
	}

	async function attemptDecrypt() {
		if (!decryptPassword || decrypting) return;
		decrypting = true;
		decryptError = '';
		try {
			const fragment = window.location.hash.slice(1);
			const decrypted = await decryptFragment(fragment, decryptPassword);
			decodeFromHash(decrypted);
		} catch {
			decryptError = 'Incorrect password';
			decryptPassword = '';
			setTimeout(() => { decryptError = ''; }, 3000);
		} finally {
			decrypting = false;
		}
	}

	onMount(() => {
		initHashReader();
	});
</script>

{#if $isLoading}
	<main class="center-page landing-shell">
		<div class="composition">
			<div class="wordmark loading-title">nowhere</div>
			<div class="input-wrap" style="visibility:hidden">
				<input class="link-input" type="text" disabled />
			</div>
		</div>
		<footer class="landing-footer" style="visibility:hidden">&nbsp;</footer>
	</main>
{:else if $v1Deprecated}
	<main class="center-page landing-shell">
		<button class="nav-back" onclick={() => { window.location.hash = ''; window.location.reload(); }}><span class="arr-left">←</span> try another link</button>
		<div class="composition error-page">
			<div class="wordmark">Old beta link</div>
			<p class="error-desc">This link is from an early test version of Nowhere.</p>
			<p class="hint">It was created during the beta period of this project, before the public launch. This early URL format has changed and old links can no longer be read.</p>
		</div>
		<footer class="landing-footer">Hosted <a href="https://hostednowhere.com" class="footer-nowhere">nowhere</a>. Present everywhere.</footer>
	</main>
{:else if $decodeError}
	<main class="center-page landing-shell">
		<button class="nav-back" onclick={() => { window.location.hash = ''; window.location.reload(); }}><span class="arr-left">←</span> try another link</button>
		<div class="composition error-page">
			<div class="wordmark">Unable to Load</div>
			<p class="error-desc">{$decodeError}</p>
			<p class="hint">The URL may be corrupted or incomplete, or the site may be encrypted.</p>
			<div class="decrypt-section">
				<div class="input-wrap">
					<input
						type="password"
						bind:value={decryptPassword}
						placeholder="Enter password"
						class="link-input"
						onkeydown={(e) => e.key === 'Enter' && attemptDecrypt()}
					/>
					{#if decryptPassword}
						<button
							class="input-action"
							onclick={attemptDecrypt}
							disabled={decrypting}
						>{#if decrypting}Decrypting...{:else}Decrypt <span class="arr">→</span>{/if}</button>
					{/if}
				</div>
				{#if decryptError}
					<p class="decrypt-error">{decryptError}</p>
				{/if}
			</div>
		</div>
		<footer class="landing-footer">Hosted <a href="https://hostednowhere.com" class="footer-nowhere">nowhere</a>. Present everywhere.</footer>
	</main>
{:else if $siteData}
	{#if $siteData.siteType === 'store'}
		<StoreRenderer />
	{:else if $siteData.siteType === 'event'}
		<EventRenderer />
	{:else if $siteData.siteType === 'message'}
		<MessageRenderer />
	{:else if $siteData.siteType === 'fundraiser'}
		<FundraiserRenderer />
	{:else if $siteData.siteType === 'petition'}
		<PetitionRenderer />
	{:else if $siteData.siteType === 'discussion'}
		<ForumRenderer />
	{:else if $siteData.siteType === 'drop'}
		<DropRenderer />
	{:else if $siteData.siteType === 'art'}
		<ArtRenderer />
	{/if}
{:else}
	<main class="center-page landing-shell">
		<div class="composition">
			<a href="https://hostednowhere.com" class="wordmark">nowhere</a>
			<div class="input-wrap">
				<input
					class="link-input"
					type="url"
					inputmode="url"
					autocomplete="off"
					autocorrect="off"
					spellcheck="false"
					bind:value={urlInput}
					placeholder="paste a link to load it"
					onkeydown={(e) => e.key === 'Enter' && loadUrl()}
				/>
				<button
					class="go-btn"
					class:active={!!urlInput.trim()}
					onclick={loadUrl}
					tabindex="-1"
				>go <span class="arr">→</span></button>
			</div>
		</div>
		<footer class="landing-footer">Hosted <a href="https://hostednowhere.com" class="footer-nowhere">nowhere</a>. Present everywhere.</footer>
	</main>
{/if}

<style>
	/* Ink-opacity color system matching nowhr */
	.landing-shell {
		--bg:       #fafaf8;
		--ink:      #1a1a1a;
		--ink-60:   rgba(26,26,26,0.60);
		--ink-35:   rgba(26,26,26,0.35);
		--ink-15:   rgba(26,26,26,0.09);
		--serif:    Georgia, 'Times New Roman', Times, serif;
		--mono:     ui-monospace, 'SF Mono', 'Cascadia Code', 'Courier New', monospace;

		background: var(--bg);
	}

	/* Override store.css white background for landing states */
	:global(html):has(.landing-shell) {
		background-color: #fafaf8 !important;
	}
	:global(body):has(.landing-shell) {
		background-color: #fafaf8 !important;
	}

	.center-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 0 1.75rem;
		text-align: center;
	}

	.composition {
		width: 100%;
		max-width: 400px;
	}

	/* WORDMARK */
	.wordmark {
		display: block;
		font-size: clamp(1.75rem, 5vw, 2.5rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
		text-decoration: none;
		margin-bottom: clamp(1.25rem, 3vh, 2rem);
	}


	.loading-title {
		opacity: 0.08;
	}

	/* INPUT */
	.input-wrap {
		position: relative;
	}

	.link-input {
		width: 100%;
		font-family: var(--mono);
		font-size: clamp(0.875rem, 2.5vw, 1.0625rem);
		color: var(--ink);
		background: none;
		border: none;
		border-bottom: 1px solid var(--ink-35);
		outline: none;
		padding: 0.3rem 1.5rem 0.6rem 0;
		letter-spacing: 0.01em;
		transition: border-color 0.2s;
		text-align: center;
	}

	.link-input:has(+ .go-btn) { padding-left: 3.5rem; padding-right: 3.5rem; }
	.link-input::placeholder { color: var(--ink-35); }
	.link-input:focus { border-bottom-color: var(--ink); }

	/* GO BUTTON (inline, right side of input) */
	.go-btn {
		position: absolute;
		right: 0;
		top: 0.3rem;
		bottom: 0.6rem;
		display: flex;
		align-items: center;
		font-family: var(--mono);
		font-size: clamp(0.875rem, 2.5vw, 1.0625rem);
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: default;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.go-btn.active {
		color: var(--ink-60);
		cursor: pointer;
	}

	.go-btn.active:hover { color: var(--ink); }

	.arr { position: relative; top: -0.1em; }
	.arr-left { position: relative; top: -0.05em; }

	/* FOOTER */
	.landing-footer {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 1.5rem 1.75rem;
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-align: center;
	}

	.footer-nowhere {
		color: var(--ink);
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.footer-nowhere:hover { opacity: 0.6; }

	/* NAV BACK */
	.nav-back {
		position: fixed;
		top: 1rem;
		left: 1.5rem;
		z-index: 10;
		font-size: 0.75rem;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.nav-back:hover { color: var(--ink); }

	/* ERROR PAGE */
	.error-page .wordmark {
		font-size: clamp(1.5rem, 5vw, 2.25rem);
		margin-bottom: clamp(1rem, 2.5vh, 1.5rem);
	}

	.error-desc {
		font-family: var(--serif);
		font-size: clamp(0.9rem, 2.5vw, 1.0625rem);
		color: var(--ink-60);
		line-height: 1.6;
		margin-bottom: 0.5rem;
	}

	.hint {
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: var(--ink-35);
		line-height: 1.6;
	}

	.decrypt-section {
		margin-top: clamp(2rem, 5vh, 3.5rem);
		position: relative;
	}

	.input-action {
		position: absolute;
		right: 0;
		top: 0.375rem;
		bottom: 0.75rem;
		display: flex;
		align-items: center;
		font-family: var(--serif);
		font-size: clamp(0.875rem, 2vw, 1rem);
		color: var(--ink-60);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.input-action:hover { color: var(--ink); }
	.input-action:disabled { color: var(--ink-35); cursor: default; }

	.decrypt-error {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		margin-top: 0.5rem;
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: #c53030;
	}
</style>

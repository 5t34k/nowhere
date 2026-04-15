<script lang="ts">
	import { APP_VERSION } from '$lib/version';

	interface Props {
		buildTime: string;
	}

	let { buildTime }: Props = $props();

	const NPUB = 'npub1x5t34kxd79m657qcuwp4zrypy9t8t4e6yks5zapjvau29t0xvgaqakh2p2';

	let npubCopied = $state(false);

	const formattedBuildTime = buildTime.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

	function copyNpub() {
		navigator.clipboard.writeText(NPUB);
		npubCopied = true;
		setTimeout(() => { npubCopied = false; }, 1200);
	}
</script>

<main class="version-main">
	<div class="version-card">
		<div class="version-heading">
			<a href="/" class="wordmark">nowhere</a>
			<span class="version-label">version</span>
		</div>
		<div class="version-number">{APP_VERSION}</div>
		<div class="version-time">{formattedBuildTime}</div>
		<div class="version-built-by">Built by 5t34k</div>
		<button class="version-npub" onclick={copyNpub} title="Tap to copy">
			{npubCopied ? 'copied' : NPUB}
		</button>
	</div>
</main>

<style>
	.version-main {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.version-card {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.version-heading {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.5rem;
	}

	.wordmark {
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
		text-decoration: none;
	}

	.version-label {
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-35);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.version-number {
		font-family: var(--mono);
		font-size: 1.5rem;
		color: var(--ink);
	}

	.version-time {
		font-family: var(--mono);
		font-size: 0.875rem;
		color: var(--ink-60);
	}

	.version-built-by {
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-35);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-top: 0.75rem;
	}

	.version-npub {
		font-family: var(--mono);
		font-size: 0.625rem;
		color: var(--ink-60);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		word-break: break-all;
		text-align: center;
		max-width: 22rem;
	}
	.version-npub:hover { color: var(--ink); }
</style>

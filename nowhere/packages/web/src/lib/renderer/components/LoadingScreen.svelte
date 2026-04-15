<script lang="ts">
	interface Props {
		message?: string;
	}

	let { message = 'Verifying store...' }: Props = $props();
</script>

<main class="loading-screen">
	<div class="loading-content">
		<div class="logo">Nowhere</div>
		<p class="message">{message}</p>
		<div class="spinner"></div>
	</div>
</main>

<style>
	.loading-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--color-bg);
	}

	.loading-content {
		text-align: center;
	}

	.logo {
		font-size: var(--text-3xl);
		font-weight: 700;
		margin-bottom: var(--space-6);
		color: var(--color-text);
	}

	.message {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

<script lang="ts">
</script>

<main class="failed-screen">
	<div class="failed-content">
		<div class="icon">!</div>
		<h1>Store Not Verified</h1>
		<p>This store could not be verified. The store owner's profile does not contain a matching verification hash.</p>
		<ul>
			<li>The store may have been closed</li>
			<li>The store URL may have been modified</li>
			<li>The store was never registered</li>
		</ul>
		<a href="/" class="leave-btn">Leave</a>
	</div>
</main>

<style>
	.failed-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: var(--space-8);
	}

	.failed-content {
		max-width: 420px;
		text-align: center;
	}

	.icon {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		background: var(--color-warning);
		color: white;
		font-weight: 700;
		font-size: var(--text-2xl);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto var(--space-4);
	}

	h1 {
		font-size: var(--text-2xl);
		margin-bottom: var(--space-4);
	}

	p {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
		line-height: 1.5;
	}

	ul {
		list-style: none;
		text-align: left;
		margin-bottom: var(--space-6);
	}

	li {
		padding: var(--space-1) 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	li::before {
		content: '• ';
		color: var(--color-text-muted);
	}

	.leave-btn {
		display: inline-block;
		padding: var(--space-3) var(--space-8);
		background: var(--color-primary);
		color: var(--color-primary-text);
		border-radius: var(--radius-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.leave-btn:hover {
		background: var(--color-primary-hover);
		text-decoration: none;
	}
</style>

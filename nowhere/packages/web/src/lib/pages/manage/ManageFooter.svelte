<footer class="footer">
	<div class="footer-left">
		<div class="footer-mark">nowhere</div>
		<div class="footer-tagline">Hosted nowhere. Present everywhere.</div>
	</div>
	<div class="footer-links">
		<a href="#" class="footer-link">support the project</a>
		<span class="footer-sep">·</span>
		<a href="#" class="footer-link">github</a>
	</div>
</footer>

<style>
	.footer {
		flex-shrink: 0;
		padding: clamp(1.75rem, 4vh, 2.75rem) var(--col);
		border-top: 1px solid var(--ink-15);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.footer-left {
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}

	.footer-mark {
		font-size: 0.8125rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		color: var(--ink-35);
	}

	.footer-tagline {
		font-size: 0.625rem;
		letter-spacing: 0.04em;
		color: var(--ink-35);
	}

	.footer-links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.footer-sep {
		font-size: 0.625rem;
		color: var(--ink-35);
	}

	.footer-link {
		font-size: 0.75rem;
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.footer-link:hover { color: var(--ink); }
</style>

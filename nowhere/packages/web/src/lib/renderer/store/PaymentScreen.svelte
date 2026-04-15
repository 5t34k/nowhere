<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { formatCurrency } from '@nowhere/codec';
	import QRCode from 'qrcode';

	interface Props {
		invoice: string;
		amountSats: number;
		amountFiat: number;
		currency: string;
		orderId: string;
		receipt?: string;
		rateLockSeconds?: number;
		lightningAddress?: string;
		onReturnToStore: () => void;
	}

	let { invoice, amountSats, amountFiat, currency, orderId, receipt = '', rateLockSeconds = 900, lightningAddress = '', onReturnToStore }: Props = $props();

	const isSats = $derived(currency === 'SAT' || currency === 'sats' || currency === 'BTC');

	let qrDataUrl = $state('');
	let copied = $state(false);
	let confirmed = $state(false);
	let receiptCopied = $state(false);

	function downloadReceipt() {
		const blob = new Blob([receipt], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `order-${orderId}.receipt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function copyReceipt() {
		try {
			await navigator.clipboard.writeText(receipt);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = receipt;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		receiptCopied = true;
		setTimeout(() => (receiptCopied = false), 2000);
	}
	let timeLeft = $state(900);
	let timerInterval: ReturnType<typeof setInterval>;

	$effect(() => {
		timeLeft = rateLockSeconds;
	});

	const minutes = $derived(Math.floor(timeLeft / 60));
	const seconds = $derived(timeLeft % 60);
	const timerColor = $derived(timeLeft < 120 ? 'var(--color-error)' : timeLeft < 300 ? 'var(--color-warning)' : 'var(--color-text-secondary)');

	async function copyInvoice() {
		try {
			await navigator.clipboard.writeText(invoice);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback
			const ta = document.createElement('textarea');
			ta.value = invoice;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

	onMount(async () => {
		qrDataUrl = await QRCode.toDataURL(invoice.toUpperCase(), {
			width: 1024,
			margin: 2,
			color: { dark: '#000000', light: '#ffffff' }
		});

		timerInterval = setInterval(() => {
			timeLeft = Math.max(0, timeLeft - 1);
			if (timeLeft === 0) {
				clearInterval(timerInterval);
			}
		}, 1000);
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
	});
</script>

<div class="payment-screen">
	<div class="payment-content">
		{#if !confirmed}
			<button class="back-btn" onclick={onReturnToStore}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
				</svg>
				Back to store
			</button>

			<h2>Order placed successfully!</h2>
			<p class="subtitle">Please complete your payment.</p>

			{#if qrDataUrl}
				<div class="qr-container">
					<img src={qrDataUrl} alt="Lightning invoice QR code" />
				</div>
			{:else}
				<div class="qr-placeholder">Generating QR code...</div>
			{/if}

			{#if lightningAddress}
				<p class="ln-address">{lightningAddress}</p>
			{/if}

			<div class="amount">
				<span class="sats">{amountSats.toLocaleString()} sats</span>
				{#if !isSats}
					<span class="fiat">({formatCurrency(amountFiat, currency)})</span>
				{/if}
			</div>

			<button class="copy-btn" onclick={copyInvoice}>
				{copied ? 'Copied!' : 'Copy Invoice'}
			</button>

			{#if !isSats}
				{#if timeLeft > 0}
					<p class="timer" style:color={timerColor}>
						Rate locked for {minutes}:{seconds.toString().padStart(2, '0')}
					</p>
				{:else}
					<p class="timer-expired">Rate lock expired. Please refresh to get a new rate.</p>
				{/if}
			{/if}

			<div class="order-info">
				<div class="info-row">
					<span>Order ID</span>
					<span class="mono">{orderId}</span>
				</div>
			</div>

			<p class="warning">Do not close this page until payment is confirmed.</p>

			<button class="paid-btn" onclick={() => (confirmed = true)}>
				Mark as Paid
			</button>
		{:else}
			<h2>Thank you!</h2>
			<p class="subtitle">Your payment has been sent.</p>

			<div class="confirmation-box">
				<p>Your order ID is:</p>
				<p class="order-id-large mono">{orderId}</p>
				<p class="keep-copy">Please keep a copy of this for your records.</p>
			</div>

			{#if receipt}
				<div class="receipt-section">
					<p class="receipt-hint">Save your receipt to prove this purchase if relays go offline.</p>
					<div class="receipt-btns">
						<button class="receipt-btn" onclick={downloadReceipt}>Download Receipt</button>
						<button class="receipt-btn" onclick={copyReceipt}>{receiptCopied ? 'Copied!' : 'Copy Receipt'}</button>
					</div>
				</div>
			{/if}

			<button class="return-btn" onclick={onReturnToStore}>Return to Store</button>
		{/if}
	</div>
</div>

<style>
	.payment-screen {
		display: flex;
		justify-content: center;
		padding: var(--space-6);
		min-height: calc(100vh - 80px);
	}

	.payment-content {
		max-width: 400px;
		width: 100%;
		text-align: center;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		padding: var(--space-2) 0;
		margin-bottom: var(--space-4);
	}

	.back-btn:hover {
		color: var(--color-text);
	}

	h2 {
		font-size: var(--text-xl);
		margin-bottom: var(--space-2);
	}

	.subtitle {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-6);
	}

	.qr-container {
		display: flex;
		justify-content: center;
		margin-bottom: var(--space-4);
	}

	.qr-container img {
		width: 280px;
		height: 280px;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}

	.qr-placeholder {
		width: 280px;
		height: 280px;
		margin: 0 auto var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
	}

	.ln-address {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		word-break: break-all;
		margin-bottom: var(--space-4);
	}

	.amount {
		margin-bottom: var(--space-4);
	}

	.sats {
		font-size: var(--text-2xl);
		font-weight: 700;
		display: block;
	}

	.fiat {
		color: var(--color-text-secondary);
	}

	.copy-btn {
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-weight: 600;
		margin-bottom: var(--space-4);
		transition: all var(--transition-fast);
	}

	.copy-btn:hover {
		background: var(--color-bg-secondary);
	}

	.timer {
		font-size: var(--text-sm);
		margin-bottom: var(--space-4);
	}

	.timer-expired {
		font-size: var(--text-sm);
		color: var(--color-error);
		margin-bottom: var(--space-4);
	}

	.order-info {
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		padding: var(--space-1) 0;
	}

	.mono {
		font-family: var(--font-mono);
	}

	.warning {
		font-size: var(--text-xs);
		color: var(--color-warning);
		padding: var(--space-2) var(--space-3);
		background: rgba(245, 158, 11, 0.1);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-4);
	}

	.paid-btn {
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 600;
		font-size: var(--text-base);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.paid-btn:hover {
		background: var(--color-primary-hover);
	}

	.confirmation-box {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		padding: var(--space-6);
		margin-top: var(--space-4);
	}

	.order-id-large {
		font-size: var(--text-xl);
		font-weight: 700;
		margin: var(--space-3) 0;
	}

	.keep-copy {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.return-btn {
		width: 100%;
		margin-top: var(--space-4);
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-weight: 600;
		font-size: var(--text-base);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.return-btn:hover {
		background: var(--color-bg-secondary);
	}

	.receipt-section {
		margin: var(--space-4) 0;
		padding: var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
	}

	.receipt-hint {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-3);
	}

	.receipt-btns {
		display: flex;
		gap: var(--space-2);
		justify-content: center;
	}

	.receipt-btn {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.receipt-btn:hover {
		background: var(--color-bg-tertiary);
	}
</style>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';

	interface Props {
		methodName: string;
		instructions: string;
		paymentAmount: string;
		orderId: string;
		exchangeRate?: string;
		methodColor?: string;
		qrValue?: string;
		onConfirmSent: () => void;
	}

	let { methodName, instructions, paymentAmount, orderId, exchangeRate = '', methodColor = '', qrValue = '', onConfirmSent }: Props = $props();

	let qrDataUrl = $state('');

	let confirmed = $state(false);
	let copiedId = $state(false);
	let acknowledgedId = $state(false);

	// Rate-lock timer (only when a currency conversion is involved)
	let timeLeft = $state(900);
	let timerInterval: ReturnType<typeof setInterval>;

	const minutes = $derived(Math.floor(timeLeft / 60));
	const seconds = $derived(timeLeft % 60);
	const timerColor = $derived(timeLeft < 120 ? 'var(--color-error)' : timeLeft < 300 ? 'var(--color-warning)' : 'var(--color-text-secondary)');

	onMount(async () => {
		if (exchangeRate) {
			timerInterval = setInterval(() => {
				timeLeft = Math.max(0, timeLeft - 1);
				if (timeLeft === 0) clearInterval(timerInterval);
			}, 1000);
		}
		if (qrValue) {
			try {
				qrDataUrl = await QRCode.toDataURL(qrValue, {
					width: 512,
					margin: 2,
					color: { dark: '#000000', light: '#ffffff' }
				});
			} catch {
				// QR generation failed — skip silently
			}
		}
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
	});

	async function copyOrderId() {
		try {
			await navigator.clipboard.writeText(orderId);
			copiedId = true;
			setTimeout(() => (copiedId = false), 2000);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = orderId;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			copiedId = true;
			setTimeout(() => (copiedId = false), 2000);
		}
	}

	function handleConfirmSent() {
		confirmed = true;
		onConfirmSent();
	}
</script>

<div class="payment-screen">
	<div class="payment-content">
		{#if !confirmed}
			<h2>Complete your {methodName} payment</h2>
			<p class="subtitle">Follow the instructions below to send your payment.</p>

			<div class="order-callout">
				<p class="order-callout-heading">You <strong>must</strong> use this Order ID as your payment description</p>
				<p class="order-callout-sub">Without this, the seller cannot match your payment to your order. The seller will have no way of seeing your order details and your funds will be lost.</p>
				<div class="order-callout-id">
					<span class="mono">{orderId}</span>
					<button class="copy-id" onclick={copyOrderId}>
						<span class="copy-label">{copiedId ? 'Copied!' : 'Copy'}</span>
					</button>
				</div>
			</div>

			{#if qrDataUrl}
				<div class="qr-box">
					<img src={qrDataUrl} alt="Payment QR code" class="qr-img" />
				</div>
			{/if}

			<div class="instructions-box">
				{#each instructions.split('\n') as line}
					<p class="instruction-line">{line}</p>
				{/each}
			</div>

			{#if exchangeRate}
				<p class="exchange-rate">{exchangeRate}</p>
			{/if}

			<div class="amount">
				<span class="amount-value">{paymentAmount}</span>
			</div>

			{#if exchangeRate}
				{#if timeLeft > 0}
					<p class="timer" style:color={timerColor}>
						Rate locked for {minutes}:{seconds.toString().padStart(2, '0')}
					</p>
				{:else}
					<p class="timer-expired">Rate lock expired. Please refresh to get a new rate.</p>
				{/if}
			{/if}

			{#if !acknowledgedId}
				<button
					class="acknowledge-btn"
					onclick={() => (acknowledgedId = true)}
				>
					I have included the Order ID in my payment description
				</button>
			{:else}
				<button class="confirm-btn" onclick={handleConfirmSent}>
					Payment Sent
				</button>
			{/if}
		{:else}
			<h2>Thank you!</h2>
			<p class="subtitle">Your order has been placed.</p>

			<div class="confirmation-box">
				<p>Your order ID is:</p>
				<p class="order-id-large mono">{orderId}</p>
				<p class="keep-copy">Please keep a copy of this for your records.</p>
			</div>
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

	h2 {
		font-size: var(--text-xl);
		margin-bottom: var(--space-2);
	}

	.subtitle {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-6);
	}

	.qr-box {
		display: flex;
		justify-content: center;
		margin-bottom: var(--space-4);
	}

	.qr-img {
		width: 200px;
		height: 200px;
		border-radius: var(--radius-md);
	}

	.instructions-box {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
		text-align: left;
	}

	.instruction-line {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text);
	}

	.exchange-rate {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.amount {
		margin-bottom: var(--space-4);
	}

	.amount-value {
		font-size: var(--text-2xl);
		font-weight: 700;
		display: block;
	}

	.order-callout {
		border-left: 4px solid var(--color-error);
		background: rgba(220, 38, 38, 0.06);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
		text-align: left;
	}

	.order-callout-heading {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--space-1);
	}

	.order-callout-sub {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-3);
	}

	.order-callout-id {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-lg);
		font-family: var(--font-mono);
	}

	.copy-id {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}

	.copy-id:hover {
		background: rgba(220, 38, 38, 0.1);
	}

	.copy-label {
		font-size: var(--text-xs);
		color: var(--color-primary);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.acknowledge-btn {
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-error);
		color: #fff;
		font-weight: 600;
		font-size: var(--text-base);
		cursor: pointer;
		transition: opacity var(--transition-fast);
	}

	.acknowledge-btn:hover {
		opacity: 0.85;
	}

	.confirm-btn {
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

	.confirm-btn:hover {
		background: var(--color-primary-hover);
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
</style>

<script lang="ts">
	import type { TipMethod } from '$lib/tips.js';
	import { resolveLightningAddress, fetchInvoice } from '$lib/renderer/payment/lightning.js';
	import QRCode from 'qrcode';

	interface Props {
		tipMethods: TipMethod[];
		onCollapse?: () => void;
	}

	let { tipMethods, onCollapse }: Props = $props();

	// Which tip method is selected (crossfade index, null = show all labels)
	let selectedIdx = $state<number | null>(null);
	const selected = $derived(selectedIdx !== null ? tipMethods[selectedIdx] : null);

	// Lightning flow state
	let lnStep = $state<'amount' | 'invoice' | 'error'>('amount');
	let customAmount = $state('');
	let invoice = $state('');
	let invoiceQr = $state('');
	let lnError = $state('');
	let loading = $state(false);

	// Copy state
	let copied = $state(false);
	let sent = $state(false);

	// Custom method QR
	let customQr = $state('');

	function selectMethod(idx: number) {
		if (selectedIdx === idx) {
			selectedIdx = null;
			resetState();
			return;
		}
		selectedIdx = idx;
		resetState();
	}

	function resetState() {
		lnStep = 'amount';
		customAmount = '';
		invoice = '';
		invoiceQr = '';
		lnError = '';
		copied = false;
		sent = false;
		customQr = '';
	}

	function markSent() {
		sent = true;
		setTimeout(() => {
			onCollapse?.();
		}, 3500);
	}

	async function generateInvoice(sats: number) {
		if (!selected || selected.type !== 'lightning') return;
		loading = true;
		lnError = '';
		try {
			const params = await resolveLightningAddress(selected.value);
			const msats = sats * 1000;
			if (msats < params.minSendable || msats > params.maxSendable) {
				throw new Error(
					`Amount must be between ${Math.ceil(params.minSendable / 1000)} and ${Math.floor(params.maxSendable / 1000)} sats`
				);
			}
			const pr = await fetchInvoice(params.callback, msats);
			invoice = pr;
			invoiceQr = await QRCode.toDataURL(pr.toUpperCase(), {
				width: 512,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			});
			lnStep = 'invoice';
		} catch (e: unknown) {
			lnError = e instanceof Error ? e.message : 'Failed to generate invoice';
			lnStep = 'error';
		} finally {
			loading = false;
		}
	}

	function handleSubmitAmount() {
		const sats = parseInt(customAmount, 10);
		if (sats > 0) generateInvoice(sats);
	}

	$effect(() => {
		if (selected?.type === 'custom' && selected.showQr && selected.value) {
			QRCode.toDataURL(selected.value, {
				width: 512,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url) => { customQr = url; });
		} else {
			customQr = '';
		}
	});

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// fallback
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

{#if sent}
	<div class="footer-tip-thanks">Thank you!</div>
{:else if selectedIdx === null}
	<!-- Method list (like contact list) -->
	<div class="footer-tip-crossfade">
		<div class="footer-contact-layer">
			{#each tipMethods as method, i}
				{#if i > 0}<span class="footer-contact-sep">&middot;</span>{/if}
				<button class="footer-contact-name" onclick={() => selectMethod(i)}>{method.label}</button>
			{/each}
		</div>
	</div>
{:else if selected?.type === 'lightning'}
	<!-- Lightning tip flow -->
	<div class="footer-tip-crossfade">
		<div class="footer-contact-layer">
			<button class="footer-contact-name footer-tip-back" onclick={() => selectMethod(selectedIdx ?? 0)}>
				{selected.label}
			</button>
		</div>
	</div>
	{#if lnStep === 'amount'}
		<div class="footer-tip-amount">
			<input
				type="text"
				inputmode="numeric"
				class="footer-tip-input"
				bind:value={customAmount}
				placeholder="Amount"
				disabled={loading}
				onkeydown={(e) => { if (e.key === 'Enter') handleSubmitAmount(); }}
			/>
			<button
				class="footer-tip-send"
				disabled={loading || !customAmount}
				onclick={handleSubmitAmount}
			>{loading ? '...' : 'Generate invoice'}</button>
		</div>
	{:else if lnStep === 'invoice'}
		<div class="footer-tip-invoice">
			{#if invoiceQr}
				<img src={invoiceQr} alt="Lightning invoice" class="footer-tip-qr" />
			{/if}
			<span class="footer-tip-ln-address">{selected.value}</span>
			<div class="footer-tip-invoice-actions">
				<button class="footer-tip-action" onclick={() => copyText(invoice)}>
					{copied ? 'Copied!' : 'Copy invoice'}
				</button>
				<a class="footer-tip-action" href="lightning:{invoice}">
					Open wallet
				</a>
			</div>
			<div class="footer-tip-invoice-actions">
				<button class="footer-tip-action" onclick={markSent}>Sent</button>
				<button class="footer-tip-back-link" onclick={() => { lnStep = 'amount'; invoice = ''; invoiceQr = ''; copied = false; }}>
					Different amount
				</button>
			</div>
		</div>
	{:else if lnStep === 'error'}
		<div class="footer-tip-error">
			<span>{lnError}</span>
			<button class="footer-tip-action" onclick={() => { lnStep = 'amount'; lnError = ''; }}>Try again</button>
		</div>
	{/if}
{:else if selected?.type === 'custom'}
	<!-- Custom tip method -->
	<div class="footer-tip-crossfade">
		<div class="footer-contact-layer">
			<button class="footer-contact-name footer-tip-back" onclick={() => selectMethod(selectedIdx ?? 0)}>
				{selected.label}
			</button>
			<span class="footer-contact-handle footer-contact-copy" role="button" tabindex="0" onclick={() => copyText(selected.value)} onkeydown={(e) => { if (e.key === 'Enter') copyText(selected.value); }}>
				{copied ? 'Copied!' : selected.value}
			</span>
		</div>
	</div>
	{#if customQr}
		<div class="footer-tip-invoice">
			<img src={customQr} alt="{selected.label} QR" class="footer-tip-qr" />
		</div>
	{/if}
	<div class="footer-tip-invoice-actions">
		<button class="footer-tip-action" onclick={markSent}>Sent</button>
	</div>
{/if}

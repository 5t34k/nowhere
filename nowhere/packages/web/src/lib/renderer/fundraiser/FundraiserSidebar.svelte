<script lang="ts">
	import type { TipMethod } from '$lib/tips.js';
	import { resolveLightningAddress, fetchInvoice } from '$lib/renderer/payment/lightning.js';
	import QRCode from 'qrcode';

	interface Props {
		tipMethods: TipMethod[];
		onCollapse?: () => void;
	}

	let { tipMethods, onCollapse }: Props = $props();

	// ─── Donation flow ───
	let selectedIdx = $state<number | null>(null);
	let lnStep = $state<'amount' | 'invoice' | 'error'>('amount');
	let customAmount = $state('');
	let invoice = $state('');
	let invoiceQr = $state('');
	let lnError = $state('');
	let loading = $state(false);
	let copied = $state(false);
	let sent = $state(false);
	let customQr = $state('');

	const selected = $derived(selectedIdx !== null ? tipMethods[selectedIdx] : null);

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

	function collapse() {
		selectedIdx = null;
		resetState();
		onCollapse?.();
	}

	function markSent() {
		sent = true;
		setTimeout(() => {
			sent = false;
			selectedIdx = null;
			resetState();
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
				throw new Error(`Amount must be between ${Math.ceil(params.minSendable / 1000)} and ${Math.floor(params.maxSendable / 1000)} sats`);
			}
			const pr = await fetchInvoice(params.callback, msats);
			invoice = pr;
			invoiceQr = await QRCode.toDataURL(pr.toUpperCase(), {
				width: 512, margin: 2,
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

	async function copyText(text: string) {
		try { await navigator.clipboard.writeText(text); } catch {}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	$effect(() => {
		if (selected?.type === 'custom' && selected.showQr && selected.value) {
			QRCode.toDataURL(selected.value, {
				width: 512, margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url) => { customQr = url; });
		} else {
			customQr = '';
		}
	});
</script>

{#if sent}
	<div class="fr-thanks-card"><div class="fr-tip-thanks">Thank you!</div></div>
{:else}
	<div class="fr-donate-methods">
		{#each tipMethods as method, i}
			<button class="fr-method-btn" class:active={selectedIdx === i} onclick={() => selectMethod(i)}>
				{#if method.type === 'lightning'}
					<svg class="fr-icon-lightning" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
				{/if}
				{method.label}
			</button>

			{#if selectedIdx === i && method.type === 'lightning'}
				<div class="fr-ln-flow">
					{#if lnStep === 'amount'}
						<div class="fr-ln-address">{method.value}</div>
						<div class="fr-ln-input-row">
							<input class="fr-ln-input" type="text" inputmode="numeric" bind:value={customAmount} placeholder="Amount (sats)" disabled={loading} onkeydown={(e) => { if (e.key === 'Enter') handleSubmitAmount(); }} />
							<button class="fr-ln-generate" disabled={loading || !customAmount} onclick={handleSubmitAmount}>{loading ? '...' : 'Invoice'}</button>
						</div>
					{:else if lnStep === 'invoice'}
						{#if invoiceQr}
							<img src={invoiceQr} alt="Lightning invoice" class="fr-ln-qr" />
						{/if}
						<div class="fr-ln-address">{selected?.value ?? ''}</div>
						<div class="fr-ln-actions">
							<button class="fr-ln-action" onclick={() => copyText(invoice)}>{copied ? 'Copied!' : 'Copy'}</button>
							<a class="fr-ln-action" href="lightning:{invoice}">Wallet</a>
							<button class="fr-ln-action" onclick={markSent}>Sent</button>
						</div>
						<div class="fr-ln-actions" style="margin-top: 0.25rem;">
							<button class="fr-ln-action" onclick={() => { lnStep = 'amount'; invoice = ''; invoiceQr = ''; copied = false; }}>Different amount</button>
						</div>
					{:else if lnStep === 'error'}
						<div class="fr-ln-error">{lnError}</div>
						<div class="fr-ln-actions">
							<button class="fr-ln-action" onclick={() => { lnStep = 'amount'; lnError = ''; }}>Try again</button>
						</div>
					{/if}
				</div>
			{/if}

			{#if selectedIdx === i && method.type === 'custom'}
				<div class="fr-custom-handle">
					<span style="flex:1; word-break:break-all;">{method.value}</span>
					<button class="fr-custom-copy" onclick={() => copyText(method.value)}>{copied ? 'Copied!' : 'Copy'}</button>
				</div>
				{#if customQr}
					<div style="text-align:center; margin-top:0.5rem;">
						<img src={customQr} alt="{method.label} QR" class="fr-ln-qr" />
					</div>
				{/if}
				<div class="fr-ln-actions" style="margin-top:0.5rem;">
					<button class="fr-ln-action" onclick={markSent}>Sent</button>
				</div>
			{/if}
		{/each}
	</div>
	<button class="fr-ln-action" style="width:100%; margin-top:0.75rem;" onclick={collapse}>Cancel</button>
{/if}

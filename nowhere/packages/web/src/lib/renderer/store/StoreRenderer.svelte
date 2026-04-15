<script lang="ts">
	import type { Item, StoreData, Tag } from '@nowhere/codec';
	import { formatCurrency, base64urlToHex } from '@nowhere/codec';
	import { siteData, siteSigned, siteFragment } from '$lib/renderer/stores/site-data.js';
	import { cart, cartCount, cartSubtotal, computeShipping, computeDiscount } from '$lib/renderer/stores/cart.js';
	import { getExchangeRate, fiatToSats, convertFiat } from '$lib/renderer/payment/exchange-rate.js';
	import { resolveLightningAddress, fetchInvoice } from '$lib/renderer/payment/lightning.js';
	import { generateOrderId, assembleOrder } from '$lib/renderer/payment/order.js';
	import { publishOrder, TESTING_MODE } from '$lib/renderer/nostr/messaging.js';
	import { USE_LOCAL_RELAY, USE_PTR_RELAY, getOrderRelays } from '$lib/renderer/nostr/relay-pool.js';
	import { computeVerification, type VerificationResult } from '$lib/renderer/nostr/verify.js';
	import { computeLookupHash } from '$lib/nostr/inventory-keys.js';
	import { fetchStatus, type StatusPayload } from '$lib/nostr/inventory.js';
	import { getPaymentMethod, getAvailablePaymentMethods } from '$lib/payment-methods.js';
	import LoadingScreen from '$lib/renderer/components/LoadingScreen.svelte';
	import StoreBanner from './StoreBanner.svelte';
	import StoreHeader from './StoreHeader.svelte';
	import SellerInfo from './SellerInfo.svelte';
	import ProductGrid from './ProductGrid.svelte';
	import ProductModal from './ProductModal.svelte';
	import CartDrawer from './CartDrawer.svelte';
	import CheckoutView from './CheckoutView.svelte';
	import PaymentScreen from './PaymentScreen.svelte';
	import FiatPaymentScreen from './FiatPaymentScreen.svelte';
	import StoreFooter from './StoreFooter.svelte';

	const storeData = $derived($siteData as StoreData & { siteType: 'store' });

	let selectedItem = $state<Item | null>(null);
	let selectedItemIdx = $state(-1);
	let cartOpen = $state(false);
	let view = $state<'store' | 'checkout' | 'payment' | 'fiat-payment' | 'fiat-confirmed' | 'error'>('store');
	let paymentError = $state('');
	let processingPayment = $state(false);

	// Payment state (Bitcoin)
	let paymentInvoice = $state('');
	let paymentSats = $state(0);
	let paymentFiat = $state(0);
	let paymentOrderId = $state('');
	let paymentLnAddress = $state('');

	// Fiat payment state
	let fiatMethodName = $state('');
	let fiatInstructions = $state('');
	let fiatPaymentAmount = $state('');
	let fiatOrderId = $state('');
	let fiatExchangeRate = $state('');
	let fiatMethodColor = $state('');
	let fiatQrValue = $state('');

	// Receipt (set after order is published, for both Bitcoin and fiat flows)
	let paymentReceipt = $state('');
	let receiptCopied = $state(false);

	function downloadReceipt(orderId: string) {
		const blob = new Blob([paymentReceipt], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `order-${orderId}.receipt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function copyReceipt() {
		try {
			await navigator.clipboard.writeText(paymentReceipt);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = paymentReceipt;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		receiptCopied = true;
		setTimeout(() => (receiptCopied = false), 2000);
	}

	// Verification state
	let verification = $state<VerificationResult | null>(null);
	let verificationDone = $state(false);

	// Inventory state — keyed by lookupHash so multiple stores are cached independently.
	// Distinguishes 'found' (event published + decrypted) from 'missing' (relays reachable,
	// no event). Fetch errors are NOT cached so the user can retry.
	type InventoryCacheEntry =
		| { state: 'found'; payload: StatusPayload }
		| { state: 'missing' };

	const INVENTORY_CACHE_KEY = 'nw-inventory-cache-v2';
	const INVENTORY_FETCH_TIMEOUT_MS = 10000;

	function loadInventoryCache(): Record<string, InventoryCacheEntry> {
		try {
			return JSON.parse(sessionStorage.getItem(INVENTORY_CACHE_KEY) ?? '{}');
		} catch {
			return {};
		}
	}

	function saveInventoryCache(cache: Record<string, InventoryCacheEntry>): void {
		sessionStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(cache));
	}

	let inventoryCache = $state<Record<string, InventoryCacheEntry>>(loadInventoryCache());
	let statusLoading = $state(false);
	let statusError = $state<string | null>(null);

	const currentLookupHash = $derived(
		storeData ? computeLookupHash($siteFragment) : null
	);
	const inventoryEntry = $derived<InventoryCacheEntry | null>(
		currentLookupHash ? (inventoryCache[currentLookupHash] ?? null) : null
	);
	const storeStatus = $derived(
		inventoryEntry?.state === 'found' ? inventoryEntry.payload : null
	);
	const statusLoaded = $derived(inventoryEntry !== null);
	const storeClosed = $derived(!!storeStatus?.closed);
	const stockLevels = $derived(storeStatus?.items ?? {});

	// Pre-compute stock level for the selected item (modal)
	const selectedItemStockLevel = $derived(selectedItemIdx >= 0 ? stockLevels[String(selectedItemIdx)] : undefined);

	// Check if a cart item is unavailable (sold out / discontinued)
	function isCartItemUnavailable(ci: { item: Item }): boolean {
		const idx = findItemIndex(ci.item);
		const sl = idx >= 0 ? stockLevels[String(idx)] : undefined;
		return sl === 0 || sl === 1 || ci.item.tags.some((t: Tag) => t.key === 'o');
	}

	// Pre-compute cart unavailability check
	const hasUnavailableInCart = $derived($cart.some(isCartItemUnavailable));

	// Bech32 helpers for npub conversion
	const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

	function bech32Polymod(values: number[]): number {
		const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
		let chk = 1;
		for (const v of values) {
			const b = chk >> 25;
			chk = ((chk & 0x1ffffff) << 5) ^ v;
			for (let i = 0; i < 5; i++) {
				if ((b >> i) & 1) chk ^= GEN[i];
			}
		}
		return chk;
	}

	function bech32HrpExpand(hrp: string): number[] {
		const result: number[] = [];
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) >> 5);
		result.push(0);
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) & 31);
		return result;
	}

	function bech32Checksum(hrp: string, data: number[]): number[] {
		const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
		const polymod = bech32Polymod(values) ^ 1;
		const checksum: number[] = [];
		for (let i = 0; i < 6; i++) {
			checksum.push((polymod >> (5 * (5 - i))) & 31);
		}
		return checksum;
	}

	function hexToNpub(hex: string): string {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		}
		const words: number[] = [];
		let acc = 0;
		let bits = 0;
		for (const b of bytes) {
			acc = (acc << 8) | b;
			bits += 8;
			while (bits >= 5) {
				bits -= 5;
				words.push((acc >> bits) & 0x1f);
			}
		}
		if (bits > 0) {
			words.push((acc << (5 - bits)) & 0x1f);
		}
		const checksum = bech32Checksum('npub', words);
		const allWords = [...words, ...checksum];
		let result = 'npub1';
		for (const w of allWords) {
			result += BECH32_ALPHABET[w];
		}
		return result;
	}

	const npub = $derived(storeData ? hexToNpub(base64urlToHex(storeData.pubkey)) : '');

	const currency = $derived.by(() => {
		if (!storeData) return 'USD';
		const tag = storeData.tags.find((t: Tag) => t.key === '$');
		return tag?.value ?? 'USD';
	});

	const storeDescription = $derived.by(() => {
		if (!storeData) return '';
		const tag = storeData.tags.find((t: Tag) => t.key === 'b');
		return tag?.value ?? '';
	});

	const storeDeliveryDays = $derived.by(() => {
		if (!storeData) return '';
		const tag = storeData.tags.find((t: Tag) => t.key === 'D');
		return tag?.value ?? '';
	});

	function findItemIndex(item: Item): number {
		if (!storeData) return -1;
		return storeData.items.findIndex((i) => i.name === item.name);
	}

	function handleAddFromGrid(item: Item, qty?: number) {
		if (storeClosed) return;
		const idx = findItemIndex(item);
		if (idx < 0) return;
		const sl = stockLevels[String(idx)];
		if (sl === 0 || sl === 1) return;
		cart.addItem(item, qty ?? 1, { itemIndex: idx });
		cartOpen = true;
	}

	function handleAddFromModal(item: Item, qty: number) {
		if (storeClosed) return;
		const sl = stockLevels[String(selectedItemIdx)];
		if (sl === 0 || sl === 1) return;
		cart.addItem(item, qty, { itemIndex: selectedItemIdx });
		cartOpen = true;
	}

	function handleCheckout() {
		// Block checkout if inventory is enabled but we don't have a status payload.
		// The CartDrawer button is also disabled in these states — this is defense in depth.
		if (inventoryGate !== 'ok') return;
		// Remove discontinued or sold-out items before proceeding
		if (storeData) {
			let removed = 0;
			for (let i = $cart.length - 1; i >= 0; i--) {
				const cartItem = $cart[i];
				const idx = findItemIndex(cartItem.item);
			const sl = idx >= 0 ? stockLevels[String(idx)] : undefined;
				const isSoldOut = sl === 0 || sl === 1 || cartItem.item.tags.some((t: Tag) => t.key === 'o');
				if (isSoldOut) {
					cart.removeItem(i);
					removed++;
				}
			}
			if (removed > 0 && $cart.length === 0) {
				return; // cart is now empty, stay on cart view
			}
		}
		cartOpen = false;
		view = 'checkout';
	}

	async function handleCheckoutSubmit(formData: Record<string, string>) {
		if (!storeData || processingPayment) return;

		if (inventoryEnabled && inventoryGate !== 'ok') {
			paymentError =
				inventoryGate === 'pending'
					? 'Still loading inventory. Please wait a moment and try again.'
					: 'Inventory could not be loaded for this store. Please try again later, or contact the seller if the problem persists.';
			view = 'error';
			return;
		}

		if (typeof navigator !== 'undefined' && navigator.onLine === false) {
			paymentError = 'No internet connection. Please check your connection and try again.';
			view = 'error';
			return;
		}

		processingPayment = true;
		paymentError = '';

		const selectedMethodId = formData._paymentMethod || 'bitcoin';
		const method = getPaymentMethod(selectedMethodId, storeData.tags);
		const available = getAvailablePaymentMethods(storeData.tags);
		const selectedAvailable = available.find((a) => a.method.id === selectedMethodId);

		const CHECKOUT_TIMEOUT_MS = 20000;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => reject(new Error('CHECKOUT_TIMEOUT')), CHECKOUT_TIMEOUT_MS);
		});

		try {
			await Promise.race([timeoutPromise, (async () => {
			const shipping = computeShipping($cart, storeData.tags, formData.country);
			const discount = computeDiscount($cart, storeData.tags);
			const subtotal = $cartSubtotal;
			const total = subtotal - discount.amount + shipping;
			const orderId = await generateOrderId(JSON.stringify($cart) + JSON.stringify(formData));
			const fragment = window.location.hash.slice(1);
			const storeId = computeLookupHash(fragment);
			const pubkeyHex = base64urlToHex(storeData.pubkey);
			const relays = getOrderRelays(storeData.tags);

			if (!method || method.type === 'crypto') {
				// Bitcoin / crypto flow
				const rate = await getExchangeRate(currency);
				const totalSats = fiatToSats(total, rate.satsPerUnit);

				const order = assembleOrder(
					$cart, subtotal, shipping, total, totalSats,
					rate.satsPerUnit, rate.source, formData, storeId, orderId,
					'bitcoin'
				);

				paymentReceipt = await publishOrder(order, pubkeyHex, relays);

				const lnTag = storeData.tags.find((t: Tag) => t.key === 'l');
				const lightningAddr = lnTag?.value;
				if (!lightningAddr) {
					throw new Error('Seller has no lightning address configured. Please contact the seller directly.');
				}

				const lnurlParams = await resolveLightningAddress(lightningAddr);
				const amountMsats = totalSats * 1000;

				if (amountMsats < lnurlParams.minSendable || amountMsats > lnurlParams.maxSendable) {
					throw new Error(`Amount ${totalSats} sats is outside the seller's accepted range.`);
				}

				const invoice = await fetchInvoice(lnurlParams.callback, amountMsats, `Order ${orderId}`);

				paymentInvoice = invoice;
				paymentSats = totalSats;
				paymentFiat = total;
				paymentOrderId = orderId;
				paymentLnAddress = lightningAddr;
				view = 'payment';
			} else {
				// Fiat flow (PayID, etc.)
				const address = selectedAvailable?.address ?? '';
				let payAmount = total;
				let payCurrency = currency;
				let rateDisplay = '';

				// Convert currency if method has specific supported currencies
				if (method.currencies.length > 0 && !method.currencies.includes(currency.toUpperCase())) {
					payCurrency = method.currencies[0];
					const { convertedAmount, fromRate, toRate } = await convertFiat(total, currency, payCurrency);
					payAmount = convertedAmount;
					const ratePerUnit = Math.round((fromRate.satsPerUnit / toRate.satsPerUnit) * 10000) / 10000;
					rateDisplay = `1 ${currency.toUpperCase()} = ${ratePerUnit} ${payCurrency.toUpperCase()}`;
				}

				// Enforce minimum transaction - bump up to minimum if below
				if (method.minTransaction > 0) {
					let checkAmount = payAmount;
					if (payCurrency.toUpperCase() !== method.minTransactionCurrency.toUpperCase()) {
						const { convertedAmount } = await convertFiat(payAmount, payCurrency, method.minTransactionCurrency);
						checkAmount = convertedAmount;
					}
					if (checkAmount < method.minTransaction) {
						// If payment currency matches min currency, just use the min directly
						if (payCurrency.toUpperCase() === method.minTransactionCurrency.toUpperCase()) {
							payAmount = method.minTransaction;
						} else {
							const { convertedAmount } = await convertFiat(method.minTransaction, method.minTransactionCurrency, payCurrency);
							payAmount = convertedAmount;
						}
					}
				}

				// Check max transaction limit
				if (method.maxTransaction > 0) {
					let checkAmount = payAmount;
					if (payCurrency.toUpperCase() !== method.maxTransactionCurrency.toUpperCase()) {
						const { convertedAmount } = await convertFiat(payAmount, payCurrency, method.maxTransactionCurrency);
						checkAmount = convertedAmount;
					}
					if (checkAmount > method.maxTransaction) {
						throw new Error(`Order exceeds ${method.maxTransaction} ${method.maxTransactionCurrency} limit for ${method.name}.`);
					}
				}

				const order = assembleOrder(
					$cart, subtotal, shipping, total, undefined,
					undefined, undefined, formData, storeId, orderId,
					method.id, payCurrency, payAmount
				);

				paymentReceipt = await publishOrder(order, pubkeyHex, relays);

				const formattedAmount = formatCurrency(payAmount, payCurrency);
				const instructions = method.checkoutInstructions(address, orderId, formattedAmount);

				fiatMethodName = method.name;
				fiatInstructions = instructions;
				fiatPaymentAmount = formattedAmount;
				fiatOrderId = orderId;
				fiatExchangeRate = rateDisplay;
				fiatMethodColor = method.color;
				fiatQrValue = selectedAvailable?.qrValue ?? '';
				view = 'fiat-payment';
			}
			})()]);
		} catch (err) {
			if (err instanceof Error && err.message === 'CHECKOUT_TIMEOUT') {
				paymentError = typeof navigator !== 'undefined' && navigator.onLine === false
					? 'No internet connection. Please check your connection and try again.'
					: 'Checkout timed out. Please check your internet connection and try again.';
			} else {
				paymentError = err instanceof Error ? err.message : 'Payment failed. Please try again.';
			}
			view = 'error';
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
			processingPayment = false;
		}
	}

	// Run offline verification when store data loads
	$effect(() => {
		if (storeData && !verificationDone) {
			computeVerification(storeData)
				.then((result) => {
					verification = result;
				})
				.catch(() => {
					verification = null;
				})
				.finally(() => {
					verificationDone = true;
				});
		}
	});

	// Fetch inventory status when store loads (only if store has tag k — inventory enabled)
	const inventoryEnabled = $derived(!!storeData?.tags.some((t: Tag) => t.key === 'k'));

	type InventoryGate = 'ok' | 'pending' | 'missing' | 'error';
	const inventoryGate = $derived.by<InventoryGate>(() => {
		if (!inventoryEnabled) return 'ok';
		if (statusError !== null) return 'error';
		if (!statusLoaded) return 'pending';
		if (inventoryEntry?.state === 'missing') return 'missing';
		return 'ok';
	});

	$effect(() => {
		if (
			storeData &&
			inventoryEnabled &&
			currentLookupHash &&
			!statusLoading &&
			!statusLoaded &&
			statusError === null
		) {
			statusLoading = true;
			const hash = currentLookupHash;
			const pubkeyHex = base64urlToHex(storeData.pubkey);
			const fetchPromise = fetchStatus($siteFragment, pubkeyHex, storeData.tags);
			const timeoutPromise = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('INVENTORY_TIMEOUT')), INVENTORY_FETCH_TIMEOUT_MS)
			);
			Promise.race([fetchPromise, timeoutPromise])
				.then((status) => {
					if (status) {
						// Found: cache in memory and persist across navigation.
						const entry: InventoryCacheEntry = { state: 'found', payload: status };
						const updated = { ...loadInventoryCache(), [hash]: entry };
						inventoryCache = updated;
						saveInventoryCache(updated);
					} else {
						// Missing: cache in memory only so the current session doesn't re-fetch
						// on every cart interaction, but don't persist — it might be a transient
						// relay hiccup, so a fresh page load should retry.
						inventoryCache = { ...inventoryCache, [hash]: { state: 'missing' } };
					}
				})
				.catch((err) => {
					const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
					if (offline) {
						statusError = 'No internet connection.';
					} else if (err instanceof Error && err.message === 'INVENTORY_TIMEOUT') {
						statusError = 'Timed out loading inventory.';
					} else {
						statusError = 'Could not load inventory.';
					}
				})
				.finally(() => {
					statusLoading = false;
				});
		}
	});

	function retryInventoryFetch() {
		if (!inventoryEnabled || statusLoading) return;
		statusError = null;
		// Clear any cached 'missing' entry so the effect re-fetches. ('found' entries
		// stay — no need to retry a successful lookup.)
		if (currentLookupHash && inventoryCache[currentLookupHash]?.state === 'missing') {
			const updated = { ...inventoryCache };
			delete updated[currentLookupHash];
			inventoryCache = updated;
		}
	}
</script>

{#if TESTING_MODE}
	<div class="testing-banner">TESTING - NO RELAY</div>
{:else if USE_LOCAL_RELAY}
	<div class="testing-banner local-relay">LOCAL RELAY</div>
{:else if USE_PTR_RELAY}
	<div class="testing-banner ptr-relay"><span class="ptr-line">CONNECTED TO PRIVATE RELAY</span><span class="ptr-dash"> — </span><span class="ptr-line">TESTING ONLY</span></div>
{:else}
	<div class="beta-banner">Nowhere stores are new and not yet proven. Make sure you have another way to contact the seller, and only spend what you are comfortable losing.</div>
{/if}

<StoreHeader
	store={storeData}
	cartCount={$cartCount}
	onCartClick={() => (cartOpen = !cartOpen)}
	showHero={view === 'store'}
/>

<div class="store-disclaimer">Nowhere is permissionless. Anyone can create a store with any name or products they choose. Stores are private, only visible to those who have the link, and cannot be reviewed, moderated, or removed. All orders are placed directly with the seller. Stores can be cryptographically signed by their author. Check the seller's verification phrase to make sure you trust who you're buying from.</div>

{#if view === 'store'}
	<StoreBanner
		notice={storeStatus?.notice}
		closed={storeStatus?.closed}
		redirect={storeStatus?.redirect}
	/>
	<SellerInfo
		{storeDescription}
		deliveryDays={storeDeliveryDays}
		sellerPhrase={verification?.sellerPhrase}
		storePhrase={verification?.storePhrase}
		{npub}
		signed={$siteSigned}
	/>
{/if}

{#if view === 'checkout'}
	{#if processingPayment}
		<LoadingScreen message="Processing your order..." />
	{:else}
		<CheckoutView
			store={storeData}
			{currency}
			lowSettings={storeStatus?.low ?? null}
			{stockLevels}
			onBack={() => (view = 'store')}
			onSubmit={handleCheckoutSubmit}
		/>
	{/if}
{:else if view === 'payment'}
	<PaymentScreen
		invoice={paymentInvoice}
		amountSats={paymentSats}
		amountFiat={paymentFiat}
		{currency}
		orderId={paymentOrderId}
		receipt={paymentReceipt}
		lightningAddress={paymentLnAddress}
		onReturnToStore={() => (view = 'store')}
	/>
{:else if view === 'fiat-payment'}
	<FiatPaymentScreen
		methodName={fiatMethodName}
		instructions={fiatInstructions}
		paymentAmount={fiatPaymentAmount}
		orderId={fiatOrderId}
		exchangeRate={fiatExchangeRate}
		methodColor={fiatMethodColor}
		qrValue={fiatQrValue}
		onConfirmSent={() => (view = 'fiat-confirmed')}
	/>
{:else if view === 'fiat-confirmed'}
	<main class="center-page">
		<div class="confirmation">
			<h1>Thank you!</h1>
			<p>Your order has been placed.</p>
			<p class="order-id">Order ID: <span class="mono">{fiatOrderId}</span></p>
			<p class="hint">Please keep a copy of this for your records.</p>
			{#if paymentReceipt}
				<div class="receipt-actions">
					<p class="receipt-hint">Save your receipt to prove this purchase if relays go offline.</p>
					<div class="receipt-btns">
						<button class="btn btn-secondary" onclick={() => downloadReceipt(fiatOrderId)}>Download Receipt</button>
						<button class="btn btn-secondary" onclick={copyReceipt}>{receiptCopied ? 'Copied!' : 'Copy Receipt'}</button>
					</div>
				</div>
			{/if}
			<button class="btn" onclick={() => (view = 'store')}>Back to Store</button>
		</div>
	</main>
{:else if view === 'error'}
	<main class="center-page">
		<div class="error-page">
			<h1>Payment Error</h1>
			<p>{paymentError}</p>
			<div class="error-actions">
				<button class="btn" onclick={() => (view = 'checkout')}>Try Again</button>
				<button class="btn btn-secondary" onclick={() => (view = 'store')}>Back to Store</button>
			</div>
		</div>
	</main>
{:else}
	<ProductGrid
		items={storeData.items}
		{currency}
		{stockLevels}
		{storeClosed}
		onselect={(item) => { selectedItem = item; selectedItemIdx = findItemIndex(item); }}
		onadd={handleAddFromGrid}
	/>
{/if}

{#if view === 'store'}
	<StoreFooter store={storeData} {currency} {verification} signed={$siteSigned} />
{/if}

{#if selectedItem}
	<ProductModal
		item={selectedItem}
		{currency}
		storeTags={storeData.tags}
		stockLevel={selectedItemStockLevel}
		{storeClosed}
		onclose={() => { selectedItem = null; selectedItemIdx = -1; }}
		onadd={handleAddFromModal}
	/>
{/if}

<CartDrawer
	open={cartOpen}
	{currency}
	storeTags={storeData.tags}
	{storeClosed}
	{inventoryGate}
	onRetryInventory={retryInventoryFetch}
	hasUnavailable={hasUnavailableInCart}
	isItemUnavailable={isCartItemUnavailable}
	onClose={() => (cartOpen = false)}
	onCheckout={handleCheckout}
/>

<style>
	.store-disclaimer {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2.5rem var(--space-4, 1rem) 2rem;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		font-size: 0.95rem;
		line-height: 1.6;
		color: #5a544e;
		border-bottom: 1px solid #e5e0da;
	}

	.testing-banner {
		position: sticky;
		top: 0;
		width: 100%;
		min-height: 32px;
		background: #e53e3e;
		color: #fff;
		font-weight: 700;
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 11;
		letter-spacing: 0.1em;
		padding: 6px 16px;
		box-sizing: border-box;
		text-align: center;
	}

	.testing-banner.local-relay {
		background: #d69e2e;
		color: #1a1a1a;
	}

	.testing-banner.ptr-relay {
		background: #000;
		color: #fff;
	}

	@media (max-width: 600px) {
		.testing-banner.ptr-relay {
			flex-direction: column;
			gap: 2px;
		}
		.testing-banner.ptr-relay .ptr-dash {
			display: none;
		}
	}


	.testing-banner + :global(.top-nav) {
		top: 32px;
	}

	.beta-banner {
		width: 100%;
		background: #000000;
		color: #fafaf7;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.45;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 11;
		padding: 9px 20px;
		box-sizing: border-box;
		text-align: center;
	}

	@media (min-width: 820px) {
		.beta-banner {
			position: sticky;
			top: 0;
		}
		.beta-banner + :global(.top-nav) {
			top: 36px;
		}
	}

	.center-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: var(--space-8);
		text-align: center;
	}

	.error-page h1 {
		font-size: var(--text-3xl);
		margin-bottom: var(--space-4);
	}

	.error-page p {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.error-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: center;
		margin-top: var(--space-4);
	}

	.btn {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.btn:hover {
		background: var(--color-primary-hover);
	}

	.btn-secondary {
		background: var(--color-bg-secondary);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-bg-tertiary);
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin-top: var(--space-4);
	}

	.confirmation h1 {
		font-size: var(--text-3xl);
		margin-bottom: var(--space-4);
	}

	.confirmation p {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.order-id {
		font-size: var(--text-lg);
		margin-top: var(--space-4);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.receipt-actions {
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
</style>

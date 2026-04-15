import { writable, derived } from 'svelte/store';
import type { Item, Tag } from '@nowhere/codec';
import { resolveTags } from '@nowhere/codec';

export interface CartItem {
	item: Item;
	itemIndex: number;
	qty: number;
	customText?: string;
	selectedVariant?: string;
}

function loadCart(): CartItem[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem('nowhere-cart');
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function saveCart(items: CartItem[]): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-cart', JSON.stringify(items));
}

function createCartStore() {
	const { subscribe, set, update } = writable<CartItem[]>(loadCart());

	// Persist on every change
	subscribe((items) => saveCart(items));

	return {
		subscribe,
		addItem(item: Item, qty: number = 1, opts?: { customText?: string; selectedVariant?: string; itemIndex?: number }) {
			update((items) => {
				const existing = items.find(
					(ci) => ci.item.name === item.name && ci.selectedVariant === opts?.selectedVariant
				);
				if (existing) {
					const maxQty = getMaxQty(item);
					existing.qty = Math.min(existing.qty + qty, maxQty);
					return [...items];
				}
				return [...items, { item, itemIndex: opts?.itemIndex ?? 0, qty, customText: opts?.customText, selectedVariant: opts?.selectedVariant }];
			});
		},
		removeItem(index: number) {
			update((items) => items.filter((_, i) => i !== index));
		},
		updateQuantity(index: number, qty: number) {
			update((items) => {
				const ci = items[index];
				if (!ci) return items;
				const maxQty = getMaxQty(ci.item);
				ci.qty = Math.max(1, Math.min(qty, maxQty));
				return [...items];
			});
		},
		clearCart() {
			set([]);
		}
	};
}

function getMaxQty(item: Item): number {
	const qTag = item.tags.find((t: Tag) => t.key === 'q');
	return qTag?.value ? parseInt(qTag.value, 10) : 99;
}

export const cart = createCartStore();

export const cartCount = derived(cart, ($cart) =>
	$cart.reduce((sum, ci) => sum + ci.qty, 0)
);

export const cartSubtotal = derived(cart, ($cart) =>
	$cart.reduce((sum, ci) => sum + ci.item.price * ci.qty, 0)
);

export function computeDiscount(
	cartItems: CartItem[],
	storeTags: Tag[]
): { amount: number; label: string } {
	const bTag = storeTags.find((t) => t.key === 'B');
	if (!bTag?.value) return { amount: 0, label: '' };

	const parts = bTag.value.split(':');
	if (parts.length !== 2) return { amount: 0, label: '' };

	const minQty = parseInt(parts[0], 10);
	const percent = parseInt(parts[1], 10);
	if (isNaN(minQty) || isNaN(percent) || minQty < 1 || percent < 1 || percent > 100) {
		return { amount: 0, label: '' };
	}

	let discountTotal = 0;
	for (const ci of cartItems) {
		if (ci.qty >= minQty) {
			discountTotal += ci.item.price * ci.qty * (percent / 100);
		}
	}

	if (discountTotal === 0) return { amount: 0, label: '' };

	let amount = Math.round(discountTotal * 100) / 100;

	const xTag = storeTags.find((t) => t.key === 'X');
	if (xTag?.value) {
		const maxDiscount = parseInt(xTag.value, 10) / 100;
		if (maxDiscount > 0 && amount > maxDiscount) {
			amount = maxDiscount;
		}
	}

	return {
		amount,
		label: `Buy ${minQty}+ get ${percent}% off`
	};
}

export function computeShipping(
	cartItems: CartItem[],
	storeTags: Tag[],
	buyerCountry?: string
): number {
	// Check for free shipping
	const freeTag = storeTags.find((t) => t.key === 'F');
	if (freeTag) {
		if (!freeTag.value) {
			// No value = always free
			return 0;
		}
		// Numeric value = threshold
		const threshold = parseInt(freeTag.value, 10);
		if (!isNaN(threshold) && threshold > 0) {
			const subtotal = cartItems.reduce((sum, ci) => sum + ci.item.price * ci.qty, 0);
			const subtotalCents = Math.round(subtotal * 100);
			const storeCountry = storeTags.find((t) => t.key === 'L')?.value;
			const isDomestic = buyerCountry && storeCountry && buyerCountry === storeCountry;
			const hasIntlTag = storeTags.some((t) => t.key === 'J');

			if (subtotalCents >= threshold && (isDomestic || hasIntlTag)) {
				return 0;
			}
		}
	}

	// Check if all items are digital
	if (cartItems.every((ci) => ci.item.tags.some((t: Tag) => t.key === 'd'))) return 0;

	const storeCountry = storeTags.find((t) => t.key === 'L')?.value;
	const isDomestic = buyerCountry && storeCountry && buyerCountry === storeCountry;

	let baseRate: number;
	let weightRate: number;

	if (isDomestic) {
		baseRate = parseFloat(storeTags.find((t) => t.key === 's')?.value ?? '0') / 100;
		weightRate = parseFloat(storeTags.find((t) => t.key === 'h')?.value ?? '0') / 100;
	} else {
		// International: fall back to domestic independently if not set
		const intlBase = storeTags.find((t) => t.key === 'S')?.value;
		const domBase = storeTags.find((t) => t.key === 's')?.value;
		baseRate = parseFloat(intlBase ?? domBase ?? '0') / 100;

		const intlWeight = storeTags.find((t) => t.key === 'H')?.value;
		const domWeight = storeTags.find((t) => t.key === 'h')?.value;
		weightRate = parseFloat(intlWeight ?? domWeight ?? '0') / 100;
	}

	// Check for country-specific override
	if (buyerCountry) {
		const override = storeTags.find((t) => t.key === 'R' && t.value?.startsWith(buyerCountry));
		if (override?.value) {
			const overrideRate = parseFloat(override.value.slice(buyerCountry.length)) / 100;
			return overrideRate;
		}
	}

	let totalWeight = 0;
	for (const ci of cartItems) {
		// Skip digital items
		if (ci.item.tags.some((t: Tag) => t.key === 'd')) continue;

		// Check item-specific shipping override
		const itemOverride = ci.item.tags.find((t: Tag) => t.key === 'i');
		if (itemOverride?.value) {
			return parseFloat(itemOverride.value) / 100;
		}

		const weightTag2 = ci.item.tags.find((t: Tag) => t.key === 'W');
		const weight = weightTag2?.value ? parseFloat(weightTag2.value) : 0;
		totalWeight += weight * ci.qty;
	}

	return baseRate + totalWeight * weightRate;
}

export function getShippingCurrency(storeTags: Tag[]): string | null {
	const kTag = storeTags.find((t) => t.key === 'K');
	return kTag?.value ?? null;
}

import type { CartItem } from '$lib/renderer/stores/cart.js';

export interface OrderItem {
	i: number;       // item index in store (0-based)
	qty: number;
	v?: string;      // variant name
}

export interface OrderMessage {
	version: 1;
	orderId: string;
	timestamp: number;
	storeId: string;          // 15 hex char lookup hash
	items: OrderItem[];
	subtotal: number;         // in cents
	shipping: number;         // in cents
	total: number;            // in cents
	totalSats?: number;
	exchangeRate?: number;
	rateSource?: string;
	buyer: Record<string, string>;
	paymentMethod?: string;
	paymentCurrency?: string;
	paymentAmount?: number;   // in cents
}

export async function generateOrderId(data: string): Promise<string> {
	const encoder = new TextEncoder();
	const timestamp = Date.now().toString();
	const hashBuffer = await crypto.subtle.digest(
		'SHA-256',
		encoder.encode(data + timestamp)
	);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 15);
}

export function assembleOrder(
	cartItems: CartItem[],
	subtotal: number,
	shipping: number,
	total: number,
	totalSats: number | undefined,
	exchangeRate: number | undefined,
	rateSource: string | undefined,
	buyer: Record<string, string>,
	storeId: string,
	orderId: string,
	paymentMethod?: string,
	paymentCurrency?: string,
	paymentAmount?: number
): OrderMessage {
	return {
		version: 1,
		orderId,
		timestamp: Math.floor(Date.now() / 1000),
		storeId,
		items: cartItems.map((ci) => ({
			i: ci.itemIndex,
			qty: ci.qty,
			v: ci.selectedVariant
		})),
		subtotal: Math.round(subtotal * 100),
		shipping: Math.round(shipping * 100),
		total: Math.round(total * 100),
		totalSats,
		exchangeRate,
		rateSource,
		buyer,
		paymentMethod,
		paymentCurrency,
		paymentAmount: paymentAmount != null ? Math.round(paymentAmount * 100) : undefined
	};
}

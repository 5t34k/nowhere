import { writable, derived } from 'svelte/store';
import type { StoreData, Item, Tag } from '@nowhere/codec';
import { encode } from '@nowhere/codec';
import { PAYMENT_METHODS } from '$lib/payment-methods.js';
import { parseCustomPayments, type CustomPaymentMethod } from '$lib/custom-payments.js';
import { str, tags } from './validate-state.js';

export interface PaymentMethodState {
	enabled: boolean;
	address: string;
}

export interface BuilderState {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	paymentMethods: Record<string, PaymentMethodState>;
	customPaymentMethods: CustomPaymentMethod[];
	tags: Tag[];
	items: ItemState[];
}

export interface ItemState {
	name: string;
	price: string;
	description: string;
	image: string;
	tags: Tag[];
}

function defaultPaymentMethods(): Record<string, PaymentMethodState> {
	const methods: Record<string, PaymentMethodState> = {};
	for (const m of PAYMENT_METHODS) {
		methods[m.id] = { enabled: false, address: '' };
	}
	return methods;
}

function defaultState(): BuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		image: '',
		paymentMethods: defaultPaymentMethods(),
		customPaymentMethods: [],
		tags: [],
		items: [defaultItem()]
	};
}

function defaultItem(): ItemState {
	return { name: '', price: '', description: '', image: '', tags: [] };
}

function validateItems(v: unknown): ItemState[] {
	if (!Array.isArray(v)) return [defaultItem()];
	return v
		.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
		.map((item) => ({
			name: str(item.name),
			price: str(item.price),
			description: str(item.description),
			image: str(item.image),
			tags: tags(item.tags)
		}));
}

function validatePaymentMethods(v: unknown): Record<string, PaymentMethodState> {
	const defaults = defaultPaymentMethods();
	if (v === null || typeof v !== 'object' || Array.isArray(v)) return defaults;
	const o = v as Record<string, unknown>;
	for (const key of Object.keys(defaults)) {
		const entry = o[key];
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const e = entry as Record<string, unknown>;
			defaults[key] = { enabled: !!e.enabled, address: str(e.address) };
		}
	}
	return defaults;
}

function validateCustomPaymentMethods(v: unknown): CustomPaymentMethod[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
		.map((m) => ({
			label: str(m.label),
			currency: str(m.currency).toUpperCase() || 'USD',
			address: str(m.address),
			showQr: !!m.showQr
		}));
}

function loadState(): BuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-store-builder');
		if (!raw) return defaultState();
		const parsed = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultState();
		// Migrate old format: lightningAddress → paymentMethods
		if (!parsed.paymentMethods && 'lightningAddress' in parsed) {
			parsed.paymentMethods = defaultPaymentMethods();
			if (parsed.lightningAddress) {
				parsed.paymentMethods.bitcoin = { enabled: true, address: parsed.lightningAddress };
			}
		}
		return {
			pubkey: str(parsed.pubkey),
			name: str(parsed.name),
			description: str(parsed.description),
			image: str(parsed.image),
			paymentMethods: validatePaymentMethods(parsed.paymentMethods),
			customPaymentMethods: validateCustomPaymentMethods(parsed.customPaymentMethods),
			tags: tags(parsed.tags),
			items: validateItems(parsed.items)
		};
	} catch {
		return defaultState();
	}
}

function saveState(state: BuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-store-builder', JSON.stringify(state));
}

function createBuilderStore() {
	const { subscribe, set, update } = writable<BuilderState>(loadState());

	let saveTimer: ReturnType<typeof setTimeout>;

	// Debounced auto-save
	subscribe((state) => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveState(state), 3000);
	});

	return {
		subscribe,
		set,
		update,
		updateField(field: keyof BuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		updateItem(index: number, field: keyof ItemState, value: unknown) {
			update((s) => {
				const items = [...s.items];
				items[index] = { ...items[index], [field]: value };
				return { ...s, items };
			});
		},
		addItem() {
			update((s) => ({ ...s, items: [...s.items, defaultItem()] }));
		},
		removeItem(index: number) {
			update((s) => ({
				...s,
				items: s.items.filter((_, i) => i !== index)
			}));
		},
		moveItem(from: number, to: number) {
			update((s) => {
				const items = [...s.items];
				const [item] = items.splice(from, 1);
				items.splice(to, 0, item);
				return { ...s, items };
			});
		},
		cloneItem(index: number) {
			update((s) => {
				const items = [...s.items];
				const source = items[index];
				if (!source) return s;
				const clone: ItemState = {
					name: source.name ? `${source.name} - Copy` : '',
					price: source.price,
					description: source.description,
					image: source.image,
					tags: source.tags.map((t) => ({ ...t }))
				};
				items.splice(index + 1, 0, clone);
				return { ...s, items };
			});
		},
		reset() {
			const state = defaultState();
			set(state);
			saveState(state);
		},
		importFromUrl(data: StoreData) {
			const methods = defaultPaymentMethods();

			for (const m of PAYMENT_METHODS) {
				const tag = data.tags.find((t) => t.key === m.tagKey);
				if (tag) {
					methods[m.id] = { enabled: true, address: tag.value ?? '' };
				} else {
					methods[m.id] = { enabled: false, address: '' };
				}
			}

			const hTag = data.tags.find((t) => t.key === '5');
			const customMethods = hTag ? parseCustomPayments(hTag.value ?? '') : [];

			set({
				pubkey: data.pubkey,
				name: data.name,
				description: data.description || '',
				image: data.image || '',
				paymentMethods: methods,
				customPaymentMethods: customMethods,
				tags: data.tags,
				items: data.items.map((item) => ({
					name: item.name,
					price: item.price.toString(),
					description: item.description || '',
					image: item.image || '',
					tags: item.tags
				}))
			});
		}
	};
}

export const builderState = createBuilderStore();

export function toStoreData(state: BuilderState): StoreData | null {
	if (!state.pubkey || state.pubkey.length !== 43) return null;
	if (!state.name) return null;

	const items: Item[] = [];
	for (const item of state.items) {
		if (!item.name) continue;
		const price = parseFloat(item.price);
		if (isNaN(price) || price < 0) continue;
		items.push({
			name: item.name,
			price,
			description: item.description || undefined,
			image: item.image || undefined,
			tags: item.tags
		});
	}

	return {
		version: 1,
		pubkey: state.pubkey,
		name: state.name,
		description: state.description || undefined,
		image: state.image || undefined,
		tags: state.tags,
		items
	};
}

export const encodedResult = derived(builderState, ($state) => {
	const data = toStoreData($state);
	if (!data) return null;
	try {
		return encode(data);
	} catch {
		return null;
	}
});

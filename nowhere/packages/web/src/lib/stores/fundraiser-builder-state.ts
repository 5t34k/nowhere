import { writable, derived } from 'svelte/store';
import type { FundraiserData, Tag } from '@nowhere/codec';
import { encodeFundraiser } from '@nowhere/codec';
import { validateBaseState } from './validate-state.js';

export interface FundraiserBuilderState {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	tags: Tag[];
}

function defaultState(): FundraiserBuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		image: '',
		tags: []
	};
}

function loadState(): FundraiserBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-fundraiser-builder');
		if (!raw) return defaultState();
		const validated = validateBaseState(JSON.parse(raw));
		if (!validated) return defaultState();
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: FundraiserBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-fundraiser-builder', JSON.stringify(state));
}

function createFundraiserBuilderStore() {
	const { subscribe, set, update } = writable<FundraiserBuilderState>(loadState());

	let saveTimer: ReturnType<typeof setTimeout>;

	// Debounced auto-save (3s)
	subscribe((state) => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveState(state), 3000);
	});

	return {
		subscribe,
		set,
		update,
		updateField(field: keyof FundraiserBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: FundraiserData) {
			set({
				pubkey: data.pubkey ?? '',
				name: data.name,
				description: data.description || '',
				image: data.image || '',
				tags: data.tags
			});
		}
	};
}

export const fundraiserBuilderState = createFundraiserBuilderStore();

export function toFundraiserData(state: FundraiserBuilderState): FundraiserData | null {
	if (!state.name) return null;

	return {
		version: 1,
		siteType: 'fundraiser',
		pubkey: state.pubkey,
		name: state.name,
		description: state.description || undefined,
		image: state.image || undefined,
		tags: state.tags
	};
}

export const fundraiserEncodedResult = derived(fundraiserBuilderState, ($state) => {
	const data = toFundraiserData($state);
	if (!data) return null;
	try {
		return encodeFundraiser(data);
	} catch {
		return null;
	}
});

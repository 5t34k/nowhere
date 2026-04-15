import { writable, derived } from 'svelte/store';
import type { DropData, Tag } from '@nowhere/codec';
import { encodeDrop } from '@nowhere/codec';
import { validateDropState } from './validate-state.js';

export interface DropBuilderState {
	pubkey: string;
	name: string;
	description: string;
	tags: Tag[];
}

function defaultState(): DropBuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		tags: []
	};
}

function loadState(): DropBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-drop-builder');
		if (!raw) return defaultState();
		const validated = validateDropState(JSON.parse(raw));
		if (!validated) return defaultState();
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: DropBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-drop-builder', JSON.stringify(state));
}

function createDropBuilderStore() {
	const { subscribe, set, update } = writable<DropBuilderState>(loadState());

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
		updateField(field: keyof DropBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: DropData) {
			set({
				pubkey: data.pubkey ?? '',
				name: data.name,
				description: data.description || '',
				tags: data.tags
			});
		}
	};
}

export const dropBuilderState = createDropBuilderStore();

export function toDropData(state: DropBuilderState): DropData | null {
	if (!state.description || state.description.trim() === '') return null;

	return {
		version: 1,
		siteType: 'drop',
		pubkey: state.pubkey,
		name: state.name,
		description: state.description,
		tags: state.tags
	};
}

export const dropEncodedResult = derived(dropBuilderState, ($state) => {
	const data = toDropData($state);
	if (!data) return null;
	try {
		return encodeDrop(data);
	} catch {
		return null;
	}
});

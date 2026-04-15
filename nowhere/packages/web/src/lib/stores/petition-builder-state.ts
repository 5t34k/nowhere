import { writable, derived } from 'svelte/store';
import type { PetitionData, Tag } from '@nowhere/codec';
import { encodePetition } from '@nowhere/codec';
import { validateBaseState } from './validate-state.js';

export interface PetitionBuilderState {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	tags: Tag[];
}

function defaultState(): PetitionBuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		image: '',
		tags: []
	};
}

function loadState(): PetitionBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-petition-builder');
		if (!raw) return defaultState();
		const validated = validateBaseState(JSON.parse(raw));
		if (!validated) return defaultState();
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: PetitionBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-petition-builder', JSON.stringify(state));
}

function createPetitionBuilderStore() {
	const { subscribe, set, update } = writable<PetitionBuilderState>(loadState());

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
		updateField(field: keyof PetitionBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: PetitionData) {
			set({
				pubkey: data.pubkey,
				name: data.name,
				description: data.description || '',
				image: data.image || '',
				tags: data.tags
			});
		}
	};
}

export const petitionBuilderState = createPetitionBuilderStore();

export function toPetitionData(state: PetitionBuilderState): PetitionData | null {
	if (!state.pubkey || state.pubkey.length !== 43) return null;
	if (!state.name) return null;

	return {
		version: 1,
		siteType: 'petition',
		pubkey: state.pubkey,
		name: state.name,
		description: state.description || undefined,
		image: state.image || undefined,
		tags: state.tags
	};
}

export const petitionEncodedResult = derived(petitionBuilderState, ($state) => {
	const data = toPetitionData($state);
	if (!data) return null;
	try {
		return encodePetition(data);
	} catch {
		return null;
	}
});

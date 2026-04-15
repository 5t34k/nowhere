import { writable, derived } from 'svelte/store';
import type { ArtData, Tag } from '@nowhere/codec';
import { encodeArt } from '@nowhere/codec';
import { validateArtState } from './validate-state.js';

export interface ArtBuilderState {
	pubkey: string;
	name: string;
	svg: string;
	tags: Tag[];
}

function defaultState(): ArtBuilderState {
	return {
		pubkey: '',
		name: '',
		svg: '',
		tags: [{ key: 'T', value: 'g' }]
	};
}

function loadState(): ArtBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-art-builder');
		if (!raw) return defaultState();
		const validated = validateArtState(JSON.parse(raw));
		if (!validated) return defaultState();
		// Ensure T tag exists in loaded state
		if (!validated.tags.find((t) => t.key === 'T')) {
			validated.tags = [...validated.tags, { key: 'T', value: 'g' }];
		}
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: ArtBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-art-builder', JSON.stringify(state));
}

function createArtBuilderStore() {
	const { subscribe, set, update } = writable<ArtBuilderState>(loadState());

	let saveTimer: ReturnType<typeof setTimeout>;

	subscribe((state) => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveState(state), 3000);
	});

	return {
		subscribe,
		set,
		update,
		updateField(field: keyof ArtBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: ArtData) {
			set({
				pubkey: data.pubkey ?? '',
				name: data.name,
				svg: data.svg || '',
				tags: data.tags
			});
		}
	};
}

export const artBuilderState = createArtBuilderStore();

export function toArtData(state: ArtBuilderState): ArtData | null {
	if (!state.svg || state.svg.trim() === '') return null;

	return {
		version: 1,
		siteType: 'art',
		pubkey: state.pubkey,
		name: state.name,
		svg: state.svg,
		tags: state.tags
	};
}

export const artEncodedResult = derived(artBuilderState, ($state) => {
	const data = toArtData($state);
	if (!data) return null;
	try {
		return encodeArt(data);
	} catch {
		return null;
	}
});

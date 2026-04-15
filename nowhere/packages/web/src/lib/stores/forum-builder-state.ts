import { writable, derived } from 'svelte/store';
import type { ForumData, Tag } from '@nowhere/codec';
import { encodeForum } from '@nowhere/codec';
import { validateBaseState } from './validate-state.js';

export interface ForumBuilderState {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	tags: Tag[];
}

function defaultState(): ForumBuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		image: '',
		tags: [
			{ key: 'i', value: '1' },
			{ key: 'H', value: '0' },
			{ key: 'V', value: undefined }
		]
	};
}

function loadState(): ForumBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-forum-builder');
		if (!raw) return defaultState();
		const validated = validateBaseState(JSON.parse(raw));
		if (!validated) return defaultState();
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: ForumBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-forum-builder', JSON.stringify(state));
}

function createForumBuilderStore() {
	const { subscribe, set, update } = writable<ForumBuilderState>(loadState());

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
		updateField(field: keyof ForumBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: ForumData) {
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

export const forumBuilderState = createForumBuilderStore();

export function toForumData(state: ForumBuilderState): ForumData | null {
	if (!state.pubkey || state.pubkey.length !== 43) return null;
	if (!state.name) return null;

	return {
		version: 1,
		siteType: 'discussion',
		pubkey: state.pubkey,
		name: state.name,
		description: state.description || undefined,
		image: state.image || undefined,
		tags: state.tags
	};
}

export const forumEncodedResult = derived(forumBuilderState, ($state) => {
	const data = toForumData($state);
	if (!data) return null;
	try {
		return encodeForum(data);
	} catch {
		return null;
	}
});

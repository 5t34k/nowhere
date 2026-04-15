import { writable, derived } from 'svelte/store';
import type { MessageData, Tag } from '@nowhere/codec';
import { encodeMessage } from '@nowhere/codec';
import { validateBaseState } from './validate-state.js';

export interface MessageBuilderState {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	tags: Tag[];
}

function defaultState(): MessageBuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		image: '',
		tags: []
	};
}

function loadState(): MessageBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-message-builder');
		if (!raw) return defaultState();
		const validated = validateBaseState(JSON.parse(raw));
		if (!validated) return defaultState();
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: MessageBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-message-builder', JSON.stringify(state));
}

function createMessageBuilderStore() {
	const { subscribe, set, update } = writable<MessageBuilderState>(loadState());

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
		updateField(field: keyof MessageBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: MessageData) {
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

export const messageBuilderState = createMessageBuilderStore();

export function toMessageData(state: MessageBuilderState): MessageData | null {
	if (!state.name) return null;
	// Message needs either description or a title tag
	const hasTitle = state.tags.some((t) => t.key === 't' && t.value);
	if (!state.description && !hasTitle) return null;

	return {
		version: 1,
		siteType: 'message',
		pubkey: state.pubkey,
		name: state.name,
		description: state.description || undefined,
		image: state.image || undefined,
		tags: state.tags
	};
}

export const messageEncodedResult = derived(messageBuilderState, ($state) => {
	const data = toMessageData($state);
	if (!data) return null;
	try {
		return encodeMessage(data);
	} catch {
		return null;
	}
});

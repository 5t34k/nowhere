import { writable, derived } from 'svelte/store';
import type { EventData, Tag } from '@nowhere/codec';
import { encodeEvent } from '@nowhere/codec';
import { validateBaseState } from './validate-state.js';

export interface EventBuilderState {
	pubkey: string;
	name: string;
	description: string;
	image: string;
	tags: Tag[];
}

function defaultState(): EventBuilderState {
	return {
		pubkey: '',
		name: '',
		description: '',
		image: '',
		tags: [{ key: 'T', value: 'g' }]
	};
}

function loadState(): EventBuilderState {
	if (typeof sessionStorage === 'undefined') return defaultState();
	try {
		const raw = sessionStorage.getItem('nowhere-event-builder');
		if (!raw) return defaultState();
		const validated = validateBaseState(JSON.parse(raw));
		if (!validated) return defaultState();
		return validated;
	} catch {
		return defaultState();
	}
}

function saveState(state: EventBuilderState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem('nowhere-event-builder', JSON.stringify(state));
}

function createEventBuilderStore() {
	const { subscribe, set, update } = writable<EventBuilderState>(loadState());

	let saveTimer: ReturnType<typeof setTimeout>;

	subscribe((state) => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveState(state), 3000);
	});

	return {
		subscribe,
		set,
		update,
		updateField(field: keyof EventBuilderState, value: unknown) {
			update((s) => ({ ...s, [field]: value }));
		},
		setTag(key: string, value: string | undefined) {
			update((s) => {
				const tags = s.tags.filter((t) => t.key !== key);
				if (value !== undefined && value !== '') {
					tags.push({ key, value });
				}
				return { ...s, tags };
			});
		},
		removeTag(key: string) {
			update((s) => ({ ...s, tags: s.tags.filter((t) => t.key !== key) }));
		},
		reset() {
			set(defaultState());
		},
		importFromData(data: EventData) {
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

export const eventBuilderState = createEventBuilderStore();

export function toEventData(state: EventBuilderState): EventData | null {
	if (!state.name) return null;

	return {
		version: 1,
		siteType: 'event',
		pubkey: state.pubkey,
		name: state.name,
		description: state.description || undefined,
		image: state.image || undefined,
		tags: state.tags
	};
}

export const eventEncodedResult = derived(eventBuilderState, ($state) => {
	const data = toEventData($state);
	if (!data) return null;
	try {
		return encodeEvent(data);
	} catch {
		return null;
	}
});

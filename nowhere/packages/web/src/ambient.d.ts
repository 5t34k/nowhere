declare module 'pako' {
	export function deflateRaw(data: Uint8Array | string, options?: unknown): Uint8Array;
	export function inflateRaw(data: Uint8Array, options?: unknown): Uint8Array;
}

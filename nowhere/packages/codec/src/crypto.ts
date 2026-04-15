const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export function bytesToBase64url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64urlToBytes(b64: string): Uint8Array {
	const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function base64urlToHex(b64: string): string {
	return bytesToHex(base64urlToBytes(b64));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptFragment(plaintext: string, password: string): Promise<string> {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await deriveKey(password, salt);

	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		encoder.encode(plaintext)
	);

	const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
	combined.set(salt, 0);
	combined.set(iv, SALT_LENGTH);
	combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

	return bytesToBase64url(combined);
}

export async function decryptFragment(encrypted: string, password: string): Promise<string> {
	const combined = base64urlToBytes(encrypted);

	if (combined.length < SALT_LENGTH + IV_LENGTH + 1) {
		throw new Error('Invalid encrypted data');
	}

	const salt = combined.slice(0, SALT_LENGTH);
	const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
	const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
	const key = await deriveKey(password, salt);

	const plainBuffer = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		key,
		ciphertext
	);

	return new TextDecoder().decode(plainBuffer);
}

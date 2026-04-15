import { describe, it, expect } from 'vitest';
import { encryptFragment, decryptFragment } from './crypto.js';

describe('encryptFragment / decryptFragment', () => {
	it('round-trips: decrypt returns original plaintext', async () => {
		const plaintext = 'v1ABCDEFsomefragmentdata';
		const password = 'test-password-123';

		const encrypted = await encryptFragment(plaintext, password);
		const decrypted = await decryptFragment(encrypted, password);

		expect(decrypted).toBe(plaintext);
	});

	it('wrong password throws an error', async () => {
		const plaintext = 'v1ABCDEFsomefragmentdata';
		const encrypted = await encryptFragment(plaintext, 'correct-password');

		await expect(decryptFragment(encrypted, 'wrong-password')).rejects.toThrow();
	});

	it('output is URL-safe (no +, /, or =)', async () => {
		const plaintext = 'v1' + 'A'.repeat(200);
		const password = 'password';

		const encrypted = await encryptFragment(plaintext, password);

		expect(encrypted).not.toMatch(/[+/=]/);
	});

	it('different encryptions of same plaintext produce different output', async () => {
		const plaintext = 'v1identicaldata';
		const password = 'same-password';

		const a = await encryptFragment(plaintext, password);
		const b = await encryptFragment(plaintext, password);

		expect(a).not.toBe(b);

		// Both should still decrypt to the same thing
		expect(await decryptFragment(a, password)).toBe(plaintext);
		expect(await decryptFragment(b, password)).toBe(plaintext);
	});

	it('handles empty plaintext', async () => {
		const encrypted = await encryptFragment('', 'password');
		const decrypted = await decryptFragment(encrypted, 'password');
		expect(decrypted).toBe('');
	});

	it('handles unicode in password and plaintext', async () => {
		const plaintext = 'v1data-with-emoji-\u{1F680}';
		const password = 'p\u00E4ssw\u00F6rd-\u{1F512}';

		const encrypted = await encryptFragment(plaintext, password);
		const decrypted = await decryptFragment(encrypted, password);

		expect(decrypted).toBe(plaintext);
	});
});

import { describe, it, expect } from 'vitest';
import {
	computeFingerprint,
	computeVerificationPhrase,
	computeAllVerificationPhrases,
	computeSellerFingerprint,
	computeSellerPhrase,
	computeAllSellerPhrases
} from './verification.js';
import type { StoreData } from './types.js';

const MOCK_PUBKEY_A = '7c148fa86983f66237f8583add8c35d808520376cfb90301540d7633cf84179d';
const MOCK_PUBKEY_B = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
const MOCK_STORE_PUBKEY = 'dBSPaGmD9mI3-Fg52ow12AhSA2_PkAMVDXYzz4QXnR8';

const makeStore = (pubkey: string, name: string = 'Test Store'): StoreData => ({
	version: 1,
	pubkey,
	name,
	items: [{ name: 'Item', price: 100, tags: [] }],
	tags: []
});

describe('computeSellerFingerprint', () => {
	it('returns a 64-char hex string', async () => {
		const fp = await computeSellerFingerprint(MOCK_PUBKEY_A);
		expect(fp).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is deterministic', async () => {
		const a = await computeSellerFingerprint(MOCK_PUBKEY_A);
		const b = await computeSellerFingerprint(MOCK_PUBKEY_A);
		expect(a).toBe(b);
	});

	it('different pubkeys produce different fingerprints', async () => {
		const a = await computeSellerFingerprint(MOCK_PUBKEY_A);
		const b = await computeSellerFingerprint(MOCK_PUBKEY_B);
		expect(a).not.toBe(b);
	});
});

describe('computeSellerPhrase', () => {
	it('returns a phrase with default 5 words', async () => {
		const phrase = await computeSellerPhrase(MOCK_PUBKEY_A);
		expect(phrase.split(' ')).toHaveLength(5);
	});

	it('respects wordCount parameter', async () => {
		const p3 = await computeSellerPhrase(MOCK_PUBKEY_A, 3);
		const p7 = await computeSellerPhrase(MOCK_PUBKEY_A, 7);
		expect(p3.split(' ')).toHaveLength(3);
		expect(p7.split(' ')).toHaveLength(7);
	});

	it('is deterministic', async () => {
		const a = await computeSellerPhrase(MOCK_PUBKEY_A);
		const b = await computeSellerPhrase(MOCK_PUBKEY_A);
		expect(a).toBe(b);
	});

	it('different pubkeys produce different phrases', async () => {
		const a = await computeSellerPhrase(MOCK_PUBKEY_A);
		const b = await computeSellerPhrase(MOCK_PUBKEY_B);
		expect(a).not.toBe(b);
	});

	it('same pubkey gives same seller phrase regardless of store content', async () => {
		const phrase = await computeSellerPhrase(MOCK_PUBKEY_A);
		// Seller phrase depends only on pubkey, not store data
		const phrase2 = await computeSellerPhrase(MOCK_PUBKEY_A, 5);
		expect(phrase).toBe(phrase2);
	});
});

describe('computeAllSellerPhrases', () => {
	it('returns phrases for lengths 3-12', async () => {
		const all = await computeAllSellerPhrases(MOCK_PUBKEY_A);
		for (let i = 3; i <= 12; i++) {
			expect(all[i]).toBeDefined();
			expect(all[i].split(' ')).toHaveLength(i);
		}
	});
});

describe('store phrase regression', () => {
	it('computeFingerprint is deterministic', async () => {
		const store = makeStore(MOCK_STORE_PUBKEY);
		const a = await computeFingerprint(store);
		const b = await computeFingerprint(store);
		expect(a).toBe(b);
	});

	it('different store content gives different fingerprint', async () => {
		const a = await computeFingerprint(makeStore(MOCK_STORE_PUBKEY, 'Store A'));
		const b = await computeFingerprint(makeStore(MOCK_STORE_PUBKEY, 'Store B'));
		expect(a).not.toBe(b);
	});

	it('computeVerificationPhrase is deterministic', () => {
		const fp = 'a'.repeat(64);
		const a = computeVerificationPhrase(fp);
		const b = computeVerificationPhrase(fp);
		expect(a).toBe(b);
	});

	it('computeAllVerificationPhrases returns 3-12', () => {
		const fp = 'b'.repeat(64);
		const all = computeAllVerificationPhrases(fp);
		for (let i = 3; i <= 12; i++) {
			expect(all[i].split(' ')).toHaveLength(i);
		}
	});
});

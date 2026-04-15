import { writable } from 'svelte/store';
import type { VerificationResult } from '$lib/renderer/nostr/verify.js';

export type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'failed';

export const verificationStatus = writable<VerificationStatus>('idle');
export const verificationResult = writable<VerificationResult | null>(null);

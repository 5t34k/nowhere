import type { StoreData, MessageData, FundraiserData, PetitionData, ForumData, DropData, ArtData, EventData, Tag } from '@nowhere/codec';
import {
	computeFingerprint,
	computeFingerprintFromString,
	computeVerificationPhrase,
	computeAllVerificationPhrases,
	computeSellerFingerprint,
	computeSellerPhrase,
	computeAllSellerPhrases,
	base64urlToBytes,
	bytesToBase64url,
	base64urlToHex,
	serialize,
	serializeMessage,
	serializeFundraiser,
	serializePetition,
	serializeForum,
	serializeDrop,
	serializeArt,
	serializeEvent
} from '@nowhere/codec';
import { getEventHash, verifyEvent } from 'nostr-tools/pure';

export interface VerificationResult {
	sellerPhrase: string;
	storePhrase: string;
	sellerFingerprint: string;
	storeFingerprint: string;
	defaultPhraseLength: number;
	allSellerPhrases: Record<number, string>;
	allStorePhrases: Record<number, string>;
}

export async function computeVerification(data: StoreData | MessageData | FundraiserData | PetitionData | ForumData | DropData | ArtData | EventData): Promise<VerificationResult> {
	// Read default phrase length from V tag (clamped 3-12, default 5)
	const vTag = data.tags.find((t: Tag) => t.key === 'V');
	const parsedLength = vTag?.value ? parseInt(vTag.value, 10) : 6;
	const defaultPhraseLength = isNaN(parsedLength) ? 6 : Math.max(3, Math.min(12, parsedLength));

	// Compute content fingerprint based on site type
	let contentFingerprintPromise: Promise<string>;
	if ('siteType' in data && data.siteType === 'message') {
		contentFingerprintPromise = computeFingerprintFromString(serializeMessage(data as MessageData));
	} else if ('siteType' in data && data.siteType === 'fundraiser') {
		contentFingerprintPromise = computeFingerprintFromString(serializeFundraiser(data as FundraiserData));
	} else if ('siteType' in data && data.siteType === 'petition') {
		contentFingerprintPromise = computeFingerprintFromString(serializePetition(data as PetitionData));
	} else if ('siteType' in data && data.siteType === 'discussion') {
		contentFingerprintPromise = computeFingerprintFromString(serializeForum(data as ForumData));
	} else if ('siteType' in data && data.siteType === 'drop') {
		contentFingerprintPromise = computeFingerprintFromString(serializeDrop(data as DropData));
	} else if ('siteType' in data && data.siteType === 'art') {
		contentFingerprintPromise = computeFingerprintFromString(serializeArt(data as ArtData));
	} else if ('siteType' in data && data.siteType === 'event') {
		contentFingerprintPromise = computeFingerprintFromString(serializeEvent(data as EventData));
	} else {
		contentFingerprintPromise = computeFingerprint(data as StoreData);
	}

	const [storeFingerprint, sellerFingerprint] = await Promise.all([
		contentFingerprintPromise,
		computeSellerFingerprint(base64urlToHex(data.pubkey ?? ''))
	]);

	const [allSellerPhrases, allStorePhrases] = [
		computeAllVerificationPhrases(sellerFingerprint),
		computeAllVerificationPhrases(storeFingerprint)
	];

	return {
		sellerPhrase: computeVerificationPhrase(sellerFingerprint, defaultPhraseLength),
		storePhrase: computeVerificationPhrase(storeFingerprint, defaultPhraseLength),
		sellerFingerprint,
		storeFingerprint,
		defaultPhraseLength,
		allSellerPhrases,
		allStorePhrases
	};
}

export function verifySiteSignature(
	fragment: string,
	pubkeyBase64url: string
): { unsignedFragment: string; signed: boolean } {
	try {
		const fullBytes = base64urlToBytes(fragment);
		if (fullBytes.length <= 64) {
			return { unsignedFragment: fragment, signed: false };
		}
		const dataBytes = fullBytes.slice(0, fullBytes.length - 64);
		const sigBytes = fullBytes.slice(fullBytes.length - 64);
		const unsignedFragment = bytesToBase64url(dataBytes);
		const sigHex = Array.from(sigBytes, (b) => b.toString(16).padStart(2, '0')).join('');
		const pubkeyHex = base64urlToHex(pubkeyBase64url);

		const event = {
			kind: 22242,
			created_at: 0,
			tags: [] as string[][],
			content: unsignedFragment,
			pubkey: pubkeyHex,
			id: '',
			sig: sigHex
		};
		event.id = getEventHash(event);

		if (verifyEvent(event)) {
			return { unsignedFragment, signed: true };
		}
		return { unsignedFragment: fragment, signed: false };
	} catch {
		return { unsignedFragment: fragment, signed: false };
	}
}

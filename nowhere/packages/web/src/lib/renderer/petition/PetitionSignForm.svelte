<script lang="ts">
	import type { PetitionData, Tag } from '@nowhere/codec';
	import { base64urlToHex } from '@nowhere/codec';
	import { publishSignature, type SigningPhase } from '$lib/renderer/nostr/petition-signing.js';
	import { getPetitionRelays } from '$lib/renderer/nostr/relay-pool.js';
	import { siteFragment } from '$lib/renderer/stores/site-data.js';

	interface Props {
		data: PetitionData;
		onSigned?: () => void;
	}

	let { data, onSigned }: Props = $props();

	function getTag(key: string): string | undefined {
		return data.tags.find((t: Tag) => t.key === key)?.value;
	}
	function hasTag(key: string): boolean {
		return data.tags.some((t: Tag) => t.key === key);
	}
	function getCheckoutState(lower: string, upper: string): 'off' | 'optional' | 'required' {
		if (hasTag(upper)) return 'required';
		if (hasTag(lower)) return 'optional';
		return 'off';
	}

	const nameState = $derived(getCheckoutState('n', 'N'));
	const emailState = $derived(getCheckoutState('e', 'E'));
	const addressState = $derived(getCheckoutState('a', 'A'));
	const fullAddressState = $derived(getCheckoutState('b', 'B'));
	const phoneState = $derived(getCheckoutState('p', 'P'));
	const nostrState = $derived(getCheckoutState('z', 'Z'));
	const orgState = $derived(getCheckoutState('u', 'U'));
	const commentEnabled = $derived(hasTag('R'));
	const hasCountryRestriction = $derived(!!getTag('c'));
	const allowedCountries = $derived(getTag('c')?.split('.').filter(Boolean) ?? []);

	// Form state
	let step = $state<'choose' | 'form' | 'signing' | 'done' | 'error'>('choose');
	let signingPhase = $state<SigningPhase>('encrypting');
	let useNip07 = $state(false);
	let errorMsg = $state('');

	let fieldName = $state('');
	let fieldEmail = $state('');
	let fieldAddress = $state('');
	let fieldStreet = $state('');
	let fieldCity = $state('');
	let fieldAddrState = $state('');
	let fieldPostal = $state('');
	let fieldAddrCountry = $state('');
	let fieldPhone = $state('');
	let fieldNpub = $state('');
	let fieldOrg = $state('');
	let fieldComment = $state('');
	let fieldCountry = $state('');

	function chooseMethod(nip07: boolean) {
		useNip07 = nip07;
		step = 'form';
	}

	function isFieldVisible(state: string): boolean {
		return state !== 'off';
	}

	function isFieldRequired(state: string): boolean {
		return state === 'required';
	}

	function canSubmit(): boolean {
		if (isFieldRequired(nameState) && !fieldName.trim()) return false;
		if (isFieldRequired(emailState) && !fieldEmail.trim()) return false;
		if (isFieldRequired(addressState) && !fieldAddress.trim()) return false;
		if (isFieldRequired(fullAddressState) && (!fieldStreet.trim() || !fieldCity.trim() || !fieldAddrCountry.trim())) return false;
		if (isFieldRequired(phoneState) && !fieldPhone.trim()) return false;
		if (isFieldRequired(nostrState) && !fieldNpub.trim()) return false;
		if (isFieldRequired(orgState) && !fieldOrg.trim()) return false;
		if (hasCountryRestriction && !fieldCountry) return false;
		return true;
	}

	async function handleSubmit() {
		if (!canSubmit()) return;
		step = 'signing';
		errorMsg = '';

		try {
			const payload: Record<string, unknown> = { ts: Date.now() };
			if (fieldName.trim()) payload.name = fieldName.trim();
			if (fieldEmail.trim()) payload.email = fieldEmail.trim();
			if (fieldAddress.trim()) payload.address = fieldAddress.trim();
			if (isFieldVisible(fullAddressState)) {
				if (fieldStreet.trim()) payload.street = fieldStreet.trim();
				if (fieldCity.trim()) payload.city = fieldCity.trim();
				if (fieldAddrState.trim()) payload.addrState = fieldAddrState.trim();
				if (fieldPostal.trim()) payload.postal = fieldPostal.trim();
				if (fieldAddrCountry.trim()) payload.addrCountry = fieldAddrCountry.trim();
			}
			if (fieldPhone.trim()) payload.phone = fieldPhone.trim();
			if (fieldNpub.trim()) payload.npub = fieldNpub.trim();
			if (fieldOrg.trim()) payload.org = fieldOrg.trim();
			if (fieldComment.trim()) payload.comment = fieldComment.trim();
			if (fieldCountry) payload.country = fieldCountry;

			const creatorPubkeyHex = base64urlToHex(data.pubkey);
			const relays = getPetitionRelays(data.tags);
			const fragment = $siteFragment;

			await publishSignature(payload, creatorPubkeyHex, fragment, useNip07, relays, (phase) => {
				signingPhase = phase;
			});
			step = 'done';
			onSigned?.();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to sign petition';
			step = 'error';
		}
	}

	const hasNostr = $derived(typeof window !== 'undefined' && !!(window as any).nostr);
</script>

<div class="petition-sign-form">
	{#if step === 'choose'}
		<div class="petition-sign-methods">
			{#if hasNostr}
				<button class="petition-sign-method-btn" onclick={() => chooseMethod(true)}>
					Sign with Nostr identity
				</button>
			{/if}
			<button class="petition-sign-method-btn" onclick={() => chooseMethod(false)}>
				Sign anonymously
			</button>
		</div>
	{:else if step === 'form'}
		<div class="petition-sign-fields">
			{#if isFieldVisible(nameState)}
				<div class="petition-sign-field">
					<label>Name {isFieldRequired(nameState) ? '*' : ''}</label>
					<input type="text" bind:value={fieldName} placeholder="Your name" />
				</div>
			{/if}

			{#if isFieldVisible(emailState)}
				<div class="petition-sign-field">
					<label>Email {isFieldRequired(emailState) ? '*' : ''}</label>
					<input type="email" bind:value={fieldEmail} placeholder="email@example.com" />
				</div>
			{/if}

			{#if isFieldVisible(addressState)}
				<div class="petition-sign-field">
					<label>Location {isFieldRequired(addressState) ? '*' : ''}</label>
					<input type="text" bind:value={fieldAddress} placeholder="City, State / Country" />
				</div>
			{/if}

			{#if isFieldVisible(fullAddressState)}
				<div class="petition-sign-field">
					<label>Full Address {isFieldRequired(fullAddressState) ? '*' : ''}</label>
					<input type="text" bind:value={fieldStreet} placeholder="Street address" />
					<input type="text" bind:value={fieldCity} placeholder="City / Suburb" class="addr-sub" />
					<div class="addr-row">
						<input type="text" bind:value={fieldAddrState} placeholder="State / Province" />
						<input type="text" bind:value={fieldPostal} placeholder="Postcode" />
					</div>
					<input type="text" bind:value={fieldAddrCountry} placeholder="Country" class="addr-sub" />
				</div>
			{/if}

			{#if isFieldVisible(phoneState)}
				<div class="petition-sign-field">
					<label>Phone {isFieldRequired(phoneState) ? '*' : ''}</label>
					<input type="tel" bind:value={fieldPhone} placeholder="+1 555 123 4567" />
				</div>
			{/if}

			{#if isFieldVisible(nostrState)}
				<div class="petition-sign-field">
					<label>Nostr npub {isFieldRequired(nostrState) ? '*' : ''}</label>
					<input type="text" bind:value={fieldNpub} placeholder="npub1..." />
				</div>
			{/if}

			{#if isFieldVisible(orgState)}
				<div class="petition-sign-field">
					<label>Organisation {isFieldRequired(orgState) ? '*' : ''}</label>
					<input type="text" bind:value={fieldOrg} placeholder="Organisation or affiliation" />
				</div>
			{/if}

			{#if commentEnabled}
				<div class="petition-sign-field">
					<label>Comment</label>
					<textarea bind:value={fieldComment} placeholder="Add a personal message..." rows="3"></textarea>
				</div>
			{/if}

			{#if hasCountryRestriction}
				<div class="petition-sign-field">
					<label>Country *</label>
					<select bind:value={fieldCountry}>
						<option value="">Select your country</option>
						{#each allowedCountries as code}
							<option value={code}>{code}</option>
						{/each}
					</select>
				</div>
			{/if}

			<button
				class="petition-sign-submit"
				disabled={!canSubmit()}
				onclick={handleSubmit}
			>
				Sign this petition
			</button>
		</div>
	{:else if step === 'signing'}
		<div class="petition-sign-status petition-sign-progress">
			<span class="petition-sign-spinner"></span>
			<span>
				{#if signingPhase === 'encrypting'}
					Encrypting your signature...
				{:else if signingPhase === 'pow'}
					Computing proof of work...
				{:else}
					Publishing to relays...
				{/if}
			</span>
		</div>
	{:else if step === 'done'}
		<div class="petition-sign-status petition-sign-success">
			Your signature has been recorded. Thank you!
		</div>
	{:else if step === 'error'}
		<div class="petition-sign-status petition-sign-error">
			{errorMsg}
		</div>
		<div style="text-align: center; margin-top: 8px;">
			<button class="petition-sign-method-btn" onclick={() => { step = 'form'; }}>
				Try again
			</button>
		</div>
	{/if}
</div>

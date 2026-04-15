<script lang="ts">
	import { onMount } from 'svelte';
	import { decode, decryptFragment, base64urlToHex } from '@nowhere/codec';
	import type { PetitionData, Tag } from '@nowhere/codec';
	import { hasNostrExtension, hasNip44Support, getPublicKey, nip44Decrypt } from '$lib/nostr/nip07.js';
	import { fetchEvents, getPetitionRelays } from '$lib/renderer/nostr/relay-pool.js';
	import { NOWHERE_DTAG_PREFIX } from '$lib/renderer/nostr/constants.js';
	import { countLeadingZeroBits } from '$lib/renderer/nostr/pow.js';
	import { POW_DIFFICULTY } from '$lib/renderer/nostr/petition-signing.js';
	import { getEventHash } from 'nostr-tools/pure';
	import type { Event } from 'nostr-tools/core';
	import ManageNav from './ManageNav.svelte';

	// ─── Bech32 / npub ───────────────────────────────────────────────────────
	const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
	function bech32Polymod(values: number[]): number {
		const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
		let chk = 1;
		for (const v of values) {
			const b = chk >> 25;
			chk = ((chk & 0x1ffffff) << 5) ^ v;
			for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
		}
		return chk;
	}
	function bech32HrpExpand(hrp: string): number[] {
		const result: number[] = [];
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) >> 5);
		result.push(0);
		for (let i = 0; i < hrp.length; i++) result.push(hrp.charCodeAt(i) & 31);
		return result;
	}
	function bech32Checksum(hrp: string, data: number[]): number[] {
		const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
		const polymod = bech32Polymod(values) ^ 1;
		const checksum: number[] = [];
		for (let i = 0; i < 6; i++) checksum.push((polymod >> (5 * (5 - i))) & 31);
		return checksum;
	}
	function hexToNpub(hex: string): string {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		const words: number[] = [];
		let acc = 0; let bits = 0;
		for (const b of bytes) {
			acc = (acc << 8) | b; bits += 8;
			while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 0x1f); }
		}
		if (bits > 0) words.push((acc << (5 - bits)) & 0x1f);
		const allWords = [...words, ...bech32Checksum('npub', words)];
		let result = 'npub1';
		for (const w of allWords) result += BECH32_ALPHABET[w];
		return result;
	}

	// NIP-07 state
	let connected = $state(false);
	let sellerPubkey = $state('');
	const sellerNpub = $derived(sellerPubkey ? hexToNpub(sellerPubkey) : '');
	let connectError = $state('');

	// Petition state
	let petitionUrl = $state('');
	let petitionFragment = $state('');
	let petitionData = $state<PetitionData | null>(null);
	let petitionPubkeyHex = $state('');
	let petitionError = $state('');
	let petitionLoaded = $state(false);
	let ownerMismatch = $state(false);

	// Decrypt mode — shown when petition decode fails
	let petitionDecryptMode = $state(false);
	let petitionDecryptPassword = $state('');
	let petitionShowPassword = $state(false);
	let petitionDecryptError = $state('');
	let petitionDecrypting = $state(false);
	let petitionPendingFragment = $state('');

	// Signature state
	interface DecryptedSignature {
		pubkey: string;
		createdAt: number;
		ts?: number;
		name?: string;
		email?: string;
		address?: string;
		street?: string;
		city?: string;
		addrState?: string;
		postal?: string;
		addrCountry?: string;
		phone?: string;
		npub?: string;
		org?: string;
		comment?: string;
		country?: string;
		decryptError?: boolean;
	}

	let signatures = $state<DecryptedSignature[]>([]);
	let rawEvents = $state<Event[]>([]);
	let fetchingSignatures = $state(false);
	let decryptingSignatures = $state(false);
	let decryptProgress = $state(0);
	let fetchResult = $state('');

	// Tag helpers
	function getTag(key: string): string | undefined {
		return petitionData?.tags?.find((t: Tag) => t.key === key)?.value;
	}
	function hasTag(key: string): boolean {
		return petitionData?.tags?.some((t: Tag) => t.key === key) ?? false;
	}

	// Derived petition info
	const title = $derived(petitionData?.name ?? '');
	const organiser = $derived(petitionData ? getTag('T') : undefined);
	const goalRaw = $derived(petitionData ? getTag('g') : undefined);
	const goal = $derived(goalRaw ? parseInt(goalRaw, 10) : null);
	const deadline = $derived(petitionData ? getTag('h') : undefined);

	const daysLeft = $derived.by(() => {
		if (!deadline) return null;
		const target = new Date(deadline);
		const now = new Date();
		const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
		return diff > 0 ? diff : 0;
	});

	const progress = $derived(goal && goal > 0 ? Math.min((signatures.length / goal) * 100, 100) : null);

	const decryptedCount = $derived(signatures.filter((s) => !s.decryptError).length);
	const failedCount = $derived(signatures.filter((s) => s.decryptError).length);

	// Signer field config
	function getFieldState(lower: string, upper: string): 'off' | 'optional' | 'required' {
		if (hasTag(upper)) return 'required';
		if (hasTag(lower)) return 'optional';
		return 'off';
	}

	const nameState = $derived(petitionData ? getFieldState('n', 'N') : 'off');
	const emailState = $derived(petitionData ? getFieldState('e', 'E') : 'off');
	const addressState = $derived(petitionData ? getFieldState('a', 'A') : 'off');
	const fullAddressState = $derived(petitionData ? getFieldState('b', 'B') : 'off');
	const phoneState = $derived(petitionData ? getFieldState('p', 'P') : 'off');
	const nostrState = $derived(petitionData ? getFieldState('z', 'Z') : 'off');
	const orgState = $derived(petitionData ? getFieldState('u', 'U') : 'off');
	const commentEnabled = $derived(petitionData ? hasTag('R') : false);

	// Visible columns for the signature table
	const visibleColumns = $derived.by(() => {
		const cols: { key: string; label: string }[] = [];
		cols.push({ key: 'time', label: 'Signed' });
		if (nameState !== 'off') cols.push({ key: 'name', label: 'Name' });
		if (emailState !== 'off') cols.push({ key: 'email', label: 'Email' });
		if (addressState !== 'off') cols.push({ key: 'address', label: 'Location' });
		if (fullAddressState !== 'off') cols.push({ key: 'fullAddress', label: 'Full Address' });
		if (phoneState !== 'off') cols.push({ key: 'phone', label: 'Phone' });
		if (nostrState !== 'off') cols.push({ key: 'npub', label: 'Npub' });
		if (orgState !== 'off') cols.push({ key: 'org', label: 'Organisation' });
		if (commentEnabled) cols.push({ key: 'comment', label: 'Comment' });
		cols.push({ key: 'country', label: 'Country' });
		return cols;
	});

	function signOut() {
		connected = false;
		sellerPubkey = '';
		petitionUrl = '';
		petitionFragment = '';
		petitionData = null;
		petitionLoaded = false;
		ownerMismatch = false;
		signatures = [];
		rawEvents = [];
		fetchResult = '';
		petitionDecryptMode = false;
		petitionDecryptPassword = '';
		petitionDecryptError = '';
		petitionPendingFragment = '';
	}

	async function connectNip07() {
		connectError = '';
		if (!hasNostrExtension()) {
			connectError = 'No Nostr signing extension found. Install nos2x, Alby, or similar.';
			return;
		}
		if (!hasNip44Support()) {
			connectError = 'Your Nostr extension does not support NIP-44 encryption.';
			return;
		}
		try {
			sellerPubkey = await getPublicKey();
			connected = true;
		} catch (e) {
			connectError = `Connection failed: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	function loadPetition() {
		petitionError = '';
		petitionLoaded = false;
		petitionData = null;
		ownerMismatch = false;
		signatures = [];
		rawEvents = [];
		fetchResult = '';
		petitionDecryptMode = false;
		petitionDecryptPassword = '';
		petitionDecryptError = '';
		petitionPendingFragment = '';

		if (!petitionUrl.trim()) return;

		let fragment = petitionUrl.trim();
		const hashIdx = fragment.indexOf('#');
		if (hashIdx !== -1) fragment = fragment.slice(hashIdx + 1);
		const starIdx = fragment.indexOf('*');
		if (starIdx !== -1) fragment = fragment.slice(0, starIdx);

		try {
			const data = decode(fragment);

			if (data.siteType !== 'petition') {
				petitionError = 'This URL is not a petition.';
				return;
			}

			petitionFragment = fragment;
			petitionData = data as PetitionData;
			petitionPubkeyHex = base64urlToHex(data.pubkey);

			if (sellerPubkey !== petitionPubkeyHex) {
				ownerMismatch = true;
			}

			petitionLoaded = true;
			fetchSignatures();
		} catch {
			// May be encrypted — offer password prompt
			petitionPendingFragment = fragment;
			petitionDecryptMode = true;
		}
	}

	async function tryDecryptPetition() {
		petitionDecryptError = '';
		petitionDecrypting = true;
		try {
			const decrypted = await decryptFragment(petitionPendingFragment, petitionDecryptPassword);
			const data = decode(decrypted);

			if (data.siteType !== 'petition') {
				petitionDecryptError = 'This URL is not a petition.';
				return;
			}

			petitionFragment = decrypted;
			petitionData = data as PetitionData;
			petitionPubkeyHex = base64urlToHex(data.pubkey);
			ownerMismatch = sellerPubkey !== petitionPubkeyHex;
			petitionLoaded = true;
			petitionDecryptMode = false;
			petitionDecryptPassword = '';
			fetchSignatures();
		} catch {
			petitionDecryptError = 'Incorrect password.';
		} finally {
			petitionDecrypting = false;
		}
	}

	async function computePetitionHash(fragment: string): Promise<string> {
		const data = new TextEncoder().encode(fragment);
		const hash = await crypto.subtle.digest('SHA-256', data);
		const bytes = new Uint8Array(hash);
		let hex = '';
		for (const b of bytes) hex += b.toString(16).padStart(2, '0');
		return hex.slice(0, 16);
	}

	async function fetchSignatures() {
		if (!petitionFragment || !petitionData) return;
		fetchingSignatures = true;
		fetchResult = '';
		signatures = [];
		rawEvents = [];

		try {
			const petitionHash = await computePetitionHash(petitionFragment);
			const dtag = `${NOWHERE_DTAG_PREFIX}/${petitionHash}`;
			const relays = getPetitionRelays(petitionData.tags);

			// Paginate: relays cap responses (often 100-500 per query), so
			// walk backwards in time with `until` to collect everything.
			const PAGE_LIMIT = 5000;
			const seen = new Set<string>();
			let until: number | undefined;
			let page = 0;
			const allEvents: Event[] = [];

			while (true) {
				const filter: Record<string, unknown> = {
					kinds: [30078],
					'#d': [dtag],
					limit: PAGE_LIMIT
				};
				if (until != null) filter.until = until;

				page++;
				fetchResult = `Fetching page ${page}${seen.size > 0 ? ` (${seen.size} events so far)` : ''}…`;
				const batch = await fetchEvents(filter as any, relays);
				if (batch.length === 0) break;

				const fresh = batch.filter((e) => !seen.has(e.id));
				for (const e of fresh) seen.add(e.id);
				allEvents.push(...fresh);

				// Advance cursor: move `until` to 1 second before the oldest
				// event so we don't get stuck when many share a timestamp.
				const oldest = batch.reduce((min, e) => Math.min(min, e.created_at), Infinity);
				const nextUntil = oldest - 1;
				if (until != null && nextUntil >= until) break;
				until = nextUntil;
			}

			// Deduplicate by pubkey (keep latest)
			const byPubkey = new Map<string, Event>();
			for (const ev of allEvents) {
				const existing = byPubkey.get(ev.pubkey);
				if (!existing || ev.created_at > existing.created_at) {
					byPubkey.set(ev.pubkey, ev);
				}
			}

			const deduped = [...byPubkey.values()];

			// Filter out events that don't meet POW difficulty
			const valid = deduped.filter((ev) => {
				const id = ev.id ?? getEventHash(ev as any);
				return countLeadingZeroBits(id) >= POW_DIFFICULTY;
			});

			const rejected = deduped.length - valid.length;
			rawEvents = valid.sort((a, b) => b.created_at - a.created_at);
			fetchResult = `Found ${rawEvents.length} signature${rawEvents.length === 1 ? '' : 's'} on relays.` +
				(rejected > 0 ? ` ${rejected} rejected (insufficient proof of work).` : '');

			if (rawEvents.length > 0) {
				await decryptAll();
			}
		} catch (e) {
			fetchResult = `Failed to fetch signatures: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			fetchingSignatures = false;
		}
	}

	async function decryptAll() {
		decryptingSignatures = true;
		decryptProgress = 0;
		const results: DecryptedSignature[] = [];

		for (let i = 0; i < rawEvents.length; i++) {
			const ev = rawEvents[i];
			decryptProgress = i + 1;

			try {
				const plaintext = await nip44Decrypt(ev.pubkey, ev.content);
				const payload = JSON.parse(plaintext);
				results.push({
					pubkey: ev.pubkey,
					createdAt: ev.created_at,
					ts: payload.ts,
					name: payload.name,
					email: payload.email,
					address: payload.address,
					street: payload.street,
					city: payload.city,
					addrState: payload.addrState,
					postal: payload.postal,
					addrCountry: payload.addrCountry,
					phone: payload.phone,
					npub: payload.npub,
					org: payload.org,
					comment: payload.comment,
					country: payload.country
				});
			} catch {
				results.push({
					pubkey: ev.pubkey,
					createdAt: ev.created_at,
					decryptError: true
				});
			}
		}

		signatures = results;
		decryptingSignatures = false;
	}

	function formatDate(ts: number): string {
		return new Date(ts * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatTs(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function exportCsv() {
		const headers = ['Signed At', 'Name', 'Email', 'Location', 'Street', 'City', 'State/Province', 'Postcode', 'Addr Country', 'Phone', 'Npub', 'Organisation', 'Comment', 'Country', 'Pubkey'];
		const rows = signatures
			.filter((s) => !s.decryptError)
			.map((s) => [
				s.ts ? new Date(s.ts).toISOString() : formatDate(s.createdAt),
				s.name ?? '',
				s.email ?? '',
				s.address ?? '',
				s.street ?? '',
				s.city ?? '',
				s.addrState ?? '',
				s.postal ?? '',
				s.addrCountry ?? '',
				s.phone ?? '',
				s.npub ?? '',
				s.org ?? '',
				s.comment ?? '',
				s.country ?? '',
				s.pubkey
			]);

		const csvContent = [headers, ...rows]
			.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
			.join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${title || 'petition'}-signatures.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Sorting
	let sortKey = $state<string>('time');
	let sortAsc = $state(false);

	const sortedSignatures = $derived.by(() => {
		const list = [...signatures];
		list.sort((a, b) => {
			let va: string | number;
			let vb: string | number;

			if (sortKey === 'time') {
				va = a.ts ?? a.createdAt * 1000;
				vb = b.ts ?? b.createdAt * 1000;
			} else {
				va = ((a as unknown as Record<string, unknown>)[sortKey] as string) ?? '';
				vb = ((b as unknown as Record<string, unknown>)[sortKey] as string) ?? '';
			}

			if (typeof va === 'number' && typeof vb === 'number') {
				return sortAsc ? va - vb : vb - va;
			}
			return sortAsc
				? String(va).localeCompare(String(vb))
				: String(vb).localeCompare(String(va));
		});
		return list;
	});

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = key !== 'time';
		}
	}

	// Signature timeline stats
	const recentSignatures = $derived.by(() => {
		const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
		return signatures.filter((s) => {
			const t = s.ts ?? s.createdAt * 1000;
			return t > oneDayAgo;
		}).length;
	});

	const signaturesThisWeek = $derived.by(() => {
		const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		return signatures.filter((s) => {
			const t = s.ts ?? s.createdAt * 1000;
			return t > oneWeekAgo;
		}).length;
	});

	/* Manage pages are light-mode only. Host apps may have set `html[data-theme="dark"]`
	   (e.g. nowhr's /app toggle); force light while mounted and restore on unmount. */
	onMount(() => {
		const html = document.documentElement;
		const prev = html.dataset.theme;
		html.dataset.theme = 'light';
		return () => {
			if (prev === undefined) delete html.dataset.theme;
			else html.dataset.theme = prev;
		};
	});
</script>

<svelte:head>
	<title>Manage Petition · nowhere</title>
</svelte:head>

{#if !connected}
<!-- ── Auth screen ───────────────────────────────────────────────────────── -->
<div class="signin-root">
	<ManageNav />
	<div class="signin-content">
		<div class="signin-brand">
			<span class="signin-brand-mark">nowhere</span>
			<span class="signin-brand-type">Petition</span>
		</div>
		<h1 class="signin-heading">Connect your<br><em>extension.</em></h1>
		<button class="signin-btn" onclick={connectNip07}>Connect Extension →</button>
		{#if connectError}
			<p class="signin-error">{connectError}</p>
		{/if}
	</div>
</div><!-- signin-root -->

{:else}
<!-- ── Dashboard ─────────────────────────────────────────────────────────── -->
<div class="manage-page">
	<nav class="manage-nav">
		<a href="/" class="logo">nowhere</a>
		<a href="/manage" class="nav-link">Manage</a>
		<a href="/create/petition" class="nav-link">Builder</a>
		<button class="btn-signout" onclick={signOut}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="14" height="14">
				<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
				<polyline points="16 17 21 12 16 7" />
				<line x1="21" y1="12" x2="9" y2="12" />
			</svg>
			Sign out
		</button>
	</nav>
	<div class="manage-content">
		<div class="signin-brand">
			<span class="signin-brand-mark">nowhere</span>
			<span class="signin-brand-type">Petition</span>
		</div>
		<div class="connected-badge">
				<span class="badge-dot"></span>
				<span class="pubkey-label">{sellerNpub.slice(0, 12)}…{sellerNpub.slice(-4)}</span>
			</div>

			<!-- Petition URL -->
			<div class="section">
				<h2>Petition URL</h2>
				<p class="section-desc">Paste your petition URL to load signatures.</p>
				<div class="input-row">
					<input
						type="text"
						bind:value={petitionUrl}
						placeholder="https://nowhere.store/s#..."
						onkeydown={(e) => e.key === 'Enter' && loadPetition()}
						oninput={() => { petitionDecryptMode = false; petitionDecryptPassword = ''; petitionDecryptError = ''; petitionPendingFragment = ''; }}
					/>
					<button class="btn-secondary" onclick={loadPetition}>Load</button>
				</div>
				{#if petitionError}
					<p class="error-msg">{petitionError}</p>
				{/if}
				{#if petitionDecryptMode}
					<p class="decrypt-hint">This URL could not be loaded. It may be encrypted — enter a password to try, or check that the URL is correct.</p>
					<div class="decrypt-row">
						<input
							type={petitionShowPassword ? 'text' : 'password'}
							bind:value={petitionDecryptPassword}
							placeholder="Password"
							class="decrypt-input"
							onkeydown={(e) => e.key === 'Enter' && !petitionDecrypting && petitionDecryptPassword && tryDecryptPetition()}
						/>
						<button class="btn-ghost" onclick={() => petitionShowPassword = !petitionShowPassword}>
							{petitionShowPassword ? 'Hide' : 'Show'}
						</button>
						<button
							class="btn-secondary"
							onclick={tryDecryptPetition}
							disabled={!petitionDecryptPassword || petitionDecrypting}
						>
							{petitionDecrypting ? 'Decrypting…' : 'Decrypt & Load'}
						</button>
					</div>
					{#if petitionDecryptError}
						<p class="error-msg">{petitionDecryptError}</p>
					{/if}
				{/if}
			</div>

			{#if petitionLoaded && petitionData}
				{#if ownerMismatch}
					<div class="warning-box">
						<strong>Warning:</strong> Your connected pubkey does not match the petition creator.
						You will not be able to decrypt the signatures.
					</div>
				{/if}

				<!-- Petition Info -->
				<div class="petition-info">
					<h2 class="petition-title">{title}</h2>
					{#if organiser}
						<p class="petition-organiser">by {organiser}</p>
					{/if}
					<div class="petition-meta">
						{#if goal}
							<span class="meta-item">Goal: {goal.toLocaleString()}</span>
						{/if}
						{#if deadline}
							<span class="meta-item">Deadline: {deadline}{#if daysLeft !== null} ({daysLeft} {daysLeft === 1 ? 'day' : 'days'} left){/if}</span>
						{/if}
					</div>
				</div>

				{#if fetchingSignatures}
					<p class="result-msg">{fetchResult || 'Fetching from relays…'}</p>
				{:else if decryptingSignatures}
					<p class="result-msg">Decrypting {decryptProgress}/{rawEvents.length}…</p>
				{:else if fetchResult}
					<p class="result-msg">{fetchResult}</p>
				{/if}

				{#if signatures.length > 0}
					<!-- Summary Stats -->
					<div class="stats-grid">
						<div class="stat-card stat-highlight">
							<div class="stat-value">{signatures.length}</div>
							<div class="stat-label">Total Signatures</div>
						</div>
						{#if goal}
							<div class="stat-card">
								<div class="stat-value">{progress?.toFixed(0)}%</div>
								<div class="stat-label">of {goal.toLocaleString()} goal</div>
								<div class="stat-bar">
									<div class="stat-bar-fill" style:width="{progress}%"></div>
								</div>
							</div>
						{/if}
						<div class="stat-card">
							<div class="stat-value">{recentSignatures}</div>
							<div class="stat-label">Last 24 hours</div>
						</div>
						<div class="stat-card">
							<div class="stat-value">{signaturesThisWeek}</div>
							<div class="stat-label">Last 7 days</div>
						</div>
					</div>

					{#if failedCount > 0}
						<p class="warning-msg">{failedCount} signature{failedCount === 1 ? '' : 's'} could not be decrypted.</p>
					{/if}

					<!-- Actions -->
					<div class="section actions-row">
						<button class="btn-secondary" onclick={exportCsv} disabled={decryptedCount === 0}>
							Export CSV ({decryptedCount})
						</button>
					</div>

					<!-- Signature Table -->
					<div class="table-wrapper">
						<table>
							<thead>
								<tr>
									{#each visibleColumns as col}
										<th class="sortable" onclick={() => toggleSort(col.key)}>
											{col.label}
											{#if sortKey === col.key}
												<span class="sort-arrow">{sortAsc ? '\u25B2' : '\u25BC'}</span>
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each sortedSignatures as sig}
									<tr class:decrypt-error={sig.decryptError}>
										{#each visibleColumns as col}
											<td>
												{#if col.key === 'time'}
													{#if sig.decryptError}
														<span class="muted">{formatDate(sig.createdAt)}</span>
													{:else if sig.ts}
														{formatTs(sig.ts)}
													{:else}
														{formatDate(sig.createdAt)}
													{/if}
												{:else if sig.decryptError}
													{#if col.key === 'name'}
														<span class="decrypt-label">Could not decrypt</span>
													{:else}
														&mdash;
													{/if}
												{:else if col.key === "fullAddress"}
													{@const parts = [sig.city, sig.addrCountry].filter(Boolean)}
													{@const fullTooltip = [sig.street, sig.city, sig.addrState, sig.postal, sig.addrCountry].filter(Boolean).join(", ")}
													{#if parts.length}
														<span title={fullTooltip}>{parts.join(", ")}</span>
													{:else}
														<span class="muted">&mdash;</span>
													{/if}
												{:else}
													{@const val = (sig as unknown as Record<string, unknown>)[col.key]}
													{#if val}
														{val}
													{:else}
														<span class="muted">&mdash;</span>
													{/if}
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
	</div>
</div><!-- manage-page -->
{/if}

<style>
	.manage-page {
		--ink:    var(--color-text);
		--ink-60: var(--color-text-secondary);
		min-height: 100vh;
	}

	/* ── Mode 1 nav (sign-in) ─────────────────────────────────────────────── */
	.signin-root {
		--bg:     #fafaf8;
		--ink:    #1a1a1a;
		--ink-60: rgba(26,26,26,0.60);
		--ink-35: rgba(26,26,26,0.35);
		--ink-15: rgba(26,26,26,0.09);
		--nav-bg: rgba(250,250,248,0.90);
		--font:   -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--mono:   ui-monospace, 'SF Mono', 'Cascadia Code', 'Courier New', monospace;
		--col:    clamp(1.5rem, 6vw, 5rem);
		min-height: 100vh;
		background: var(--bg);
		font-family: var(--font);
		-webkit-font-smoothing: antialiased;
	}

	:global([data-theme="dark"]) .signin-root {
		--bg:     #0d0d0d;
		--ink:    #e8e8e8;
		--ink-60: rgba(232,232,232,0.60);
		--ink-35: rgba(232,232,232,0.35);
		--ink-15: rgba(232,232,232,0.10);
		--nav-bg: rgba(13,13,13,0.88);
	}

	@keyframes page-enter {
		from { opacity: 0; transform: translateY(6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.signin-content {
		padding: clamp(6rem, 14vh, 10rem) var(--col) clamp(4rem, 10vh, 7rem);
		animation: page-enter 0.3s ease forwards;
	}

	.signin-brand {
		display: flex;
		align-items: baseline;
		gap: 0.5em;
		margin-bottom: clamp(1.5rem, 3vh, 2.5rem);
	}

	.signin-brand-mark {
		font-size: clamp(2rem, 3.5vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--ink);
	}

	.signin-brand-type {
		font-size: clamp(2rem, 3.5vw, 3rem);
		font-weight: 500;
		letter-spacing: -0.03em;
		color: var(--ink-60);
	}

	.signin-heading {
		font-size: clamp(2rem, 5vw, 4rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.05;
		color: var(--ink);
		margin-bottom: clamp(2.5rem, 6vh, 4rem);
	}

	.signin-heading em {
		font-style: normal;
		color: var(--ink-35);
	}

	.signin-btn {
		font-family: var(--font);
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--ink-60);
		background: none;
		border: 1px solid var(--ink-15);
		padding: 0.75rem 1.25rem;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s, border-color 0.15s;
	}

	.signin-btn:hover {
		color: var(--ink);
		border-color: var(--ink-35);
	}

	.signin-error {
		margin-top: 1rem;
		font-size: 0.75rem;
		color: #b91c1c;
	}

	/* ── Mode 2 nav (dashboard) ───────────────────────────────────────────── */
	.manage-nav {
		display: flex;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	.logo {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
	}

	.nav-link {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.btn-signout {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 5px var(--space-3);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: all var(--transition-fast);
		margin-left: auto;
	}

	.btn-signout:hover {
		color: var(--color-text);
		border-color: var(--color-border);
		background: var(--color-bg-secondary);
	}

	.manage-content {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4);
	}

	h1 {
		font-size: var(--text-2xl);
		font-weight: 700;
		margin-bottom: var(--space-2);
	}

	.subtitle {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-6);
	}

	.section {
		margin-bottom: var(--space-6);
	}

	.section h2 {
		font-size: var(--text-lg);
		font-weight: 600;
		margin-bottom: var(--space-3);
	}

	.section-desc {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-3);
	}

	.connected-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		margin-bottom: var(--space-6);
	}

	.badge-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-success, #22c55e);
	}

	.pubkey-label {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
	}

	.connected-badge code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.input-row {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.input-row input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
	}

	.input-row input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-primary-text);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: var(--text-sm);
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-bg-secondary);
	}

	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-msg {
		font-size: var(--text-sm);
		color: var(--color-error);
		margin-top: var(--space-2);
	}

	.decrypt-hint {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		padding: var(--space-2) var(--space-3);
		background: rgba(234, 179, 8, 0.08);
		border: 1px solid rgba(234, 179, 8, 0.25);
		border-radius: var(--radius-sm);
		margin-top: var(--space-2);
	}

	.decrypt-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
		align-items: center;
	}

	.decrypt-input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.decrypt-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.btn-ghost {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
	}

	.btn-ghost:hover {
		background: var(--color-border);
	}

	.result-msg {
		font-size: var(--text-sm);
		margin-top: var(--space-2);
		color: var(--color-text-secondary);
	}

	.warning-box {
		padding: var(--space-3) var(--space-4);
		background: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		margin-bottom: var(--space-6);
		color: #92400e;
	}

	.warning-msg {
		font-size: var(--text-sm);
		color: #b45309;
		margin-bottom: var(--space-4);
	}

	/* Petition info */
	.petition-info {
		margin-bottom: var(--space-6);
		padding: var(--space-4);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.petition-title {
		font-size: var(--text-lg);
		font-weight: 700;
		margin-bottom: var(--space-1);
	}

	.petition-organiser {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.petition-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.meta-item {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	/* Stats */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.stat-card {
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		text-align: center;
	}

	.stat-highlight {
		border-color: var(--color-primary);
		background: var(--color-bg-secondary);
	}

	.stat-value {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.stat-label {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		margin-top: var(--space-1);
	}

	.stat-bar {
		margin-top: var(--space-2);
		height: 4px;
		background: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.stat-bar-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.3s ease;
	}

	/* Actions */
	.actions-row {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	/* Table */
	.table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-6);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	thead {
		background: var(--color-bg-secondary);
		border-bottom: 1px solid var(--color-border);
	}

	th {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font-weight: 600;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
		user-select: none;
	}

	th.sortable {
		cursor: pointer;
	}

	th.sortable:hover {
		color: var(--color-text);
	}

	.sort-arrow {
		font-size: 10px;
		margin-left: 2px;
	}

	td {
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--color-border);
		white-space: nowrap;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	tr.decrypt-error {
		opacity: 0.5;
	}

	.decrypt-label {
		font-style: italic;
		color: var(--color-text-secondary);
	}

	.muted {
		color: var(--color-text-secondary);
	}
</style>

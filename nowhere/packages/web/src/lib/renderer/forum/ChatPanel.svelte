<script lang="ts">
	import type { DecryptedChatMessage } from '$lib/renderer/nostr/forum-chat.js';
	import {
		subscribeToChatMessages,
		publishChatMessage,
		publishRoomChatMessage,
		publishPrivateChatMessage,
		publishRoomAnnouncement,
		getStoredRooms,
		storeRooms
	} from '$lib/renderer/nostr/forum-chat.js';
	import { deriveRoomKeypair } from '$lib/nostr/forum-keys.js';
	import { computeFingerprintFromString, computeVerificationPhrase } from '@nowhere/codec';
	import { npubEncode } from 'nostr-tools/nip19';
	import { fetchEvent, fetchProfile } from '$lib/renderer/nostr/relay-pool.js';
	import type { ForumCache } from '$lib/renderer/nostr/forum-cache.js';
	import AuthorIdentity from './AuthorIdentity.svelte';
	import { sanitizeImageUrl } from '$lib/renderer/utils/sanitize-url.js';
	import { sanitizeSvg } from '$lib/renderer/utils/svg-sanitize.js';
	import { verifyJoinSignature } from '$lib/renderer/nostr/forum-voice.js';
	import type { SubCloser } from 'nostr-tools/pool';
	import type { VoiceSignal } from '$lib/renderer/nostr/forum-voice.js';
	import { MAX_PARTICIPANTS } from '$lib/renderer/nostr/voice-mesh.js';
	import { wrapContentForSigning, INNER_EVENT_KIND } from '$lib/renderer/nostr/nowhere-signing.js';

	interface Props {
		chatTag: string;
		forumPubkey: string;
		forumPrivkey: Uint8Array;
		relays: string[];
		privacyMode: number;
		authorPubkey: string;
		authorPrivkey?: Uint8Array;
		sessionPrivkey: Uint8Array;
		sessionPubkey: string;
		canPost: boolean;
		onSignIn?: () => void;
		forumFingerprint: string;
		onJoined?: () => void;
		onClose?: () => void;
		visible?: boolean;
		onNotification?: (level: 'private' | 'default' | null) => void;
		voiceEnabled?: boolean;
		nip07Pubkey?: string;
		autoJoin?: boolean;
		profileRelays?: string[];
		forumCache?: ForumCache;
		// Voice integration — owned by ForumRenderer
		onRequestVoice?: (channelKey: string, recipientPubkey: string) => void;
		onLeaveVoice?: () => void;
		onVoiceSignal?: (signal: VoiceSignal) => void;
		activeVoiceChannel?: string; // which channel ForumRenderer has in voice
		wotSet?: Set<string> | null;
		wotBlocked?: boolean;
	}

	let {
		chatTag, forumPubkey, forumPrivkey, relays, privacyMode, authorPubkey, authorPrivkey,
		sessionPrivkey, sessionPubkey, canPost, onSignIn, forumFingerprint, onJoined, onClose,
		visible = true, onNotification, voiceEnabled = false, nip07Pubkey = '', autoJoin = false,
		profileRelays, forumCache, onRequestVoice, onLeaveVoice, onVoiceSignal, activeVoiceChannel = '',
		wotSet = null, wotBlocked = false
	}: Props = $props();

	// ─── State ───
	let joined = $state(false);
	let activeChannelKey = $state('general');
	let messagesByChannel = $state<Record<string, DecryptedChatMessage[]>>({});
	let unreadChannels = $state<Set<string>>(new Set());

	// Rooms (with derived keys)
	let rooms = $state<Array<{ name: string; accessCode: string; privkey: Uint8Array; pubkey: string }>>([]);

	// Private chat peers (auto-discovered)
	let privatePeers = $state<string[]>([]);

	// Known session pubkeys seen in general chat (sp field) and voice signals
	// Maps authorPubkey → sessionPubkey — used to encrypt private voice signals correctly
	const sessionPubkeyByAuthor = new Map<string, string>();

	// Voice presence: channelKey → Set of session pubkeys currently in voice
	// Used to show voice activity in the sidebar without joining
	let voicePresence = $state<Map<string, Set<string>>>(new Map());
	const presenceTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

	// Incoming private voice calls: Set of author pubkeys
	let incomingCalls = $state<Set<string>>(new Set());

	// UI state
	let sidebarOpen = $state(typeof window !== 'undefined' ? window.innerWidth > 640 : true);
	let showRoomDialog = $state<'create' | 'join' | null>(null);
	let roomNameInput = $state('');
	let roomCodeInput = $state('');
	let showAddMenu = $state(false);
	let showRoomCode = $state(false);
	let roomCodeCopied = $state(false);

	let inputText = $state('');
	let sub: SubCloser | null = null;
	let lastSubChatTag = '';
	let messagesEl: HTMLDivElement | undefined = $state();

	// ─── Profile Card State ───
	let profileCardPubkey = $state('');
	let profileCardData = $state<{
		phrase: string;
		npubFull: string;
		npubTruncated: string;
		avatarSvg: string;
		name: string;
		picture: string;
		nip05: string;
		about: string;
	}>({ phrase: '', npubFull: '', npubTruncated: '', avatarSvg: '', name: '', picture: '', nip05: '', about: '' });
	let profileCardCopied = $state(false);

	const showProfileCard = $derived(profileCardPubkey !== '');
	const profileCardCanPM = $derived(
		profileCardPubkey !== '' &&
		profileCardPubkey !== sessionPubkey &&
		!activeChannelKey.startsWith('private:')
	);

	async function openProfileCard(pubkey: string) {
		profileCardPubkey = pubkey;
		profileCardCopied = false;
		profileCardData = { phrase: '', npubFull: '', npubTruncated: '', avatarSvg: '', name: '', picture: '', nip05: '', about: '' };

		try {
			const npub = npubEncode(pubkey);
			profileCardData.npubFull = npub;
			profileCardData.npubTruncated = npub.slice(0, 12) + '...' + npub.slice(-4);
		} catch {
			profileCardData.npubFull = pubkey;
			profileCardData.npubTruncated = pubkey.slice(0, 8) + '...';
		}

		try {
			const fp = await computeFingerprintFromString(pubkey);
			profileCardData.phrase = computeVerificationPhrase(fp, 6);
		} catch {}

		try {
			const { generateAvatar } = await import('$lib/nowhere-avatar.js');
			profileCardData.avatarSvg = generateAvatar(pubkey, 56);
		} catch {}

		if (privacyMode === 0) {
			try {
				const event = await fetchProfile({ kinds: [0], authors: [pubkey], limit: 1 }, profileRelays, forumCache);
				if (event?.content) {
					const p = JSON.parse(event.content);
					profileCardData.name = p.display_name || p.name || '';
					profileCardData.picture = sanitizeImageUrl(p.picture || '');
					profileCardData.nip05 = p.nip05 || '';
					profileCardData.about = p.about || '';
				}
			} catch {}
		}
	}

	function closeProfileCard() { profileCardPubkey = ''; }

	async function copyNpub() {
		try {
			await navigator.clipboard.writeText(profileCardData.npubFull);
			profileCardCopied = true;
			setTimeout(() => { profileCardCopied = false; }, 2000);
		} catch {}
	}

	function profileCardStartPM() {
		if (!profileCardPubkey || profileCardPubkey === sessionPubkey) return;
		startPrivateChat(profileCardPubkey);
		closeProfileCard();
	}

	// ─── Derived ───
	const activeMessages = $derived(
		(messagesByChannel[activeChannelKey] ?? []).slice().sort((a, b) => a.payload.ts - b.payload.ts)
	);

	const activeChannelLabel = $derived.by(() => {
		if (activeChannelKey === 'general') return 'General';
		if (activeChannelKey.startsWith('room:')) return activeChannelKey.slice(5);
		if (activeChannelKey.startsWith('private:')) return '';
		return activeChannelKey;
	});

	const activeRoom = $derived(
		activeChannelKey.startsWith('room:')
			? rooms.find(r => r.name === activeChannelKey.slice(5))
			: undefined
	);

	const voiceActiveForChannel = $derived(activeVoiceChannel === activeChannelKey);
	const voiceParticipantCount = $derived(voiceCount(activeChannelKey) + (voiceActiveForChannel ? 1 : 0));
	const voiceCallFull = $derived(!voiceActiveForChannel && voiceCount(activeChannelKey) >= MAX_PARTICIPANTS);

	async function copyRoomCode() {
		if (!activeRoom) return;
		try {
			await navigator.clipboard.writeText(activeRoom.name + '|' + activeRoom.accessCode);
			roomCodeCopied = true;
			setTimeout(() => { roomCodeCopied = false; }, 2000);
		} catch {}
	}

	// ─── Room management ───
	function addRoom(name: string, accessCode: string) {
		if (rooms.some(r => r.name === name && r.accessCode === accessCode)) return;
		const keys = deriveRoomKeypair(forumPrivkey, name, accessCode);
		rooms = [...rooms, { name, accessCode, privkey: keys.privkey, pubkey: keys.pubkey }];
		const channelKey = 'room:' + name;
		if (!messagesByChannel[channelKey]) messagesByChannel[channelKey] = [];
		storeRooms(forumFingerprint, rooms.map(r => ({ name: r.name, accessCode: r.accessCode })));
	}

	function removeRoom(name: string) {
		rooms = rooms.filter(r => r.name !== name);
		const channelKey = 'room:' + name;
		delete messagesByChannel[channelKey];
		unreadChannels.delete(channelKey);
		if (activeChannelKey === channelKey) activeChannelKey = 'general';
		storeRooms(forumFingerprint, rooms.map(r => ({ name: r.name, accessCode: r.accessCode })));
	}

	function getRoomKeys() {
		return rooms.map(r => ({ name: r.name, privkey: r.privkey }));
	}

	// ─── Voice: session pubkey lookup & presence ───

	// Returns the encryption recipient pubkey for a given channel.
	// General → forum pubkey; room → room pubkey; private → peer's session pubkey.
	// Private calls require the peer's session pubkey, discovered from their sp field
	// in general messages or from their ap/p fields in voice signals.
	function getVoiceRecipientPubkey(channelKey: string): string {
		if (channelKey === 'general') return forumPubkey;
		if (channelKey.startsWith('room:')) {
			const room = rooms.find(r => r.name === channelKey.slice(5));
			return room ? room.pubkey : forumPubkey;
		}
		if (channelKey.startsWith('private:')) {
			return sessionPubkeyByAuthor.get(channelKey.slice(8)) ?? '';
		}
		return forumPubkey;
	}

	function resetPresenceTimer(channelKey: string, sp: string) {
		if (!presenceTimers.has(channelKey)) presenceTimers.set(channelKey, new Map());
		const ct = presenceTimers.get(channelKey)!;
		const existing = ct.get(sp);
		if (existing) clearTimeout(existing);
		ct.set(sp, setTimeout(() => {
			voicePresence.get(channelKey)?.delete(sp);
			voicePresence = new Map(voicePresence);
			ct.delete(sp);
		}, 90000));
	}

	function clearPresenceTimer(channelKey: string, sp: string) {
		const ct = presenceTimers.get(channelKey);
		if (!ct) return;
		const t = ct.get(sp);
		if (t) { clearTimeout(t); ct.delete(sp); }
	}

	// Central voice signal handler: updates presence state and forwards to ForumRenderer for mesh routing.
	function handleVoiceSignal(signal: VoiceSignal) {
		// WoT filtering: ignore voice signals from authors not in the trust set
		if (wotSet && signal.ap && !wotSet.has(signal.ap)) return;

		const channelKey = signal.ch;

		// Learn session pubkey mapping only from verified join signals
		if (signal.type === 'join' && signal.ap && signal.p) {
			if (verifyJoinSignature(signal)) {
				sessionPubkeyByAuthor.set(signal.ap, signal.p);
			} else {
				// Unsigned or forged join — don't trust the ap claim
				signal.ap = undefined;
			}
		}
		// Also learn from sp field in general chat messages (handled in onMessage)

		// Update voice presence for sidebar display
		if (signal.type === 'join') {
			if (!voicePresence.has(channelKey)) {
				voicePresence = new Map([...voicePresence, [channelKey, new Set()]]);
			}
			voicePresence.get(channelKey)!.add(signal.p);
			voicePresence = new Map(voicePresence);
			resetPresenceTimer(channelKey, signal.p);

			// Detect incoming private voice call
			if (channelKey.startsWith('private:') && activeVoiceChannel !== channelKey) {
				const callerAP = signal.ap || signal.p;
				// Add caller to private peers so the sidebar shows them
				if (!privatePeers.includes(callerAP) && callerAP !== sessionPubkey) {
					privatePeers = [...privatePeers, callerAP];
					if (!messagesByChannel['private:' + callerAP]) {
						messagesByChannel['private:' + callerAP] = [];
					}
				}
				// Show call indicator — expires slightly beyond the max beacon interval (40s)
				incomingCalls = new Set([...incomingCalls, callerAP]);
				setTimeout(() => {
					incomingCalls.delete(callerAP);
					incomingCalls = new Set(incomingCalls);
				}, 45000);
			}
		} else if (signal.type === 'leave') {
			voicePresence.get(channelKey)?.delete(signal.p);
			voicePresence = new Map(voicePresence);
			clearPresenceTimer(channelKey, signal.p);
			// Clear incoming call indicator if caller hung up
			if (channelKey.startsWith('private:') && signal.ap) {
				incomingCalls.delete(signal.ap);
				incomingCalls = new Set(incomingCalls);
			}
		}

		// Forward to ForumRenderer for mesh routing
		onVoiceSignal?.(signal);
	}

	function handleVoiceButtonClick() {
		if (voiceActiveForChannel) {
			onLeaveVoice?.();
		} else {
			const recipientPubkey = getVoiceRecipientPubkey(activeChannelKey);
			if (activeChannelKey.startsWith('private:') && !recipientPubkey) {
				// Can't call — haven't seen this peer's session pubkey yet
				return;
			}
			onRequestVoice?.(activeChannelKey, recipientPubkey);
		}
	}

	function acceptIncomingCall(callerAuthorPubkey: string) {
		const recipientPubkey = sessionPubkeyByAuthor.get(callerAuthorPubkey) ?? '';
		if (!recipientPubkey) return;
		incomingCalls.delete(callerAuthorPubkey);
		incomingCalls = new Set(incomingCalls);
		switchChannel('private:' + callerAuthorPubkey);
		onRequestVoice?.('private:' + callerAuthorPubkey, recipientPubkey);
	}

	// ─── Nav-level notification tracking ───
	let navNotification = $state<'private' | 'default' | null>(null);

	$effect(() => {
		if (visible && navNotification) {
			navNotification = null;
			onNotification?.(null);
		}
	});

	// ─── Message routing ───
	function onMessage(msg: DecryptedChatMessage) {
		// WoT filtering: drop messages from authors not in the trust set
		if (wotSet && !wotSet.has(msg.payload.p)) return;

		let channelKey: string;

		if (msg.channel === 'general') {
			channelKey = 'general';
			// Track session pubkeys from sp field for private voice call initiation
			if (msg.payload.sp && msg.payload.p && msg.payload.p !== sessionPubkey) {
				sessionPubkeyByAuthor.set(msg.payload.p, msg.payload.sp);
			}
		} else if (msg.channel === 'room' && msg.roomName) {
			channelKey = 'room:' + msg.roomName;
		} else if (msg.channel === 'private' && msg.peerPubkey) {
			channelKey = 'private:' + msg.peerPubkey;
			if (!privatePeers.includes(msg.peerPubkey) && msg.peerPubkey !== sessionPubkey) {
				privatePeers = [...privatePeers, msg.peerPubkey];
			}
		} else {
			return;
		}

		if (!messagesByChannel[channelKey]) messagesByChannel[channelKey] = [];
		messagesByChannel[channelKey] = [...messagesByChannel[channelKey], msg];

		if (channelKey !== activeChannelKey) {
			unreadChannels = new Set([...unreadChannels, channelKey]);
		}

		if (!visible && msg.payload.p !== sessionPubkey) {
			if (msg.channel === 'private') {
				navNotification = 'private';
				onNotification?.('private');
			} else if (navNotification !== 'private') {
				navNotification = 'default';
				onNotification?.('default');
			}
		}

		if (channelKey === activeChannelKey && visible) {
			requestAnimationFrame(() => {
				if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
			});
		}
	}

	// Auto-join once on mount
	let autoJoinDone = false;
	$effect(() => {
		if (autoJoin && !joined && !autoJoinDone) {
			autoJoinDone = true;
			joinChat();
		}
	});

	// ─── Join/Close ───
	function joinChat() {
		joined = true;
		onJoined?.();

		const stored = getStoredRooms(forumFingerprint);
		for (const r of stored) addRoom(r.name, r.accessCode);

		sub = subscribeToChatMessages(
			chatTag, relays, forumPrivkey,
			getRoomKeys,
			sessionPrivkey, sessionPubkey,
			onMessage,
			voiceEnabled ? handleVoiceSignal : undefined
		);
		lastSubChatTag = chatTag;
	}

	function closeChat() {
		if (sub) { sub.close(); sub = null; }
		lastSubChatTag = '';
		// Clean up presence timers
		for (const [, ct] of presenceTimers) {
			for (const [, t] of ct) clearTimeout(t);
		}
		presenceTimers.clear();
		joined = false;
		messagesByChannel = {};
		unreadChannels = new Set();
		rooms = [];
		privatePeers = [];
		sessionPubkeyByAuthor.clear();
		voicePresence = new Map();
		incomingCalls = new Set();
		activeChannelKey = 'general';
		onClose?.();
	}

	// Salt/forum-key change: chatTag and forumFingerprint are derived from the
	// forum privkey in ForumRenderer. If the user changes the salt after joining,
	// those props update but the subscription was captured with the old values —
	// rebuild it so incoming and outgoing chat stay on the same tag.
	$effect(() => {
		const currentTag = chatTag;
		const currentFp = forumFingerprint;
		if (!joined) return;
		if (!currentTag || currentTag === lastSubChatTag) return;

		if (sub) { sub.close(); sub = null; }
		for (const [, ct] of presenceTimers) {
			for (const [, t] of ct) clearTimeout(t);
		}
		presenceTimers.clear();
		messagesByChannel = {};
		unreadChannels = new Set();
		rooms = [];
		privatePeers = [];
		sessionPubkeyByAuthor.clear();
		voicePresence = new Map();
		incomingCalls = new Set();
		activeChannelKey = 'general';

		const stored = getStoredRooms(currentFp);
		for (const r of stored) addRoom(r.name, r.accessCode);

		sub = subscribeToChatMessages(
			currentTag, relays, forumPrivkey,
			getRoomKeys,
			sessionPrivkey, sessionPubkey,
			onMessage,
			voiceEnabled ? handleVoiceSignal : undefined
		);
		lastSubChatTag = currentTag;
	});

	// ─── Send message ───
	async function sendMessage() {
		const text = inputText.trim();
		if (!text) return;
		inputText = '';

		let nip07Sig: string | undefined;
		let wrappedContent: string | undefined;
		let timestamp: number | undefined;

		if (nip07Pubkey && window.nostr) {
			timestamp = Math.floor(Date.now() / 1000);
			wrappedContent = wrapContentForSigning(text);
			const signed = await window.nostr.signEvent({
				kind: INNER_EVENT_KIND, created_at: timestamp, content: wrappedContent, tags: []
			});
			nip07Sig = signed.sig;
		}

		if (activeChannelKey === 'general') {
			await publishChatMessage(
				text, chatTag, forumPubkey, forumPrivkey, relays,
				authorPubkey, authorPrivkey, nip07Sig, wrappedContent, timestamp,
				sessionPubkey // include sp so others can discover our session pubkey for private voice
			);
		} else if (activeChannelKey.startsWith('room:')) {
			const roomName = activeChannelKey.slice(5);
			const room = rooms.find(r => r.name === roomName);
			if (room) {
				await publishRoomChatMessage(
					text, chatTag, room.pubkey, roomName, relays,
					authorPubkey, authorPrivkey, nip07Sig, wrappedContent, timestamp
				);
			}
		} else if (activeChannelKey.startsWith('private:')) {
			const peerAuthorPubkey = activeChannelKey.slice(8);
			// Private messages must be encrypted to the peer's session pubkey (what the subscriber
			// decrypts with). For anon peers author=session so the fallback is safe; for NIP-07
			// peers we need the session pubkey discovered via sp/ap fields.
			const encryptTarget = sessionPubkeyByAuthor.get(peerAuthorPubkey) ?? peerAuthorPubkey;
			await publishPrivateChatMessage(
				text, chatTag, encryptTarget, relays,
				authorPubkey, authorPrivkey, nip07Sig, wrappedContent, timestamp
			);
			// Store sent message locally (can't decrypt our own outgoing private messages)
			const localMsg: DecryptedChatMessage = {
				eventId: 'local-' + Date.now(),
				payload: {
					v: 1, b: text, p: authorPubkey,
					ts: timestamp || Math.floor(Date.now() / 1000),
					sig: '', w: wrappedContent || ''
				},
				channel: 'private',
				peerPubkey: peerAuthorPubkey
			};
			if (!messagesByChannel[activeChannelKey]) messagesByChannel[activeChannelKey] = [];
			messagesByChannel[activeChannelKey] = [...messagesByChannel[activeChannelKey], localMsg];
			requestAnimationFrame(() => {
				if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
			});
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	// ─── Channel switching ───
	function switchChannel(key: string) {
		activeChannelKey = key;
		unreadChannels.delete(key);
		unreadChannels = new Set(unreadChannels);
		if (typeof window !== 'undefined' && window.innerWidth <= 640) sidebarOpen = false;
		requestAnimationFrame(() => {
			if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
		});
	}

	// ─── Private chat initiation ───
	function startPrivateChat(peerPubkey: string) {
		if (peerPubkey === sessionPubkey) return;
		if (!privatePeers.includes(peerPubkey)) privatePeers = [...privatePeers, peerPubkey];
		const channelKey = 'private:' + peerPubkey;
		if (!messagesByChannel[channelKey]) messagesByChannel[channelKey] = [];
		switchChannel(channelKey);
	}

	// ─── Room dialog ───
	async function handleCreateRoom(announce: boolean) {
		const name = roomNameInput.trim();
		const code = roomCodeInput.trim();
		if (!name || !code) return;
		addRoom(name, code);
		if (announce) {
			let nip07Sig: string | undefined;
			let wrappedContent: string | undefined;
			let timestamp: number | undefined;
			if (nip07Pubkey && window.nostr) {
				timestamp = Math.floor(Date.now() / 1000);
				wrappedContent = wrapContentForSigning('room');
				const signed = await window.nostr.signEvent({
					kind: INNER_EVENT_KIND, created_at: timestamp, content: wrappedContent, tags: []
				});
				nip07Sig = signed.sig;
			}
			publishRoomAnnouncement(name, code, chatTag, forumPubkey, relays, authorPubkey, authorPrivkey, nip07Sig, wrappedContent, timestamp);
		}
		switchChannel('room:' + name);
		showRoomDialog = null;
		roomNameInput = '';
		roomCodeInput = '';
	}

	function handleJoinRoom() {
		const raw = roomCodeInput.trim();
		const idx = raw.indexOf('|');
		if (idx === -1) return;
		const name = raw.slice(0, idx).trim();
		const code = raw.slice(idx + 1).trim();
		if (!name || !code) return;
		addRoom(name, code);
		switchChannel('room:' + name);
		showRoomDialog = null;
		roomCodeInput = '';
	}

	function handleJoinFromAnnouncement(name: string, code: string) {
		addRoom(name, code);
		switchChannel('room:' + name);
	}

	// ─── Helpers ───
	function formatTime(ts: number): string {
		const d = new Date(ts * 1000);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function isRoomAnnouncement(msg: DecryptedChatMessage): msg is DecryptedChatMessage & { payload: { room: { name: string; code: string } } } {
		return msg.channel === 'general' && typeof msg.payload.room === 'object' && msg.payload.room !== null && 'code' in msg.payload.room;
	}

	function isAlreadyInRoom(name: string, code: string): boolean {
		return rooms.some(r => r.name === name && r.accessCode === code);
	}

	// Voice presence count for a channel (excludes self)
	function voiceCount(channelKey: string): number {
		const s = voicePresence.get(channelKey);
		if (!s) return 0;
		// Don't count self
		let count = s.size;
		if (s.has(sessionPubkey)) count--;
		return Math.max(0, count);
	}

	$effect(() => {
		return () => {
			if (sub) { sub.close(); sub = null; }
			for (const [, ct] of presenceTimers) {
				for (const [, t] of ct) clearTimeout(t);
			}
			presenceTimers.clear();
		};
	});
</script>

<div class="chat-container">
	{#if !joined}
		<div class="chat-opt-in">
			<p>Live chat is ephemeral — messages are not stored and only visible while connected.</p>
			{#if canPost}
				<button class="chat-join-btn" onclick={joinChat}>Join Chat</button>
			{:else if onSignIn}
				<button class="chat-join-btn sign-in-btn" onclick={onSignIn}>Sign in to join chat</button>
			{/if}
		</div>
	{:else}
		<div class="chat-layout">
			<!-- Sidebar -->
			{#if sidebarOpen}
				<aside class="chat-sidebar">
					<div class="chat-sidebar-header">
						<div class="chat-add-wrapper">
							{#if canPost}
								<button class="chat-add-btn" onclick={() => { showAddMenu = !showAddMenu; }}>+ Add Chat</button>
							{:else if onSignIn}
								<button class="chat-add-btn" onclick={onSignIn}>+ Add Chat</button>
							{/if}
							{#if showAddMenu}
								<div class="chat-add-menu">
									<button onclick={() => { showRoomDialog = 'create'; showAddMenu = false; }}>Create Room</button>
									<button onclick={() => { showRoomDialog = 'join'; showAddMenu = false; }}>Join Room</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- General channel -->
					<button
						class="chat-channel-btn"
						class:active={activeChannelKey === 'general'}
						class:unread={unreadChannels.has('general')}
						onclick={() => switchChannel('general')}
					>
						General
						{#if activeVoiceChannel === 'general'}
							<span class="voice-channel-indicator in-call" title="You are in voice">
								<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/></svg>
							</span>
						{:else if voiceCount('general') > 0}
							<span class="voice-channel-indicator" title="{voiceCount('general')} in voice">
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/></svg>
								{voiceCount('general')}
							</span>
						{/if}
					</button>

					{#if rooms.length > 0}
						<div class="chat-sidebar-section">ROOMS</div>
						{#each rooms as room}
							<div class="chat-channel-row">
								<button
									class="chat-channel-btn"
									class:active={activeChannelKey === 'room:' + room.name}
									class:unread={unreadChannels.has('room:' + room.name)}
									onclick={() => switchChannel('room:' + room.name)}
								>
									{room.name}
									{#if activeVoiceChannel === 'room:' + room.name}
										<span class="voice-channel-indicator in-call" title="You are in voice">
											<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/></svg>
										</span>
									{:else if voiceCount('room:' + room.name) > 0}
										<span class="voice-channel-indicator" title="{voiceCount('room:' + room.name)} in voice">
											<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/></svg>
											{voiceCount('room:' + room.name)}
										</span>
									{/if}
								</button>
								<button class="chat-channel-remove" onclick={() => removeRoom(room.name)} title="Leave room">&times;</button>
							</div>
						{/each}
					{/if}

					{#if privatePeers.length > 0}
						<div class="chat-sidebar-section">PRIVATE</div>
						{#each privatePeers as peer}
							<div class="chat-channel-row">
								<button
									class="chat-channel-btn private"
									class:active={activeChannelKey === 'private:' + peer}
									class:unread={unreadChannels.has('private:' + peer)}
									onclick={() => switchChannel('private:' + peer)}
								>
									<AuthorIdentity pubkey={peer} {privacyMode} size={18} showNpub={false} {profileRelays} {forumCache} />
									{#if activeVoiceChannel === 'private:' + peer}
										<span class="voice-channel-indicator in-call" title="In call">
											<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/></svg>
										</span>
									{/if}
								</button>
								{#if incomingCalls.has(peer)}
									<button
										class="voice-incoming-btn"
										title="Accept incoming voice call"
										onclick={() => acceptIncomingCall(peer)}
									>
										<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 2 4.18 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.14a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z"/></svg>
									</button>
								{/if}
								<button class="chat-channel-profile-btn" onclick={() => openProfileCard(peer)} title="View profile">i</button>
							</div>
						{/each}
					{/if}
				</aside>
			{/if}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			{#if sidebarOpen}
				<div class="chat-sidebar-backdrop" onclick={() => { sidebarOpen = false; }} role="presentation"></div>
			{/if}

			<!-- Main chat area -->
			<div class="chat-main">
				<header class="chat-main-header">
					<button class="chat-sidebar-toggle" onclick={() => { sidebarOpen = !sidebarOpen; }} aria-label="Toggle channels">
						{#if sidebarOpen}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
						{/if}
					</button>
					<span class="chat-main-header-label">
						{#if activeChannelKey.startsWith('private:')}
							<button class="chat-msg-author-btn" onclick={() => openProfileCard(activeChannelKey.slice(8))}>
								<AuthorIdentity pubkey={activeChannelKey.slice(8)} {privacyMode} size={18} showNpub={false} {profileRelays} {forumCache} />
							</button>
						{:else}
							{activeChannelLabel}
						{/if}
					</span>
					{#if activeRoom}
						<button
							class="chat-room-code-btn"
							class:active={showRoomCode}
							onclick={() => { showRoomCode = !showRoomCode; roomCodeCopied = false; }}
							title="Show access code"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
						</button>
						{#if voiceEnabled}<span class="chat-header-divider">|</span>{/if}
					{/if}
					{#if voiceEnabled}
						<button
							class="chat-voice-btn"
							class:active={voiceActiveForChannel}
							disabled={voiceCallFull}
							onclick={handleVoiceButtonClick}
							title={voiceCallFull ? 'Voice call is full' : voiceActiveForChannel ? 'Leave voice' : 'Join voice'}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill={voiceActiveForChannel ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
							{#if voiceParticipantCount > 0}
								<span class="chat-voice-count">{voiceParticipantCount}</span>
							{/if}
						</button>
					{/if}
					<button class="chat-close-btn" onclick={closeChat} title="Close Chat">Close Chat</button>
				</header>

				{#if showRoomCode && activeRoom}
					<div class="chat-room-code-panel">
						<span class="chat-room-code-label">Access Code</span>
						<div class="chat-room-code-box">
							<code class="chat-room-code-value">{activeRoom.name}|{activeRoom.accessCode}</code>
							<button class="chat-room-code-copy" onclick={copyRoomCode}>
								{roomCodeCopied ? 'Copied!' : 'Copy'}
							</button>
						</div>
					</div>
				{/if}

				<div class="chat-messages" bind:this={messagesEl}>
					{#if activeMessages.length === 0}
						<div class="chat-empty">No messages yet. Say something!</div>
					{:else}
						{#each activeMessages as msg}
							{#if isRoomAnnouncement(msg)}
								<div class="chat-room-announcement">
									<div class="chat-room-announcement-label">Room Created</div>
									<div class="chat-room-announcement-name">{msg.payload.room.name}</div>
									{#if isAlreadyInRoom(msg.payload.room.name, msg.payload.room.code)}
										<span class="chat-room-joined-label">Joined</span>
									{:else}
										<button class="chat-room-join-btn" onclick={() => handleJoinFromAnnouncement(msg.payload.room.name, msg.payload.room.code)}>Join Room</button>
									{/if}
								</div>
							{:else}
								<div class="chat-msg">
									<button class="chat-msg-avatar-btn" onclick={() => openProfileCard(msg.payload.p)}>
										<AuthorIdentity pubkey={msg.payload.p} {privacyMode} size={24} showPhrase={false} showNpub={false} {profileRelays} {forumCache} />
									</button>
									<div class="chat-msg-content">
										<div class="chat-msg-header">
											<button class="chat-msg-author-btn" onclick={() => openProfileCard(msg.payload.p)}>
												<AuthorIdentity pubkey={msg.payload.p} {privacyMode} showAvatar={false} {profileRelays} {forumCache} />
											</button>
											<span class="chat-msg-time">{formatTime(msg.payload.ts)}</span>
										</div>
										<div class="chat-msg-body">{msg.payload.b}</div>
									</div>
								</div>
							{/if}
						{/each}
					{/if}
				</div>

				{#if canPost && wotBlocked}
					<div class="chat-signin-prompt">
						<div class="wot-tooltip-wrapper" data-tooltip="You are not in this forum's trust network">
							<button class="chat-send-btn" disabled>Send</button>
						</div>
					</div>
				{:else if canPost}
					<div class="chat-input-area">
						<input
							class="chat-input"
							type="text"
							bind:value={inputText}
							onkeydown={handleKeydown}
							placeholder="Type a message..."
						/>
						<button class="chat-send-btn" onclick={sendMessage}>Send</button>
					</div>
				{:else}
					<div class="chat-signin-prompt">
						{#if onSignIn}
							<button class="chat-signin-btn" onclick={onSignIn}>Sign in to send messages</button>
						{:else}
							<span>Sign in to send messages</span>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Profile card modal -->
		{#if showProfileCard}
			<div class="chat-profile-overlay" onclick={closeProfileCard} onkeydown={(e) => { if (e.key === 'Escape') closeProfileCard(); }} role="button" tabindex="-1">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="chat-profile-card" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
					<div class="chat-profile-card-top">
						{#if privacyMode === 0 && profileCardData.picture}
							<img class="chat-profile-card-photo" src={profileCardData.picture} alt="" width="56" height="56" />
						{:else if profileCardData.avatarSvg}
							<span class="chat-profile-card-avatar">{@html sanitizeSvg(profileCardData.avatarSvg)}</span>
						{/if}
						<div class="chat-profile-card-info">
							{#if privacyMode === 0 && profileCardData.name}
								<div class="chat-profile-card-name">{profileCardData.name}</div>
							{/if}
							{#if profileCardData.phrase}
								<div class="chat-profile-card-phrase">@{profileCardData.phrase}</div>
							{/if}
						</div>
					</div>

					{#if privacyMode === 0 && profileCardData.nip05}
						<div class="chat-profile-card-nip05">{profileCardData.nip05}</div>
					{/if}
					{#if privacyMode === 0 && profileCardData.about}
						<div class="chat-profile-card-about">{profileCardData.about}</div>
					{/if}

					<button class="chat-profile-card-npub" onclick={copyNpub} title="Click to copy">
						<span class="chat-profile-card-npub-text">{profileCardData.npubTruncated}</span>
						<span class="chat-profile-card-npub-action">{profileCardCopied ? 'Copied!' : 'Copy'}</span>
					</button>

					{#if profileCardCanPM}
						<button class="chat-profile-card-pm" onclick={profileCardStartPM}>Send Private Message</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Room dialog modal -->
		{#if showRoomDialog}
			<div class="chat-room-dialog-overlay" onclick={() => { showRoomDialog = null; }} onkeydown={(e) => { if (e.key === 'Escape') showRoomDialog = null; }} role="button" tabindex="-1">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="chat-room-dialog" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
					<h3>{showRoomDialog === 'create' ? 'Create Room' : 'Join Room'}</h3>
					{#if showRoomDialog === 'create'}
						<div class="form-field">
							<label for="room-name">Room Name</label>
							<input id="room-name" type="text" bind:value={roomNameInput} placeholder="e.g. Chess Club" />
						</div>
						<div class="form-field">
							<label for="room-code">Access Code</label>
							<input id="room-code" type="text" bind:value={roomCodeInput} placeholder="Shared secret" />
						</div>
					{:else}
						<div class="form-field">
							<label for="room-invite">Invite Code</label>
							<input id="room-invite" type="text" bind:value={roomCodeInput} placeholder="Paste invite code (name|code)" />
						</div>
					{/if}
					<div class="chat-room-dialog-actions">
						{#if showRoomDialog === 'create'}
							<button class="form-submit-btn" onclick={() => handleCreateRoom(false)}>Create Quietly</button>
							<button class="form-submit-btn" onclick={() => handleCreateRoom(true)}>Announce Room</button>
						{:else}
							<button class="form-submit-btn" onclick={handleJoinRoom}>Join</button>
						{/if}
						<button class="form-cancel-btn" onclick={() => { showRoomDialog = null; }}>Cancel</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.voice-channel-indicator {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-left: 4px;
		font-size: 10px;
		opacity: 0.6;
		vertical-align: middle;
	}

	.voice-channel-indicator.in-call {
		opacity: 1;
		color: #4caf50;
	}

	.voice-incoming-btn {
		background: none;
		border: none;
		padding: 2px 4px;
		cursor: pointer;
		color: #4caf50;
		animation: voice-ring 1s ease-in-out infinite;
		vertical-align: middle;
	}

	@keyframes voice-ring {
		0%, 100% { transform: rotate(0deg); }
		25% { transform: rotate(-15deg); }
		75% { transform: rotate(15deg); }
	}

	.chat-voice-count {
		font-size: 10px;
		min-width: 14px;
		height: 14px;
		line-height: 14px;
		text-align: center;
		border-radius: 7px;
		background: rgba(76, 175, 80, 0.25);
		color: #4caf50;
		font-weight: 600;
	}

	.chat-voice-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.chat-voice-btn:disabled .chat-voice-count {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
	}
</style>

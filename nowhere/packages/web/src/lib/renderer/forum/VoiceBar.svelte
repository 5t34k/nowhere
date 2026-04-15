<script lang="ts">
	import type { VoiceMesh, VoicePeer } from '$lib/renderer/nostr/voice-mesh.js';
	import { MAX_PARTICIPANTS } from '$lib/renderer/nostr/voice-mesh.js';
	import AuthorIdentity from './AuthorIdentity.svelte';

	interface Props {
		mesh: VoiceMesh;
		channelKey: string;
		privacyMode: number;
		sessionPubkey: string;
		muted: boolean;
		onToggleMute: () => void;
		onLeave: () => void;
		onAvatarClick?: (pubkey: string) => void;
		profileRelays?: string[];
	}

	let { mesh, channelKey, privacyMode, sessionPubkey, muted, onToggleMute, onLeave, onAvatarClick, profileRelays }: Props = $props();

	let peers = $state<VoicePeer[]>([]);
	let speakingMap = $state<Map<string, boolean>>(new Map());

	// audio elements kept outside DOM so they keep playing regardless of view
	const audioElements = new Map<string, HTMLAudioElement>();
	const audioContexts = new Map<string, AudioContext>();

	// Poll peer list from mesh every 500ms
	$effect(() => {
		const interval = setInterval(() => {
			if (mesh && !mesh.isDestroyed()) {
				peers = mesh.getPeers();
			}
		}, 500);
		return () => clearInterval(interval);
	});

	export function onPeerAudio(pubkey: string, stream: MediaStream) {
		// Play audio
		cleanupAudio(pubkey);
		const audio = new Audio();
		audio.srcObject = stream;
		audio.play().catch(() => {});
		audioElements.set(pubkey, audio);

		// Speaking detection via analyser
		try {
			const ctx = new AudioContext();
			const source = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			audioContexts.set(pubkey, ctx);

			const data = new Uint8Array(analyser.frequencyBinCount);
			function poll() {
				if (!audioContexts.has(pubkey)) return;
				analyser.getByteFrequencyData(data);
				const level = data.reduce((a, b) => a + b, 0) / data.length;
				speakingMap = new Map(speakingMap.set(pubkey, level > 20));
				requestAnimationFrame(poll);
			}
			poll();
		} catch {
			// AudioContext unavailable
		}
	}

	export function onPeerLeft(pubkey: string) {
		cleanupAudio(pubkey);
		speakingMap.delete(pubkey);
		speakingMap = new Map(speakingMap);
	}

	function cleanupAudio(pubkey: string) {
		const audio = audioElements.get(pubkey);
		if (audio) {
			audio.pause();
			audio.srcObject = null;
			audioElements.delete(pubkey);
		}
		const ctx = audioContexts.get(pubkey);
		if (ctx) {
			ctx.close().catch(() => {});
			audioContexts.delete(pubkey);
		}
	}

	$effect(() => {
		return () => {
			for (const [pubkey] of audioContexts) cleanupAudio(pubkey);
		};
	});

	const channelLabel = $derived.by(() => {
		if (channelKey === 'general') return 'General';
		if (channelKey.startsWith('room:')) return channelKey.slice(5);
		return null; // private — rendered as AuthorIdentity
	});

	const privatePeerPubkey = $derived(
		channelKey.startsWith('private:') ? channelKey.slice(8) : null
	);

	function peerTitle(peer: VoicePeer): string {
		if (peer.state === 'connecting') return 'Connecting…';
		if (peer.state === 'failed') return 'Connection failed';
		let s = 'Connected';
		if (peer.connectionType === 'relay') s += ' (relay)';
		else if (peer.connectionType === 'direct') s += ' (direct)';
		if (peer.muted) s += ' · muted';
		return s;
	}
</script>

<div class="voice-bar">
	<div class="voice-bar-channel">
		<svg class="voice-bar-live-dot" width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>
		{#if channelLabel}
			<span class="voice-bar-label">{channelLabel}</span>
		{:else if privatePeerPubkey}
			<AuthorIdentity pubkey={privatePeerPubkey} {privacyMode} size={16} showAvatar={false} {profileRelays} />
		{/if}
		<span class="voice-bar-count" title="{peers.length + 1} of {MAX_PARTICIPANTS} participants">{peers.length + 1}/{MAX_PARTICIPANTS}</span>
	</div>

	<div class="voice-bar-peers">
		<!-- Self -->
		<button
			class="voice-bar-peer"
			class:voice-bar-peer-muted={muted}
			onclick={() => onAvatarClick?.(sessionPubkey)}
			title="You"
		>
			<AuthorIdentity pubkey={sessionPubkey} {privacyMode} size={22} showPhrase={false} showNpub={false} />
		</button>

		<!-- Remote peers -->
		{#each peers as peer}
			<button
				class="voice-bar-peer"
				class:voice-bar-peer-speaking={speakingMap.get(peer.pubkey)}
				class:voice-bar-peer-muted={peer.muted}
				class:voice-bar-peer-failed={peer.state === 'failed'}
				onclick={() => onAvatarClick?.(peer.pubkey)}
				title={peerTitle(peer)}
			>
				<AuthorIdentity pubkey={peer.pubkey} {privacyMode} size={22} showPhrase={false} showNpub={false} />
				{#if peer.state === 'connecting'}
					<span class="voice-bar-peer-badge">…</span>
				{:else if peer.state === 'failed'}
					<span class="voice-bar-peer-badge voice-bar-peer-badge-failed">!</span>
				{:else if peer.connectionType === 'relay'}
					<span class="voice-bar-peer-badge voice-bar-peer-badge-relay">R</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="voice-bar-controls">
		<button
			class="voice-bar-btn voice-bar-mute"
			class:voice-bar-btn-active={muted}
			onclick={onToggleMute}
			title={muted ? 'Unmute' : 'Mute'}
		>
			{#if muted}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
			{:else}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
			{/if}
		</button>
		<button class="voice-bar-btn voice-bar-leave" onclick={onLeave} title="Leave call">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68a2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 2 4.18 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.31"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
			Leave
		</button>
		<span class="voice-bar-p2p" title="Voice is peer-to-peer. Your IP address is visible to other participants.">P2P</span>
	</div>
</div>

<style>
	.voice-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		background: var(--forum-voice-bar-bg, #1a1a2e);
		border-top: 1px solid var(--forum-voice-bar-border, #2a2a4a);
		color: var(--forum-voice-bar-text, #a0a0c0);
		font-size: 12px;
		flex-shrink: 0;
		position: sticky;
		bottom: 0;
		z-index: 20;
	}

	.voice-bar-channel {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 60px;
		flex-shrink: 0;
	}

	.voice-bar-live-dot {
		color: #4caf50;
		flex-shrink: 0;
		animation: voice-pulse 2s ease-in-out infinite;
	}

	@keyframes voice-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.voice-bar-label {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}

	.voice-bar-count {
		font-size: 10px;
		opacity: 0.5;
		white-space: nowrap;
	}

	.voice-bar-peers {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		flex-wrap: wrap;
	}

	.voice-bar-peer {
		position: relative;
		display: flex;
		align-items: center;
		background: none;
		border: 2px solid transparent;
		border-radius: 50%;
		padding: 1px;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.voice-bar-peer-speaking {
		border-color: #4caf50;
	}

	.voice-bar-peer-muted {
		opacity: 0.5;
	}

	.voice-bar-peer-failed {
		border-color: #ef4444;
		opacity: 0.55;
	}

	.voice-bar-peer-badge {
		position: absolute;
		bottom: -3px;
		right: -3px;
		font-size: 9px;
		line-height: 1;
		color: var(--forum-voice-bar-text, #a0a0c0);
		pointer-events: none;
	}

	.voice-bar-peer-badge-failed {
		color: #ef4444;
		font-weight: 700;
	}

	.voice-bar-peer-badge-relay {
		color: #f59e0b;
		font-weight: 600;
	}

	.voice-bar-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.voice-bar-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--forum-voice-btn-bg, rgba(255,255,255,0.08));
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 4px 8px;
		color: inherit;
		cursor: pointer;
		font-size: 12px;
		transition: background 0.15s;
	}

	.voice-bar-btn:hover {
		background: var(--forum-voice-btn-hover, rgba(255,255,255,0.14));
	}

	.voice-bar-btn-active {
		background: var(--forum-voice-btn-muted, rgba(239, 68, 68, 0.2));
		border-color: rgba(239, 68, 68, 0.4);
		color: #ef4444;
	}

	.voice-bar-leave {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.voice-bar-leave:hover {
		background: rgba(239, 68, 68, 0.25);
	}

	.voice-bar-p2p {
		font-size: 10px;
		opacity: 0.4;
		cursor: default;
		letter-spacing: 0.05em;
	}
</style>

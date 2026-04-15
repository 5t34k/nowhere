<script lang="ts">
	import type { VoiceMesh, VoicePeer } from '$lib/renderer/nostr/voice-mesh.js';
	import AuthorIdentity from './AuthorIdentity.svelte';

	interface Props {
		mesh: VoiceMesh;
		privacyMode: number;
		sessionPubkey: string;
		muted: boolean;
		onToggleMute: () => void;
		onLeave: () => void;
		onAvatarClick?: (pubkey: string) => void;
	}

	let { mesh, privacyMode, sessionPubkey, muted, onToggleMute, onLeave, onAvatarClick }: Props = $props();

	let peers = $state<VoicePeer[]>([]);
	let speakingMap = $state<Map<string, boolean>>(new Map());
	let audioContexts = new Map<string, AudioContext>();
	let animFrameId: number | null = null;

	// Poll peers from mesh
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
		const audio = new Audio();
		audio.srcObject = stream;
		audio.play().catch(() => {});

		// Monitor speaking
		cleanupAudioContext(pubkey);
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
			// AudioContext may not be available
		}
	}

	export function onPeerLeft(pubkey: string) {
		cleanupAudioContext(pubkey);
		speakingMap.delete(pubkey);
		speakingMap = new Map(speakingMap);
	}

	function cleanupAudioContext(pubkey: string) {
		const ctx = audioContexts.get(pubkey);
		if (ctx) {
			ctx.close().catch(() => {});
			audioContexts.delete(pubkey);
		}
	}

	function cleanup() {
		for (const [pubkey, ctx] of audioContexts) {
			ctx.close().catch(() => {});
		}
		audioContexts.clear();
	}

	$effect(() => {
		return () => { cleanup(); };
	});
</script>

<div class="voice-panel">
	<div class="voice-controls">
		<button
			class="voice-mic-btn"
			class:muted
			onclick={onToggleMute}
			title={muted ? 'Unmute' : 'Mute'}
		>
			{#if muted}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
			{:else}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
			{/if}
		</button>
		<button class="voice-leave-btn" onclick={onLeave}>Leave</button>
	</div>

	<div class="voice-peers">
		<!-- Self -->
		<button class="voice-peer" class:voice-peer-muted={muted} onclick={() => onAvatarClick?.(sessionPubkey)}>
			<AuthorIdentity pubkey={sessionPubkey} {privacyMode} size={24} showPhrase={false} showNpub={false} />
		</button>
		<!-- Remote peers -->
		{#each peers as peer}
			<button
				class="voice-peer"
				class:voice-peer-speaking={speakingMap.get(peer.pubkey)}
				class:voice-peer-muted={peer.muted}
				onclick={() => onAvatarClick?.(peer.pubkey)}
			>
				<AuthorIdentity pubkey={peer.pubkey} {privacyMode} size={24} showPhrase={false} showNpub={false} />
				{#if peer.state === 'connecting'}
					<span class="voice-peer-status">...</span>
				{/if}
			</button>
		{/each}
	</div>

	<span class="voice-p2p-badge" title="Voice is peer-to-peer. Your IP address is visible to other participants.">P2P</span>
</div>

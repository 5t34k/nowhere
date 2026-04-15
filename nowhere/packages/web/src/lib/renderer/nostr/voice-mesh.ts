import type { VoiceSignal } from './forum-voice.js';

// ─── ICE Server Configuration ───
// STUN servers discover public IP for direct P2P connections.
// Without a TURN server, connections between peers behind symmetric NAT will fail
// (~15% of peer combinations, common on mobile networks and corporate firewalls).
// TURN support can be added per-forum when self-hosted infrastructure is available.

const PRIMARY_ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stunserver2024.stunprotocol.org:3478' }, // independent, open-source (STUNTMAN)
	{ urls: 'stun:meet-jit-si-turnrelay.jitsi.net:443' },  // Jitsi open-source project
];

// Cloudflare STUN added as last resort if primary config produces a failed connection.
const CLOUDFLARE_ICE_SERVER: RTCIceServer = { urls: 'stun:stun.cloudflare.com:3478' };
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [...PRIMARY_ICE_SERVERS, CLOUDFLARE_ICE_SERVER];

export const MAX_PEERS = 8;
export const MAX_PARTICIPANTS = MAX_PEERS + 1; // includes self
const STALE_JOIN_SECONDS = 60;
const FAILED_TIMEOUT_MS = 10000;
const CONNECTING_GRACE_MS = 15000; // don't restart a peer that's been connecting for < this

// ─── Logging ───

function vlog(event: string, data?: Record<string, unknown>) {
	const ts = new Date().toISOString().slice(11, 23);
	const extra = data
		? ' ' + Object.entries(data).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')
		: '';
	console.log(`[Voice ${ts}] ${event}${extra}`);
}

// ─── Connection type detection ───

async function detectConnectionType(pc: RTCPeerConnection): Promise<'direct' | 'relay' | 'unknown'> {
	try {
		const stats = await pc.getStats();
		for (const report of stats.values()) {
			if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
				const local = stats.get(report.localCandidateId);
				const remote = stats.get(report.remoteCandidateId);
				const localType = local?.candidateType || '?';
				const remoteType = remote?.candidateType || '?';
				vlog('candidate-pair', { local: localType, remote: remoteType, protocol: local?.protocol });
				if (localType === 'relay' || remoteType === 'relay') return 'relay';
				return 'direct';
			}
		}
	} catch { /* stats unavailable */ }
	return 'unknown';
}

// ─── Types ───

export interface VoicePeer {
	pubkey: string;
	connection: RTCPeerConnection;
	audioStream?: MediaStream;
	muted: boolean;
	speaking: boolean;
	state: 'connecting' | 'connected' | 'failed';
	connectionType: 'direct' | 'relay' | 'unknown';
	createdAt: number;
}

export interface VoiceMeshCallbacks {
	onPeerJoined: (pubkey: string) => void;
	onPeerLeft: (pubkey: string) => void;
	onPeerAudio: (pubkey: string, stream: MediaStream) => void;
	onPeerMute: (pubkey: string, muted: boolean) => void;
	onPeerStateChange: (pubkey: string, state: VoicePeer['state']) => void;
	sendSignal: (signal: Omit<VoiceSignal, 'v' | 'voice' | 'p' | 'ch' | 'ts'>) => void;
}

export class VoiceMesh {
	private peers = new Map<string, VoicePeer>();
	private localStream: MediaStream | null = null;
	private failedTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private destroyed = false;
	private beforeUnloadHandler: (() => void) | null = null;
	private beaconTimer: ReturnType<typeof setTimeout> | null = null;

	// Tracks peers for which we have already attempted a Cloudflare fallback retry.
	// Cleared on fresh join signals and on destroy.
	private fallbackAttempted = new Set<string>();

	constructor(
		private myPubkey: string,
		private channelKey: string,
		private callbacks: VoiceMeshCallbacks
	) {}

	async start(): Promise<void> {
		vlog('start', { channel: this.channelKey, self: this.myPubkey.slice(0, 8) });
		this.localStream = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
			video: false
		});
		vlog('mic-acquired', { tracks: this.localStream.getAudioTracks().length });

		this.beforeUnloadHandler = () => { this.destroy(); };
		window.addEventListener('beforeunload', this.beforeUnloadHandler);

		this.callbacks.sendSignal({ type: 'join' });
		vlog('join-sent');
		this.scheduleBeacon();
	}

	// Randomised beacon: re-broadcasts join every 20-40s so late joiners discover the call.
	// Randomisation prevents relay observers from fingerprinting call count by beacon cadence.
	private scheduleBeacon(): void {
		const delay = 20000 + Math.random() * 20000;
		this.beaconTimer = setTimeout(() => {
			if (!this.destroyed) {
				this.callbacks.sendSignal({ type: 'join' });
				vlog('beacon-sent', { peers: this.peers.size });
				this.scheduleBeacon();
			}
		}, delay);
	}

	handleSignal(signal: VoiceSignal): void {
		if (this.destroyed) return;
		if (signal.p === this.myPubkey) return;

		const from = signal.p.slice(0, 8);
		const now = Math.floor(Date.now() / 1000);

		switch (signal.type) {
			case 'join': {
				const age = now - signal.ts;
				if (age > STALE_JOIN_SECONDS) {
					vlog('join-stale', { from, age });
					return;
				}
				if (this.peers.size >= MAX_PEERS) {
					vlog('join-rejected', { from, reason: 'max-peers' });
					return;
				}
				if (this.peers.has(signal.p)) {
					// Beacon from a peer we already know about.
					const existing = this.peers.get(signal.p)!;
					if (existing.state === 'connected') return;
					// Don't restart a peer that's actively connecting — ICE needs time.
					// Only allow restart after the grace period to handle genuinely stuck connections.
					if (existing.state === 'connecting') {
						const elapsed = Date.now() - existing.createdAt;
						if (elapsed < CONNECTING_GRACE_MS) return;
					}
					vlog('join-reconnect', { from, prevState: existing.state });
					this.removePeer(signal.p);
				}
				vlog('join-received', { from, ap: signal.ap?.slice(0, 8) });
				// Fresh join — reset fallback state so Cloudflare can be tried again if needed
				this.fallbackAttempted.delete(signal.p);
				this.createPeerAndOffer(signal.p, false);
				break;
			}

			case 'leave':
				vlog('leave-received', { from });
				this.removePeer(signal.p);
				break;

			case 'offer':
				if (signal.target !== this.myPubkey) return;
				vlog('offer-received', { from });
				if (this.peers.size >= MAX_PEERS && !this.peers.has(signal.p)) return;
				this.handleOffer(signal.p, signal.sdp!);
				break;

			case 'answer':
				if (signal.target !== this.myPubkey) return;
				vlog('answer-received', { from });
				this.handleAnswer(signal.p, signal.sdp!);
				break;

			case 'ice':
				if (signal.target !== this.myPubkey) return;
				this.handleIce(signal.p, signal.candidate!);
				break;

			case 'mute':
				this.handleMute(signal.p, signal.muted ?? false);
				break;
		}
	}

	setMuted(muted: boolean): void {
		if (this.localStream) {
			for (const track of this.localStream.getAudioTracks()) {
				track.enabled = !muted;
			}
		}
		this.callbacks.sendSignal({ type: 'mute', muted });
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		vlog('destroy', { peers: this.peers.size });

		if (this.beaconTimer) {
			clearTimeout(this.beaconTimer);
			this.beaconTimer = null;
		}

		this.callbacks.sendSignal({ type: 'leave' });

		for (const [pubkey] of this.peers) {
			this.removePeer(pubkey);
		}

		this.fallbackAttempted.clear();

		if (this.localStream) {
			for (const track of this.localStream.getTracks()) {
				track.stop();
			}
			this.localStream = null;
		}

		if (this.beforeUnloadHandler) {
			window.removeEventListener('beforeunload', this.beforeUnloadHandler);
			this.beforeUnloadHandler = null;
		}
	}

	getPeers(): VoicePeer[] {
		return Array.from(this.peers.values());
	}

	isDestroyed(): boolean {
		return this.destroyed;
	}

	// ─── Private ───

	private createConnection(peerPubkey: string, iceServers: RTCIceServer[]): RTCPeerConnection {
		const pc = new RTCPeerConnection({ iceServers });
		const tag = peerPubkey.slice(0, 8);
		const candidateTypes = new Set<string>();

		if (this.localStream) {
			for (const track of this.localStream.getTracks()) {
				pc.addTrack(track, this.localStream);
			}
		}

		pc.onicecandidate = (e) => {
			if (e.candidate) {
				const ct = e.candidate.type || 'unknown';
				if (!candidateTypes.has(ct)) {
					candidateTypes.add(ct);
					vlog('ice-local', { peer: tag, type: ct, protocol: e.candidate.protocol });
				}
				this.callbacks.sendSignal({
					type: 'ice',
					target: peerPubkey,
					candidate: JSON.stringify(e.candidate)
				});
			}
		};

		pc.onicegatheringstatechange = () => {
			vlog('ice-gathering', { peer: tag, state: pc.iceGatheringState, types: [...candidateTypes].join(',') || 'none' });
		};

		pc.oniceconnectionstatechange = () => {
			vlog('ice-state', { peer: tag, state: pc.iceConnectionState });
		};

		pc.ontrack = (e) => {
			vlog('track-received', { peer: tag });
			const stream = e.streams[0] ?? new MediaStream([e.track]);
			const peer = this.peers.get(peerPubkey);
			if (peer && peer.connection === pc) {
				peer.audioStream = stream;
				this.callbacks.onPeerAudio(peerPubkey, stream);
			}
		};

		pc.onconnectionstatechange = () => {
			const peer = this.peers.get(peerPubkey);
			// Guard against stale events from a replaced connection
			if (!peer || peer.connection !== pc) return;

			vlog('conn-state', { peer: tag, state: pc.connectionState });

			if (pc.connectionState === 'connected') {
				peer.state = 'connected';
				this.clearFailedTimer(peerPubkey);
				this.callbacks.onPeerStateChange(peerPubkey, 'connected');
				// Detect connection type asynchronously — UI updates on next poll
				detectConnectionType(pc).then(type => {
					peer.connectionType = type;
					vlog('connected', { peer: tag, via: type, candidateTypes: [...candidateTypes].join(',') });
					this.callbacks.onPeerStateChange(peerPubkey, 'connected');
				});
			} else if (pc.connectionState === 'failed') {
				vlog('conn-failed', {
					peer: tag,
					candidateTypes: [...candidateTypes].join(',') || 'none',
					fallbackTried: this.fallbackAttempted.has(peerPubkey)
				});
				// On hard failure, retry once with Cloudflare added as an additional STUN server.
				// If Cloudflare was already tried and still failed, give up and start the cleanup timer.
				if (!this.fallbackAttempted.has(peerPubkey)) {
					this.fallbackAttempted.add(peerPubkey);
					this.removePeer(peerPubkey);
					void this.createPeerAndOffer(peerPubkey, true);
				} else {
					peer.state = 'failed';
					this.callbacks.onPeerStateChange(peerPubkey, 'failed');
					this.startFailedTimer(peerPubkey);
				}
			} else if (pc.connectionState === 'disconnected') {
				vlog('conn-disconnected', { peer: tag });
				// Disconnected may be transient — start the timer but don't retry yet
				peer.state = 'failed';
				this.callbacks.onPeerStateChange(peerPubkey, 'failed');
				this.startFailedTimer(peerPubkey);
			}
		};

		return pc;
	}

	private async createPeerAndOffer(peerPubkey: string, useFallback: boolean): Promise<void> {
		const iceServers = useFallback ? FALLBACK_ICE_SERVERS : PRIMARY_ICE_SERVERS;
		const tag = peerPubkey.slice(0, 8);
		vlog('create-offer', { peer: tag, fallback: useFallback });

		const pc = this.createConnection(peerPubkey, iceServers);
		this.peers.set(peerPubkey, {
			pubkey: peerPubkey,
			connection: pc,
			muted: false,
			speaking: false,
			state: 'connecting',
			connectionType: 'unknown',
			createdAt: Date.now()
		});
		this.callbacks.onPeerJoined(peerPubkey);

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		this.callbacks.sendSignal({
			type: 'offer',
			target: peerPubkey,
			sdp: offer.sdp
		});
		vlog('offer-sent', { peer: tag });
	}

	private async handleOffer(peerPubkey: string, sdp: string): Promise<void> {
		const tag = peerPubkey.slice(0, 8);
		const existing = this.peers.get(peerPubkey);

		// Offer collision: both sides sent offers simultaneously.
		// Break the tie deterministically — higher pubkey is "impolite" and keeps its offer.
		if (existing && existing.connection.signalingState === 'have-local-offer') {
			if (this.myPubkey > peerPubkey) {
				vlog('offer-collision', { peer: tag, action: 'ignore (impolite)' });
				return;
			}
			vlog('offer-collision', { peer: tag, action: 'accept (polite)' });
		}

		// Don't replace a connection where SDP exchange completed and ICE is actively checking,
		// unless it's been stuck for too long. This prevents a thrashing loop where both sides
		// keep tearing each other down before ICE has time to finish.
		if (existing && existing.state === 'connecting' && existing.connection.signalingState === 'stable') {
			const elapsed = Date.now() - existing.createdAt;
			if (elapsed < CONNECTING_GRACE_MS) {
				vlog('offer-ignored', { peer: tag, reason: 'ice-checking', elapsed: Math.round(elapsed / 1000) });
				return;
			}
		}

		if (existing) {
			this.removePeer(peerPubkey);
		}

		vlog('handle-offer', { peer: tag });

		// Answerer always uses primary servers — if the initiator retried with Cloudflare,
		// their candidates will cover the gap; we don't need to contact Cloudflare ourselves.
		const pc = this.createConnection(peerPubkey, PRIMARY_ICE_SERVERS);
		this.peers.set(peerPubkey, {
			pubkey: peerPubkey,
			connection: pc,
			muted: false,
			speaking: false,
			state: 'connecting',
			connectionType: 'unknown',
			createdAt: Date.now()
		});
		this.callbacks.onPeerJoined(peerPubkey);

		await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);
		this.callbacks.sendSignal({
			type: 'answer',
			target: peerPubkey,
			sdp: answer.sdp
		});
		vlog('answer-sent', { peer: tag });
	}

	private async handleAnswer(peerPubkey: string, sdp: string): Promise<void> {
		const peer = this.peers.get(peerPubkey);
		if (!peer) return;
		// Ignore stale answers from a rolled-back offer collision
		if (peer.connection.signalingState !== 'have-local-offer') {
			vlog('answer-stale', { peer: peerPubkey.slice(0, 8), state: peer.connection.signalingState });
			return;
		}
		vlog('handle-answer', { peer: peerPubkey.slice(0, 8) });
		await peer.connection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
	}

	private async handleIce(peerPubkey: string, candidateJson: string): Promise<void> {
		const peer = this.peers.get(peerPubkey);
		if (!peer) return;
		try {
			const candidate = new RTCIceCandidate(JSON.parse(candidateJson));
			await peer.connection.addIceCandidate(candidate);
		} catch (e) {
			vlog('ice-add-error', { peer: peerPubkey.slice(0, 8), error: String(e) });
		}
	}

	private handleMute(peerPubkey: string, muted: boolean): void {
		const peer = this.peers.get(peerPubkey);
		if (peer) {
			peer.muted = muted;
			this.callbacks.onPeerMute(peerPubkey, muted);
		}
	}

	private removePeer(pubkey: string): void {
		const peer = this.peers.get(pubkey);
		if (peer) {
			vlog('peer-removed', { peer: pubkey.slice(0, 8), state: peer.state, via: peer.connectionType });
			peer.connection.close();
			this.peers.delete(pubkey);
			this.clearFailedTimer(pubkey);
			this.callbacks.onPeerLeft(pubkey);
		}
	}

	private startFailedTimer(pubkey: string): void {
		this.clearFailedTimer(pubkey);
		this.failedTimers.set(pubkey, setTimeout(() => {
			vlog('failed-timeout', { peer: pubkey.slice(0, 8) });
			this.removePeer(pubkey);
		}, FAILED_TIMEOUT_MS));
	}

	private clearFailedTimer(pubkey: string): void {
		const timer = this.failedTimers.get(pubkey);
		if (timer) {
			clearTimeout(timer);
			this.failedTimers.delete(pubkey);
		}
	}
}

<script lang="ts">
	declare const __BUILD_TIME__: string;

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { APP_VERSION } from '$lib/version';
	import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
	import zxingReaderWasm from 'zxing-wasm/reader/zxing_reader.wasm?url';

	// Serve WASM locally rather than from jsDelivr CDN (needed for PWA offline use)
	prepareZXingModule({
		overrides: {
			locateFile: (path: string, prefix: string) => {
				if (path.endsWith('.wasm')) return zxingReaderWasm;
				return prefix + path;
			}
		}
	});

	let themeLabel = $state('dark');
	let linkValue = $state('');
	let overlayText = $state('');
	let overlayVisible = $state(true);
	let overlayFading = $state(false);
	let view = $state<'main' | 'build' | 'manage' | 'saved'>('main');
	let direction = $state<'forward' | 'back'>('forward');

	// Saved sites — persisted list of nowhere links the user wants to keep handy
	interface SavedSite { id: string; nickname: string; url: string; }
	const SAVED_KEY = 'nowhere-saved-sites';
	let savedSites = $state<SavedSite[]>([]);
	let showAddForm = $state(false);
	let newNickname = $state('');
	let newUrl = $state('');
	let addError = $state(false);
	let confirmingDeleteId = $state<string | null>(null);
	let nicknameInputEl = $state<HTMLInputElement | null>(null);
	let urlInputEl = $state<HTMLInputElement | null>(null);

	// Drag-to-reorder (pointer based, works on touch + mouse)
	let listEl = $state<HTMLUListElement | null>(null);
	let dragId = $state<string | null>(null);
	let dragOrigIndex = $state(-1);
	let dragTarget = $state(-1);
	let dragDy = $state(0);
	let draggedHeight = $state(0);
	let dragGrabY = 0;
	let dragSnapshot: { top: number; height: number }[] = [];
	let scanning = $state(false);
	let cameraError = $state<'permission' | 'unsupported' | null>(null);

	let instanceHost = $state<string | null>(null);
	let versionVisible = $state(false);
	let npubCopied = $state(false);
	let toggleCount = 0;
	let toggleResetTimer: ReturnType<typeof setTimeout> | null = null;

	let fileInputEl = $state<HTMLInputElement | null>(null);
	let imageScanError = $state<string | null>(null);
	let imageScanErrorTimer: ReturnType<typeof setTimeout> | null = null;
	let scanTipVisible = $state(false);

	let videoEl = $state<HTMLVideoElement | null>(null);

	// BarcodeDetector native path (Android Chrome, desktop Chrome/Edge)
	let nativeStream: MediaStream | null = null;
	let nativeBD: any = null;
	let rafId: number | null = null;
	let detecting = false;
	let lastScanTime = 0;
	let scanCanvas: HTMLCanvasElement | null = null;

	const buildTypes = [
		{ label: 'Forum',      href: '/create/forum' },
		{ label: 'Event',      href: '/create/event' },
		{ label: 'Fundraiser', href: '/create/fundraiser' },
		// { label: 'Store',      href: '/create/store' },   // store de-listed (demote-store)
		{ label: 'Petition',   href: '/create/petition' },
		{ label: 'Message',    href: '/create/message' },
		{ label: 'Drop',       href: '/create/drop' },
		{ label: 'Art',        href: '/create/art' },
	];

	// Extract a nowhere fragment from a raw QR string.
	// Accepts any domain — only cares about the /s path and hash.
	function extractNowhereFragment(raw: string): string | null {
		try {
			const url = new URL(raw);
			const path = url.pathname.replace(/\/$/, ''); // normalise trailing slash
			if (path !== '/s') return null;
			if (!url.hash || url.hash.length <= 1) return null;
			return url.hash;
		} catch {
			return null;
		}
	}

	async function hasBarcodeDetector(): Promise<boolean> {
		const BD = (window as any).BarcodeDetector;
		if (!BD) return false;
		try {
			const formats: string[] = await BD.getSupportedFormats();
			return formats.includes('qr_code');
		} catch {
			return false;
		}
	}

	// Native scan loop — runs when BarcodeDetector is available.
	// Passes the full video frame directly; no downscaling.
	async function scanLoop() {
		if (!scanning) return;

		if (videoEl && videoEl.readyState >= 2 && !detecting) {
			const now = performance.now();
			if (now - lastScanTime >= 40) { // ~25 fps
				lastScanTime = now;
				detecting = true;
				try {
					const results: { rawValue: string }[] = await nativeBD.detect(videoEl);
					if (scanning) {
						for (const result of results) {
							const fragment = extractNowhereFragment(result.rawValue);
							if (fragment) {
								stopCamera();
								scanning = false;
								navigator.vibrate?.(50);
								goto('/s' + fragment);
								detecting = false;
								return;
							}
						}
					}
				} catch { /* ignore per-frame detection errors */ }
				detecting = false;
			}
		}

		if (scanning) {
			rafId = requestAnimationFrame(scanLoop);
		}
	}

	async function startNativeScan() {
		if (!videoEl) return;
		try {
			nativeStream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: 'environment' },
					width:  { ideal: 1920, min: 640 },
					height: { ideal: 1080, min: 480 },
				}
			});
			videoEl.srcObject = nativeStream;
			await videoEl.play();
			nativeBD = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
			detecting = false;
			lastScanTime = 0;
			rafId = requestAnimationFrame(scanLoop);
		} catch {
			cameraError = 'permission';
		}
	}

	// zxing-wasm fallback path (iOS / Safari / Firefox)
	// Captures video frames to a canvas and decodes with ZXing-C++ WASM.
	async function startZxingFallback() {
		if (!videoEl) return;
		try {
			nativeStream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: 'environment' },
					width:  { ideal: 1920, min: 640 },
					height: { ideal: 1080, min: 480 },
				}
			});
			videoEl.srcObject = nativeStream;
			await videoEl.play();
			detecting = false;
			lastScanTime = 0;
			rafId = requestAnimationFrame(zxingLoop);
		} catch {
			cameraError = 'permission';
		}
	}

	async function zxingLoop() {
		if (!scanning) return;

		if (videoEl && videoEl.readyState >= 2 && !detecting) {
			const now = performance.now();
			if (now - lastScanTime >= 50) { // ~20fps
				lastScanTime = now;
				detecting = true;
				try {
					const w = videoEl.videoWidth;
					const h = videoEl.videoHeight;
					if (w && h) {
						if (!scanCanvas) scanCanvas = document.createElement('canvas');
						if (scanCanvas.width !== w || scanCanvas.height !== h) {
							scanCanvas.width = w;
							scanCanvas.height = h;
						}
						const ctx = scanCanvas.getContext('2d');
						if (ctx) {
							ctx.drawImage(videoEl, 0, 0, w, h);
							const imageData = ctx.getImageData(0, 0, w, h);
							const results = await readBarcodes(imageData, {
								tryHarder: false,
								formats: ['QRCode'],
							});
							if (scanning) {
								for (const result of results) {
									const fragment = extractNowhereFragment(result.text);
									if (fragment) {
										stopCamera();
										scanning = false;
										navigator.vibrate?.(50);
										goto('/s' + fragment);
										detecting = false;
										return;
									}
								}
							}
						}
					}
				} catch { /* ignore per-frame errors */ }
				detecting = false;
			}
		}

		if (scanning) {
			rafId = requestAnimationFrame(zxingLoop);
		}
	}

	async function startCamera() {
		if (!videoEl) return;
		cameraError = null;
		if (await hasBarcodeDetector()) {
			await startNativeScan();
		} else {
			await startZxingFallback();
		}
	}

	function stopCamera() {
		if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
		detecting = false;
		if (nativeStream) { nativeStream.getTracks().forEach(t => t.stop()); nativeStream = null; }
		nativeBD = null;
		scanCanvas = null;
		cameraError = null;
	}

	async function scanFromImage(file: File) {
		imageScanError = null;

		// On Android/desktop: try BarcodeDetector on the image first — native ML Kit quality
		if (await hasBarcodeDetector()) {
			try {
				const BD = (window as any).BarcodeDetector;
				const bd = new BD({ formats: ['qr_code'] });
				const bitmap = await createImageBitmap(file);
				const results: { rawValue: string }[] = await bd.detect(bitmap);
				bitmap.close();
				for (const r of results) {
					const fragment = extractNowhereFragment(r.rawValue);
					if (fragment) {
						stopCamera(); scanning = false;
						navigator.vibrate?.(50);
						goto('/s' + fragment);
						return;
					}
				}
			} catch { /* fall through to JS decoder */ }
		}

		// zxing-wasm with tryHarder — passes the file directly, ZXing-C++ handles
		// decoding at full image resolution with its most thorough detection pass.
		try {
			const results = await readBarcodes(file, {
				tryHarder: true,
				formats: ['QRCode'],
			});
			for (const result of results) {
				const fragment = extractNowhereFragment(result.text);
				if (fragment) {
					stopCamera();
					scanning = false;
					navigator.vibrate?.(50);
					goto('/s' + fragment);
					return;
				}
			}
			showImageScanError('No QR code found in that image');
		} catch {
			showImageScanError('No QR code found in that image');
		}
	}

	function showImageScanError(msg: string) {
		imageScanError = msg;
		if (imageScanErrorTimer) clearTimeout(imageScanErrorTimer);
		imageScanErrorTimer = setTimeout(() => { imageScanError = null; }, 3500);
	}

	// React to scanning state — start/stop camera
	$effect(() => {
		if (scanning) {
			startCamera();
		} else {
			stopCamera();
		}
	});

	// Show tip after a few seconds of scanning
	$effect(() => {
		if (scanning) {
			const timer = setTimeout(() => { scanTipVisible = true; }, 4500);
			return () => {
				clearTimeout(timer);
				scanTipVisible = false;
			};
		}
		scanTipVisible = false;
	});

	function openLink() {
		const val = linkValue.trim();
		if (!val) return;
		try {
			const url = new URL(val);
			goto('/s' + url.hash);
		} catch {
			const frag = val.startsWith('#') ? val : '#' + val;
			goto('/s' + frag);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') openLink();
	}

	// --- Saved sites ---

	function loadSavedSites() {
		try {
			const raw = localStorage.getItem(SAVED_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				savedSites = parsed.filter(
					(s): s is SavedSite =>
						s && typeof s.id === 'string' && typeof s.url === 'string' && typeof s.nickname === 'string'
				);
			}
		} catch { /* corrupt or unavailable storage — start empty */ }
	}

	function persistSavedSites() {
		try {
			localStorage.setItem(SAVED_KEY, JSON.stringify(savedSites));
		} catch { /* storage full or unavailable — keep in-memory copy */ }
	}

	function newId(): string {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	}

	function toggleAddForm() {
		showAddForm = !showAddForm;
		addError = false;
		if (!showAddForm) { newNickname = ''; newUrl = ''; }
	}

	function addSavedSite() {
		const url = newUrl.trim();
		if (!url) { addError = true; urlInputEl?.focus(); return; }
		const nickname = newNickname.trim();
		savedSites = [...savedSites, { id: newId(), nickname, url }];
		persistSavedSites();
		newNickname = '';
		newUrl = '';
		addError = false;
		showAddForm = false;
	}

	function addFormKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') addSavedSite();
		else if (e.key === 'Escape') toggleAddForm();
	}

	function removeSavedSite(id: string) {
		savedSites = savedSites.filter((s) => s.id !== id);
		persistSavedSites();
		confirmingDeleteId = null;
	}

	// Turn a stored link into the same /s#… navigation the manual input uses.
	function launchSavedSite(site: SavedSite) {
		const val = site.url.trim();
		if (!val) return;
		try {
			const url = new URL(val);
			goto('/s' + url.hash);
		} catch {
			const frag = val.startsWith('#') ? val : '#' + val;
			goto('/s' + frag);
		}
	}

	// Compact, readable form of a stored URL for the list's secondary line.
	function displayUrl(raw: string): string {
		let s = raw.trim();
		try {
			const u = new URL(s);
			s = u.host + u.pathname.replace(/\/$/, '') + u.hash;
		} catch { /* not a full URL — show as entered */ }
		return s.length > 40 ? s.slice(0, 39) + '…' : s;
	}

	// Snapshot each row's position so we can compute reorder targets during a drag.
	function snapshotRows(): { top: number; height: number }[] {
		if (!listEl) return [];
		return Array.from(listEl.querySelectorAll<HTMLElement>('.saved-item')).map((el) => {
			const r = el.getBoundingClientRect();
			return { top: r.top, height: r.height };
		});
	}

	// Visual transform for row `i` while a drag is in progress.
	function itemTransform(i: number): string {
		if (dragId === null) return '';
		if (i === dragOrigIndex) return `translateY(${dragDy}px)`;
		if (dragTarget > dragOrigIndex && i > dragOrigIndex && i <= dragTarget) return `translateY(${-draggedHeight}px)`;
		if (dragTarget < dragOrigIndex && i >= dragTarget && i < dragOrigIndex) return `translateY(${draggedHeight}px)`;
		return '';
	}

	function onDragPointerDown(e: PointerEvent, index: number) {
		if (savedSites.length < 2) return;
		e.preventDefault();
		dragSnapshot = snapshotRows();
		if (!dragSnapshot[index]) return;
		dragOrigIndex = index;
		dragTarget = index;
		draggedHeight = dragSnapshot[index].height;
		dragGrabY = e.clientY;
		dragDy = 0;
		dragId = savedSites[index].id;
		confirmingDeleteId = null;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDragPointerMove(e: PointerEvent) {
		if (dragId === null) return;
		dragDy = e.clientY - dragGrabY;
		const draggedCenter = dragSnapshot[dragOrigIndex].top + dragDy + draggedHeight / 2;
		let target = dragOrigIndex;
		if (dragDy > 0) {
			for (let i = dragOrigIndex + 1; i < dragSnapshot.length; i++) {
				if (draggedCenter > dragSnapshot[i].top + dragSnapshot[i].height / 2) target = i;
				else break;
			}
		} else if (dragDy < 0) {
			for (let i = dragOrigIndex - 1; i >= 0; i--) {
				if (draggedCenter < dragSnapshot[i].top + dragSnapshot[i].height / 2) target = i;
				else break;
			}
		}
		dragTarget = target;
	}

	function endDrag() {
		if (dragId === null) return;
		const from = dragOrigIndex;
		const to = dragTarget;
		if (to >= 0 && to !== from) {
			const arr = [...savedSites];
			const [moved] = arr.splice(from, 1);
			arr.splice(to, 0, moved);
			savedSites = arr;
			persistSavedSites();
		}
		dragId = null;
		dragOrigIndex = -1;
		dragTarget = -1;
		dragDy = 0;
		draggedHeight = 0;
	}

	// Keyboard reorder — ArrowUp / ArrowDown on a focused handle.
	function moveItem(index: number, dir: -1 | 1) {
		const to = index + dir;
		if (to < 0 || to >= savedSites.length) return;
		const arr = [...savedSites];
		const [moved] = arr.splice(index, 1);
		arr.splice(to, 0, moved);
		savedSites = arr;
		persistSavedSites();
	}

	function dragHandleKeydown(e: KeyboardEvent, index: number) {
		if (e.key === 'ArrowUp') { e.preventDefault(); moveItem(index, -1); }
		else if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(index, 1); }
	}

	// Reset transient saved-panel state whenever we leave it.
	$effect(() => {
		if (view !== 'saved') {
			showAddForm = false;
			confirmingDeleteId = null;
			newNickname = '';
			newUrl = '';
			addError = false;
			dragId = null;
			dragOrigIndex = -1;
			dragTarget = -1;
			dragDy = 0;
		}
	});

	// Focus the nickname field when the add form opens.
	$effect(() => {
		if (showAddForm) nicknameInputEl?.focus();
	});

	function dismissOverlay() {
		overlayFading = true;
		setTimeout(() => { overlayVisible = false; }, 400);
	}

	onMount(() => {
		const host = window.location.hostname;
		const parts = host.split('.');
		const base = parts.length >= 2 && !/^\d+$/.test(parts[0]) ? parts.slice(-2).join('.') : host;
		if (base !== 'nowhr.xyz') instanceHost = base;

		const html = document.documentElement;

		/* Mark this page as the app scope so its CSS can override any site renderer
		   stylesheets that stay loaded after a /s visit. Store/event/fundraiser/etc.
		   pages import store.css, which contains `!important` background rules on
		   `html` and `html body`. Those sheets persist for the rest of the SPA
		   session, so /app's own rules must outspecify them or they would repaint
		   the body white after the first visit to a site page. */
		html.dataset.scope = 'app';

		/* Restore persisted theme preference — in case /s (or a hard PWA reload)
		   left dataset.theme in a different state. Falls back to OS preference. */
		const saved = localStorage.getItem('nowhere-theme');
		if (saved === 'light' || saved === 'dark') html.dataset.theme = saved;

		loadSavedSites();

		function isDark() {
			return html.dataset.theme === 'dark' ||
				(!html.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
		}
		themeLabel = isDark() ? 'light' : 'dark';

		function toggle() {
			const next = isDark() ? 'light' : 'dark';
			html.dataset.theme = next;
			localStorage.setItem('nowhere-theme', next);
			themeLabel = isDark() ? 'light' : 'dark';
			// Easter egg: tap toggle 7 times quickly
			toggleCount++;
			if (toggleResetTimer) clearTimeout(toggleResetTimer);
			if (toggleCount >= 7) {
				toggleCount = 0;
				versionVisible = true;
			} else {
				toggleResetTimer = setTimeout(() => { toggleCount = 0; }, 2000);
			}
		}
		const btn = document.getElementById('theme-toggle');
		btn?.addEventListener('click', toggle);

		// Placeholder decode animation
		const target = 'nowhr.xyz/s#…';
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
		const anchored = new Set(['/', '.', '#', '…', ':']);
		const duration = 1400;
		const windowSize = 4;
		function rand() { return chars[Math.floor(Math.random() * chars.length)]; }
		const initChars = Array.from(target, (c) => anchored.has(c) ? c : rand());
		overlayText = initChars.join('');

		const start = performance.now();
		const timer = setInterval(() => {
			const elapsed = performance.now() - start;
			const waveFront = (elapsed / duration) * target.length;
			let out = '';
			for (let i = 0; i < target.length; i++) {
				if (anchored.has(target[i])) { out += target[i]; continue; }
				if (i < waveFront) out += target[i];
				else if (i < waveFront + windowSize) out += rand();
				else out += initChars[i];
			}
			overlayText = out;
			if (elapsed >= duration) {
				clearInterval(timer);
				overlayText = target;
				setTimeout(() => {
					overlayFading = true;
					setTimeout(() => { overlayVisible = false; }, 400);
				}, 600);
			}
		}, 67);

		function handleEscape(e: KeyboardEvent) {
			if (e.key === 'Escape' && scanning) scanning = false;
		}
		window.addEventListener('keydown', handleEscape);

		return () => {
			clearInterval(timer);
			stopCamera();
			btn?.removeEventListener('click', toggle);
			window.removeEventListener('keydown', handleEscape);
			if (toggleResetTimer) clearTimeout(toggleResetTimer);
			if (imageScanErrorTimer) clearTimeout(imageScanErrorTimer);
			if (html.dataset.scope === 'app') delete html.dataset.scope;
		};
	});
</script>

<svelte:head>
	<title>nowhere</title>
	<meta name="description" content="Nowhere encodes an entire website into a URL. The site lives in the link itself and is never stored on a server. Open the app to create, scan, and view them.">
	<meta property="og:title" content="nowhere">
	<meta property="og:description" content="Nowhere encodes an entire website into a URL. The site lives in the link itself and is never stored on a server. Open the app to create, scan, and view them.">
	<meta property="og:image" content="https://nowhr.xyz/og.png">
	<meta property="og:type" content="website">
	<meta name="twitter:card" content="summary">
</svelte:head>

<nav class="nav">
	{#if view !== 'main'}
		<button class="nav-back" onclick={() => { direction = 'back'; view = 'main'; }}><span class="arr-left">←</span> back</button>
	{:else}
		<a href="https://hostednowhere.com" class="nav-mark">nowhere</a>
	{/if}
	<div class="nav-right">
		{#if view !== 'saved'}
			<button class="nav-link" onclick={() => { direction = 'forward'; view = 'saved'; }}>saved sites</button>
		{/if}
		{#if view !== 'manage'}
			<button class="nav-link" onclick={() => { direction = 'forward'; view = 'manage'; }}>manage</button>
		{/if}
	</div>
</nav>

<button class="theme-corner" id="theme-toggle" title="Toggle theme">{themeLabel}</button>

<main class="main" class:scanning>

	<!-- CONTENT AREA -->
	<div class="content-area">

		<!-- MAIN PANEL -->
		<div class="panel panel-main" class:gone={view !== 'main'} class:returning={direction === 'back'} aria-hidden={view !== 'main'}>
			<div class="composition">
				<div class="wordmark">nowhere</div>

				<div class="input-wrap">
					{#if overlayVisible}
						<span class="input-overlay" class:fading={overlayFading} aria-hidden="true">{overlayText}</span>
					{/if}
					<input
						class="link-input"
						type="url"
						inputmode="url"
						enterkeyhint="go"
						autocomplete="off"
						autocorrect="off"
						spellcheck="false"
						placeholder="nowhr.xyz/s#…"
						bind:value={linkValue}
						onkeydown={handleKeydown}
						onfocus={dismissOverlay}
					/>
					{#if linkValue}
						<button
							class="input-clear"
							onclick={() => { linkValue = ''; }}
							aria-label="Clear"
							tabindex="-1"
						>×</button>
					{/if}
				</div>

				<div class="actions">
					<button class="action scan-action" onclick={() => scanning = !scanning}>
						{#if scanning}↓ Close scanner{:else}↑ Scan a code{/if}
					</button>
					<button class="action" onclick={() => { direction = 'forward'; view = 'build'; }}>
						Build something <span class="arr">→</span>
					</button>
				</div>
			</div>
		</div>

		<!-- BUILD PANEL -->
		<div class="panel panel-build" class:visible={view === 'build'} aria-hidden={view !== 'build'}>
			<div class="composition">
				<nav class="build-list">
					{#each buildTypes as type, i}
						<a
							href={type.href}
							class="build-item"
							style="--i: {i}"
							tabindex={view === 'build' ? 0 : -1}
						>{type.label}</a>
					{/each}
				</nav>
			</div>
		</div>

		<!-- MANAGE PANEL -->
		<div class="panel panel-manage" class:visible={view === 'manage'} aria-hidden={view !== 'manage'}>
			<div class="composition">
				<h2 class="manage-heading">Managing requires a desktop browser.</h2>
				<p class="manage-body">
					Nowhere uses Nostr keys to authenticate site owners.
					On desktop, a browser extension handles this securely.
				</p>
				<a href="https://hostednowhere.com/manage" class="manage-link">
					Go to hostednowhere.com/manage <span class="arr">→</span>
				</a>
			</div>
		</div>

		<!-- SAVED PANEL -->
		<div class="panel panel-saved" class:visible={view === 'saved'} aria-hidden={view !== 'saved'}>
			<div class="composition saved-composition">
				<div class="saved-head">
					<h2 class="saved-heading">saved sites</h2>
					<button
						class="saved-add"
						onclick={toggleAddForm}
						aria-label={showAddForm ? 'Cancel adding a site' : 'Add a site'}
						aria-expanded={showAddForm}
						tabindex={view === 'saved' ? 0 : -1}
					>{showAddForm ? '×' : '+'}</button>
				</div>

				{#if showAddForm}
					<div class="saved-form">
						<input
							class="saved-input"
							type="text"
							placeholder="nickname"
							autocomplete="off"
							autocorrect="off"
							spellcheck="false"
							bind:this={nicknameInputEl}
							bind:value={newNickname}
							onkeydown={addFormKeydown}
						/>
						<input
							class="saved-input"
							class:error={addError && !newUrl.trim()}
							type="url"
							inputmode="url"
							enterkeyhint="done"
							placeholder="nowhr.xyz/s#…"
							autocomplete="off"
							autocorrect="off"
							spellcheck="false"
							bind:this={urlInputEl}
							bind:value={newUrl}
							onkeydown={addFormKeydown}
						/>
						<button class="saved-save" onclick={addSavedSite}>save</button>
					</div>
				{/if}

				<div class="saved-scroll">
				{#if savedSites.length === 0}
					<p class="saved-empty">No saved sites yet. Tap <span class="saved-empty-plus">+</span> to add one.</p>
				{:else}
					<ul class="saved-list" bind:this={listEl}>
						{#each savedSites as site, i (site.id)}
							<li class="saved-item" class:dragging={site.id === dragId} style:transform={itemTransform(i)}>
								{#if confirmingDeleteId === site.id}
									<div class="saved-confirm">
										<span class="saved-confirm-text">Remove {site.nickname || displayUrl(site.url)}?</span>
										<button class="saved-confirm-yes" onclick={() => removeSavedSite(site.id)}>remove</button>
										<button class="saved-confirm-no" onclick={() => confirmingDeleteId = null}>cancel</button>
									</div>
								{:else}
									{#if savedSites.length > 1}
										<button
											class="saved-handle"
											aria-label="Reorder {site.nickname || 'site'} (use arrow keys)"
											tabindex={view === 'saved' ? 0 : -1}
											onpointerdown={(e) => onDragPointerDown(e, i)}
											onpointermove={onDragPointerMove}
											onpointerup={endDrag}
											onpointercancel={endDrag}
											onkeydown={(e) => dragHandleKeydown(e, i)}
										>
											<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
												<circle cx="9" cy="6" r="1.3" /><circle cx="15" cy="6" r="1.3" />
												<circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" />
												<circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="18" r="1.3" />
											</svg>
										</button>
									{/if}
									<button
										class="saved-launch"
										onclick={() => launchSavedSite(site)}
										tabindex={view === 'saved' ? 0 : -1}
									>
										<span class="saved-name">{site.nickname || displayUrl(site.url)}</span>
										{#if site.nickname}<span class="saved-url">{displayUrl(site.url)}</span>{/if}
									</button>
									<button
										class="saved-trash"
										onclick={() => confirmingDeleteId = site.id}
										aria-label="Delete {site.nickname || 'site'}"
										tabindex={view === 'saved' ? 0 : -1}
									>
										<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<path d="M4 7h16" />
											<path d="M10 4h4M10 11v6M14 11v6" />
											<path d="M6 7l1 13h10l1-13" />
										</svg>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				</div>
			</div>
		</div>

	</div>

	<!-- CAMERA AREA -->
	<input
		type="file"
		accept="image/*"
		bind:this={fileInputEl}
		onchange={(e) => {
			const file = (e.currentTarget as HTMLInputElement).files?.[0];
			if (file) scanFromImage(file);
			(e.currentTarget as HTMLInputElement).value = '';
		}}
		style="display:none"
	/>
	<div class="camera-area">
		<div class="camera-inner">
			<button class="camera-close" onclick={() => scanning = false}>↓</button>
			<video
				bind:this={videoEl}
				class="camera-video"
				muted
				playsinline
				autoplay
			></video>

			{#if cameraError === 'permission'}
				<div class="camera-message">
					<p>Camera access denied.</p>
					<p>Allow camera access in your browser settings and try again.</p>
				</div>
			{:else if cameraError === 'unsupported'}
				<div class="camera-message">
					<p>QR scanning is not supported in this browser.</p>
					<p>Paste a nowhere link above instead.</p>
				</div>
			{:else}
				<div class="reticle">
					<div class="reticle-corner tl"></div>
					<div class="reticle-corner tr"></div>
					<div class="reticle-corner bl"></div>
					<div class="reticle-corner br"></div>
				</div>
			{/if}

			<div class="camera-bottom">
				{#if scanTipVisible}
					<div class="scan-tip">Having trouble? Take a clear photo with your camera app, then tap the button below.</div>
				{/if}
				{#if imageScanError}
					<div class="scan-error">{imageScanError}</div>
				{/if}
				<button class="image-scan-btn" onclick={() => { scanTipVisible = false; fileInputEl?.click(); }}>
					Scan QR from image
				</button>
			</div>
		</div>
	</div>

</main>

{#if versionVisible}
	<div class="version-backdrop" onclick={() => versionVisible = false}>
		<div class="version-card" onclick={(e) => e.stopPropagation()}>
			<div class="version-label">Built by 5t34k</div>
			<div class="version-time">{APP_VERSION}</div>
			<div class="version-time">{__BUILD_TIME__.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</div>
			<button class="version-npub" onclick={() => { navigator.clipboard.writeText('npub1x5t34kxd79m657qcuwp4zrypy9t8t4e6yks5zapjvau29t0xvgaqakh2p2'); npubCopied = true; setTimeout(() => { npubCopied = false; }, 1200); }} title="Tap to copy">{npubCopied ? 'copied' : 'npub1x5t34kxd79m657qcuwp4zrypy9t8t4e6yks5zapjvau29t0xvgaqakh2p2'}</button>
		</div>
	</div>
{/if}

<footer class="footer" class:hidden={scanning || view === 'saved'}>
	<span>Hosted <a href="https://hostednowhere.com" class="footer-link">nowhere</a>. Present everywhere.</span>
	{#if instanceHost}
		<span>nowhere via <a href="https://{instanceHost}" class="footer-host">{instanceHost}</a></span>
	{/if}
</footer>

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

	.arr { position: relative; top: -0.1em; }
	.arr-left { position: relative; top: -0.05em; }

	:global(:root) {
		--bg:       #fafaf8;
		--ink:      #1a1a1a;
		--ink-60:   rgba(26,26,26,0.60);
		--ink-35:   rgba(26,26,26,0.35);
		--ink-15:   rgba(26,26,26,0.09);
		--nav-bg:   rgba(250,250,248,0.92);
		--camera-h: 68vh;

		--font:   -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--serif:  Georgia, 'Times New Roman', Times, serif;
		--mono:   ui-monospace, 'SF Mono', 'Cascadia Code', 'Courier New', monospace;
	}

	:global(html[data-scope="app"][data-theme="dark"]) {
		--bg:     #0d0d0d;
		--ink:    #e8e8e8;
		--ink-60: rgba(232,232,232,0.60);
		--ink-35: rgba(232,232,232,0.35);
		--ink-15: rgba(232,232,232,0.10);
		--nav-bg: rgba(13,13,13,0.92);
	}

	@media (prefers-color-scheme: dark) {
		:global(html[data-scope="app"]:not([data-theme="light"])) {
			--bg:     #0d0d0d;
			--ink:    #e8e8e8;
			--ink-60: rgba(232,232,232,0.60);
			--ink-35: rgba(232,232,232,0.35);
			--ink-15: rgba(232,232,232,0.10);
			--nav-bg: rgba(13,13,13,0.92);
		}
	}

	/* Defend background/color against site renderer stylesheets (store.css etc.)
	   that stay bundle-loaded after /s visits. store.css paints `html[data-theme="dark"]`
	   and `html body` with !important; matching those with `html[data-scope="app"]...`
	   prefixes raises specificity one attribute, guaranteeing /app wins regardless of
	   CSS source order. */
	:global(html[data-scope="app"][data-theme="dark"]),
	:global(html[data-scope="app"][data-theme="light"]),
	:global(html[data-scope="app"]:not([data-theme])) {
		background: var(--bg) !important;
	}
	:global(html[data-scope="app"]) { color-scheme: light; }
	:global(html[data-scope="app"][data-theme="dark"]) { color-scheme: dark; }
	@media (prefers-color-scheme: dark) {
		:global(html[data-scope="app"]:not([data-theme="light"])) { color-scheme: dark; }
	}
	:global(html[data-scope="app"] body),
	:global(html[data-scope="app"][data-theme="dark"] body),
	:global(html[data-scope="app"][data-theme="light"] body) {
		font-family: var(--font);
		background: var(--bg) !important;
		color: var(--ink) !important;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		transition: background 0.2s, color 0.2s;
	}

	/* NAV */
	.nav {
		position: fixed;
		top: 0; left: 0; right: 0;
		z-index: 10;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.5rem;
		background: var(--nav-bg);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--ink-15);
	}

	.nav-mark {
		font-size: 0.875rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--ink-35);
	}

	.nav-back {
		font-family: var(--font);
		font-size: 0.75rem;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.nav-back:hover { color: var(--ink); }

	.nav-link {
		font-family: var(--font);
		font-size: 0.75rem;
		color: var(--ink-35);
		text-decoration: none;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.nav-link:hover { color: var(--ink); }

	.theme-corner {
		position: fixed;
		top: 56px; right: 1.75rem;
		z-index: 9;
		font-family: var(--font);
		font-size: 0.6875rem;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.theme-corner:hover { color: var(--ink); }

	/* MAIN */
	.main {
		position: fixed;
		top: 44px; left: 0; right: 0; bottom: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* CONTENT AREA */
	.content-area {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	.panel {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1.75rem;
	}

	.composition {
		width: 100%;
		max-width: 560px;
	}

	/* MAIN PANEL */
	.panel-main { pointer-events: auto; }
	.panel-main.gone { pointer-events: none; }

	.panel-main:not(.returning) .wordmark {
		transition: transform 0.6s cubic-bezier(0.4, 0, 1, 0.6), opacity 0.45s ease 0.02s;
	}
	.panel-main:not(.returning) .input-wrap {
		transition: transform 0.68s cubic-bezier(0.3, 0, 0.8, 0.5) 0.05s, opacity 0.5s ease 0.05s;
	}
	.panel-main:not(.returning) .actions {
		transition: transform 0.5s cubic-bezier(0.4, 0, 1, 0.6), opacity 0.35s ease 0.1s;
	}

	.panel-main.returning .wordmark {
		transition: transform 0.22s cubic-bezier(0.2, 0, 0.4, 1), opacity 0.18s ease;
	}
	.panel-main.returning .input-wrap {
		transition: transform 0.26s cubic-bezier(0.2, 0, 0.4, 1) 0.03s, opacity 0.2s ease 0.03s;
	}
	.panel-main.returning .actions {
		transition: transform 0.22s cubic-bezier(0.2, 0, 0.4, 1) 0.06s, opacity 0.18s ease 0.06s;
	}

	.panel-main.gone .wordmark   { transform: translateX(-110px); opacity: 0; }
	.panel-main.gone .input-wrap { transform: translateX(-65px);  opacity: 0; }
	.panel-main.gone .actions    { transform: translateX(-28px);  opacity: 0; }

	/* BUILD PANEL */
	.panel-build { pointer-events: none; }
	.panel-build.visible { pointer-events: auto; }

	.build-list {
		display: flex;
		flex-direction: column;
		gap: clamp(1.25rem, 3vh, 2rem);
	}

	.build-item {
		display: block;
		font-size: clamp(2rem, 7vw, 3.25rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink-35);
		text-decoration: none;
		opacity: 0;
		transform: translateX(70px);
		transition:
			transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) calc(var(--i) * 55ms),
			opacity   0.35s ease                           calc(var(--i) * 55ms + 20ms);
	}

	.panel-build.visible .build-item { opacity: 1; transform: translateX(0); }
	.build-item:hover { color: var(--ink); }

	.panel-build:not(.visible) .build-item {
		transition:
			transform 0.3s cubic-bezier(0.4, 0, 1, 0.6) calc((5 - var(--i)) * 30ms),
			opacity   0.2s ease                          calc((5 - var(--i)) * 30ms);
	}

	/* WORDMARK */
	.wordmark {
		font-size: clamp(3rem, 10vw, 5rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
		margin-bottom: clamp(2rem, 5vh, 3.5rem);
	}

	/* INPUT */
	.input-wrap { position: relative; }

	.link-input {
		width: 100%;
		font-family: var(--mono);
		font-size: clamp(1rem, 3vw, 1.375rem);
		color: var(--ink);
		background: none;
		border: none;
		border-bottom: 1px solid var(--ink-35);
		outline: none;
		padding: 0.375rem 1.75rem 0.75rem 0;
		letter-spacing: 0.01em;
		transition: border-color 0.2s;
	}

	.link-input::placeholder { color: var(--ink-35); }
	.link-input:focus { border-bottom-color: var(--ink); }

	.input-overlay {
		position: absolute;
		top: 0.375rem;
		left: 0;
		font-family: var(--mono);
		font-size: clamp(1rem, 3vw, 1.375rem);
		color: var(--ink-35);
		letter-spacing: 0.01em;
		pointer-events: none;
		white-space: nowrap;
		overflow: hidden;
		max-width: 100%;
		opacity: 1;
		transition: opacity 0.4s ease;
	}

	.input-overlay.fading { opacity: 0; }

	.input-clear {
		position: absolute;
		right: 0;
		top: 0.375rem;
		bottom: 0.75rem;
		display: flex;
		align-items: center;
		font-family: var(--font);
		font-size: 1rem;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0 0 0 0.5rem;
		cursor: pointer;
		line-height: 1;
		transition: color 0.15s;
	}

	.input-clear:hover { color: var(--ink); }

	/* ACTIONS */
	.actions {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: clamp(2rem, 5vh, 3.5rem);
	}

	.action {
		font-family: var(--serif);
		font-size: clamp(1rem, 2.5vw, 1.125rem);
		color: var(--ink-60);
		background: none;
		border: none;
		padding: 0;
		text-decoration: none;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.action:hover { color: var(--ink); }

	@media (min-width: 768px) {
		.actions {
			transition: opacity 0.2s ease, transform 0.25s ease;
		}
		.main.scanning .actions {
			opacity: 0;
			transform: translateY(8px);
			pointer-events: none;
		}
	}

	/* CAMERA AREA */
	.camera-area {
		height: 0;
		flex-shrink: 0;
		overflow: hidden;
		transition: height 0.52s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.main.scanning .camera-area {
		height: var(--camera-h);
	}

	.camera-inner {
		height: var(--camera-h);
		background: #0a0a0a;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.camera-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Reticle — four corner marks only */
	.reticle {
		position: relative;
		z-index: 1;
		width: min(55vw, 220px);
		height: min(55vw, 220px);
		pointer-events: none;
	}

	.reticle-corner {
		position: absolute;
		width: 22px;
		height: 22px;
	}

	.reticle-corner.tl { top: 0;    left: 0;  border-top: 1px solid rgba(255,255,255,0.5); border-left:   1px solid rgba(255,255,255,0.5); }
	.reticle-corner.tr { top: 0;    right: 0; border-top: 1px solid rgba(255,255,255,0.5); border-right:  1px solid rgba(255,255,255,0.5); }
	.reticle-corner.bl { bottom: 0; left: 0;  border-bottom: 1px solid rgba(255,255,255,0.5); border-left:  1px solid rgba(255,255,255,0.5); }
	.reticle-corner.br { bottom: 0; right: 0; border-bottom: 1px solid rgba(255,255,255,0.5); border-right: 1px solid rgba(255,255,255,0.5); }

	/* Desktop close button */
	.camera-close {
		display: none;
	}

	@media (min-width: 768px) {
		.camera-close {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 0.75rem;
			left: 50%;
			transform: translateX(-50%);
			z-index: 3;
			font-size: 1.25rem;
			line-height: 1;
			color: rgba(255,255,255,0.45);
			background: none;
			border: none;
			cursor: pointer;
			transition: color 0.15s;
		}
		.camera-close:hover { color: rgba(255,255,255,0.9); }
	}

	/* Image scan bottom bar */
	.camera-bottom {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 1rem 1rem;
		gap: 0.5rem;
	}

	.image-scan-btn {
		font-family: var(--font);
		font-size: 0.6875rem;
		color: rgba(255,255,255,0.7);
		background: rgba(0,0,0,0.45);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 20px;
		padding: 0.35rem 1rem;
		cursor: pointer;
		letter-spacing: 0.03em;
		transition: color 0.15s, background 0.15s, border-color 0.15s;
	}

	.image-scan-btn:hover {
		color: rgba(255,255,255,0.9);
		background: rgba(0,0,0,0.6);
		border-color: rgba(255,255,255,0.2);
	}

	.scan-tip {
		font-family: var(--serif);
		font-size: 0.75rem;
		color: rgba(255,255,255,0.4);
		text-align: center;
		line-height: 1.45;
		max-width: 240px;
		animation: fade-up 0.4s ease;
	}

	.scan-error {
		font-family: var(--serif);
		font-size: 0.75rem;
		color: rgba(255,160,160,0.7);
		text-align: center;
		animation: fade-up 0.3s ease;
	}

	@keyframes fade-up {
		from { opacity: 0; transform: translateY(5px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	/* Camera error messages */
	.camera-message {
		position: relative;
		z-index: 1;
		text-align: center;
		padding: 0 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.camera-message p {
		font-family: var(--serif);
		font-size: 0.875rem;
		color: rgba(255,255,255,0.4);
		line-height: 1.5;
	}

	.camera-message p:first-child {
		color: rgba(255,255,255,0.65);
		font-size: 0.9375rem;
	}

	/* FOOTER */
	.footer {
		position: fixed;
		bottom: 0; left: 0; right: 0;
		padding: 1.5rem 1.75rem;
		font-family: var(--serif);
		font-size: 0.8125rem;
		color: var(--ink-35);
		text-align: center;
		transition: opacity 0.3s ease;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.footer.hidden { opacity: 0; pointer-events: none; }

	.footer-link {
		color: var(--ink);
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.footer-link:hover { opacity: 0.6; }

	.footer-host {
		color: var(--ink-35);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s;
	}

	.footer-host:hover { color: var(--ink-60); }

	/* MANAGE PANEL */
	.panel-manage { pointer-events: none; }
	.panel-manage.visible { pointer-events: auto; }

	.panel-manage .manage-heading,
	.panel-manage .manage-body,
	.panel-manage .manage-link {
		opacity: 0;
		transform: translateX(70px);
	}

	.panel-manage.visible .manage-heading {
		opacity: 1;
		transform: translateX(0);
		transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 0.35s ease 220ms;
	}

	.panel-manage.visible .manage-body {
		opacity: 1;
		transform: translateX(0);
		transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) 255ms, opacity 0.35s ease 275ms;
	}

	.panel-manage.visible .manage-link {
		opacity: 1;
		transform: translateX(0);
		transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) 310ms, opacity 0.35s ease 330ms;
	}

	.manage-heading {
		font-size: clamp(1.5rem, 5vw, 2.25rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.15;
		color: var(--ink);
		margin-bottom: clamp(1rem, 2.5vh, 1.5rem);
	}

	.manage-body {
		font-family: var(--serif);
		font-size: clamp(0.9rem, 2.5vw, 1.0625rem);
		color: var(--ink-60);
		line-height: 1.6;
		margin-bottom: clamp(1.25rem, 3vh, 2rem);
	}

	.manage-link {
		font-family: var(--serif);
		font-size: clamp(0.9rem, 2.5vw, 1.0625rem);
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.manage-link:hover { color: var(--ink); }

	/* NAV RIGHT GROUP */
	.nav-right {
		display: flex;
		align-items: center;
		gap: clamp(0.9rem, 4vw, 1.5rem);
	}

	/* SAVED PANEL */
	.panel-saved {
		pointer-events: none;
		align-items: stretch;
		overflow: hidden;
	}
	.panel-saved.visible { pointer-events: auto; }

	.saved-composition {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding-top: clamp(1.5rem, 6vh, 3.5rem);
	}

	/* heading + add controls stay fixed; only this region scrolls */
	.saved-scroll {
		flex: 1;
		min-height: 0;
		overflow: hidden auto;
		-webkit-overflow-scrolling: touch;
		padding-bottom: clamp(2rem, 6vh, 3.5rem);
	}

	/* entrance — mirrors the manage panel's staggered slide-in */
	.panel-saved .saved-head,
	.panel-saved .saved-empty,
	.panel-saved .saved-list {
		opacity: 0;
		transform: translateX(70px);
	}
	.panel-saved.visible .saved-head {
		opacity: 1;
		transform: translateX(0);
		transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 0.35s ease 220ms;
	}
	.panel-saved.visible .saved-empty,
	.panel-saved.visible .saved-list {
		opacity: 1;
		transform: translateX(0);
		transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) 255ms, opacity 0.35s ease 275ms;
	}

	.saved-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: clamp(1.25rem, 3vh, 1.75rem);
	}

	.saved-heading {
		font-size: clamp(1.5rem, 5vw, 2rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
	}

	.saved-add {
		font-family: var(--font);
		font-size: 1.5rem;
		line-height: 1;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0.25rem 0.4rem;
		margin: -0.25rem -0.4rem;
		cursor: pointer;
		transition: color 0.15s;
	}
	.saved-add:hover { color: var(--ink); }

	.saved-form {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin-bottom: clamp(1.5rem, 3.5vh, 2rem);
		animation: saved-form-in 0.3s ease;
	}

	@keyframes saved-form-in {
		from { opacity: 0; transform: translateY(-5px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.saved-input {
		width: 100%;
		font-family: var(--font);
		font-size: 1rem;
		color: var(--ink);
		background: none;
		border: none;
		border-bottom: 1px solid var(--ink-35);
		outline: none;
		padding: 0.25rem 0 0.55rem;
		letter-spacing: 0.01em;
		transition: border-color 0.2s;
	}
	.saved-input[type="url"] { font-family: var(--mono); }
	.saved-input::placeholder { color: var(--ink-35); }
	.saved-input:focus { border-bottom-color: var(--ink); }
	.saved-input.error { border-bottom-color: rgba(200, 80, 80, 0.7); }

	.saved-save {
		align-self: flex-end;
		font-family: var(--serif);
		font-size: clamp(1rem, 2.5vw, 1.125rem);
		color: var(--ink-60);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}
	.saved-save:hover { color: var(--ink); }

	.saved-empty {
		font-family: var(--serif);
		font-size: clamp(0.9rem, 2.5vw, 1.0625rem);
		color: var(--ink-35);
		line-height: 1.6;
	}
	.saved-empty-plus { font-family: var(--font); color: var(--ink-60); }

	.saved-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--ink-15);
	}

	.saved-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 1px solid var(--ink-15);
		transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1);
	}

	/* the row being dragged tracks the finger directly and floats above the rest */
	.saved-item.dragging {
		transition: none;
		position: relative;
		z-index: 5;
		background: var(--bg);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	}

	.saved-handle {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 40px;
		margin-left: -0.45rem;
		color: var(--ink-35);
		background: none;
		border: none;
		padding: 0;
		cursor: grab;
		touch-action: none;
		transition: color 0.15s;
	}
	.saved-handle:hover { color: var(--ink-60); }
	.saved-item.dragging .saved-handle { cursor: grabbing; color: var(--ink); }

	.saved-launch {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		align-items: flex-start;
		text-align: left;
		background: none;
		border: none;
		padding: 0.9rem 0;
		cursor: pointer;
	}

	.saved-name {
		max-width: 100%;
		font-family: var(--font);
		font-size: 1rem;
		color: var(--ink);
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color 0.15s;
	}
	.saved-launch:hover .saved-name { color: var(--ink-60); }

	.saved-url {
		max-width: 100%;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-35);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.saved-trash {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		margin-right: -0.5rem;
		color: var(--ink-35);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.saved-trash:hover { color: var(--ink); }

	.saved-confirm {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		padding: 0.9rem 0;
	}

	.saved-confirm-text {
		flex: 1;
		min-width: 0;
		font-family: var(--serif);
		font-size: 0.9375rem;
		color: var(--ink-60);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.saved-confirm-yes,
	.saved-confirm-no {
		flex-shrink: 0;
		font-family: var(--font);
		font-size: 0.8125rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}
	.saved-confirm-yes { color: rgba(200, 80, 80, 0.85); }
	.saved-confirm-yes:hover { color: rgb(200, 70, 70); }
	.saved-confirm-no { color: var(--ink-35); }
	.saved-confirm-no:hover { color: var(--ink); }

	/* Version easter egg */
	.version-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
	}

	.version-card {
		background: var(--bg);
		border: 1px solid var(--ink-15);
		border-radius: 8px;
		padding: 1.25rem 2rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.version-label {
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-35);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.version-time {
		font-family: var(--mono);
		font-size: 0.875rem;
		color: var(--ink);
	}

	.version-npub {
		font-family: var(--mono);
		font-size: 0.625rem;
		line-height: 1.4;
		color: var(--ink-60);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		word-break: break-all;
		text-align: center;
		margin-top: 0.25rem;
		width: 18rem;
		max-width: 100%;
		min-height: 2.8em;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.version-npub:hover { color: var(--ink); }
</style>

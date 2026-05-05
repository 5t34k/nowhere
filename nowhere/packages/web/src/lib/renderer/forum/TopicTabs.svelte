<script lang="ts">
	import IdentitySelector from './IdentitySelector.svelte';

	interface Props {
		topics: string[];
		activeTopic: string;
		currentView: string;
		onSelectTopic: (topic: string) => void;
		onSelectView: (view: string) => void;
		identityMode: number;
		privacyMode: number;
		authorPubkey: string;
		nip07Pubkey: string;
		canPost: boolean;
		connectError: string;
		onConnectNip07: () => void;
		onDisconnectNip07: () => void;
		onStartAnon: () => void;
		identityOpen?: boolean;
		chatNotification?: 'private' | 'default' | null;
		postNotification?: boolean;
		topicUnreadCounts?: Record<string, number>;
		torrentEnabled?: boolean;
	}

	let {
		topics, activeTopic, currentView, onSelectTopic, onSelectView,
		identityMode, privacyMode, authorPubkey, nip07Pubkey, canPost, connectError,
		onConnectNip07, onDisconnectNip07, onStartAnon, identityOpen = $bindable(false),
		chatNotification = null, postNotification = false, topicUnreadCounts = {},
		torrentEnabled = false
	}: Props = $props();

	const isPostsView = $derived(currentView === 'posts' || currentView === 'post-detail');

	// All topics: '' (General) + custom topics
	const allTopics = $derived(['' as string, ...topics]);

	// Overflow detection — imperative DOM manipulation to avoid reactive loops
	let topicsContainer: HTMLDivElement | undefined = $state();
	let moreEl: HTMLDivElement | undefined = $state();
	let measureSpan: HTMLSpanElement | undefined = $state();
	let hiddenTopicSet = $state(new Set<number>());
	let moreOpen = $state(false);

	function getMaxMoreWidth(): number {
		if (!measureSpan) return 120;
		// Find the longest topic name that could appear in the More button
		let longest = 'General';
		for (const t of topics) {
			if (t.length > longest.length) longest = t;
		}
		measureSpan.textContent = `More: ${longest} \u25BE`;
		const width = measureSpan.getBoundingClientRect().width;
		// Add padding (16px each side) matching .forum-nav-tab
		return width + 32;
	}

	function checkOverflow() {
		if (!topicsContainer) return;

		const buttons: HTMLElement[] = [];
		for (const child of topicsContainer.children) {
			buttons.push(child as HTMLElement);
		}

		// First: show all buttons, hide More to measure true layout
		for (const btn of buttons) btn.style.display = '';
		if (moreEl) moreEl.style.display = 'none';

		const containerRight = topicsContainer.getBoundingClientRect().right;
		const newHidden = new Set<number>();

		// Check if any button extends past the container
		let hasAnyOverflow = false;
		for (let i = 0; i < buttons.length; i++) {
			if (buttons[i].getBoundingClientRect().right > containerRight + 1) {
				hasAnyOverflow = true;
				break;
			}
		}

		if (hasAnyOverflow && moreEl) {
			// Reserve space for worst-case More button width
			const moreReserved = getMaxMoreWidth();
			const cutoff = containerRight - moreReserved;

			moreEl.style.display = '';

			for (let i = 0; i < buttons.length; i++) {
				if (buttons[i].getBoundingClientRect().right > cutoff + 1) {
					newHidden.add(i);
					buttons[i].style.display = 'none';
				}
			}
		}

		// If nothing ended up hidden, hide the More button
		if (newHidden.size === 0 && moreEl) {
			moreEl.style.display = 'none';
		}

		hiddenTopicSet = newHidden;
	}

	$effect(() => {
		topics;
		queueMicrotask(checkOverflow);
	});

	$effect(() => {
		if (!topicsContainer) return;
		const ro = new ResizeObserver(checkOverflow);
		ro.observe(topicsContainer);
		return () => ro.disconnect();
	});

	const hiddenTopics = $derived(
		allTopics.filter((_, i) => hiddenTopicSet.has(i))
	);
	const hasOverflow = $derived(hiddenTopicSet.size > 0);

	const hiddenUnread = $derived(
		hiddenTopics.reduce((sum, t) => sum + (topicUnreadCounts[t] ?? 0), 0)
	);

	const activeInHidden = $derived(hasOverflow && hiddenTopics.includes(activeTopic));

	const moreLabel = $derived(
		activeInHidden ? `More: ${topicLabel(activeTopic)}` : 'More'
	);

	function topicLabel(topic: string) {
		return topic === '' ? 'General' : topic;
	}

	function selectTopic(topic: string) {
		onSelectTopic(topic);
		onSelectView('posts');
	}

	function selectFromMore(topic: string) {
		moreOpen = false;
		selectTopic(topic);
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.more-dropdown-wrapper')) {
			moreOpen = false;
		}
	}

	$effect(() => {
		if (moreOpen) {
			document.addEventListener('click', handleClickOutside, true);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});
</script>

<!-- Hidden span for measuring worst-case More button width -->
<span class="more-measure" bind:this={measureSpan} aria-hidden="true"></span>

<nav class="forum-nav">
	<div class="forum-nav-inner">
		<div class="forum-nav-topics-area">
			<div class="forum-nav-topics" bind:this={topicsContainer}>
				{#each allTopics as topic, i}
					<button
						class="forum-nav-tab"
						class:active={activeTopic === topic && isPostsView && !activeInHidden}
						onclick={() => selectTopic(topic)}
					>
						{topicLabel(topic)}
						{#if (topicUnreadCounts[topic] ?? 0) > 0 && activeTopic !== topic}
							<span class="topic-unread-count">{topicUnreadCounts[topic]}</span>
						{/if}
					</button>
				{/each}
			</div>
			<div class="more-dropdown-wrapper" bind:this={moreEl} style="display: none;">
			<button
				class="forum-nav-tab more-tab"
				class:active={activeInHidden && isPostsView}
				onclick={() => { moreOpen = !moreOpen; }}
			>
				<span class="more-tab-label">{moreLabel}</span>
				{#if hiddenUnread > 0 && !activeInHidden}
					<span class="topic-unread-count">{hiddenUnread}</span>
				{/if}
				<span class="more-chevron" class:open={moreOpen}>&#9662;</span>
			</button>
			{#if moreOpen}
				<div class="more-dropdown">
					{#each hiddenTopics as topic}
						<button
							class="more-dropdown-item"
							class:active={activeTopic === topic && isPostsView}
							onclick={() => selectFromMore(topic)}
						>
							{topicLabel(topic)}
							{#if (topicUnreadCounts[topic] ?? 0) > 0 && activeTopic !== topic}
								<span class="topic-unread-count">{topicUnreadCounts[topic]}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		</div>

		<div class="forum-nav-right">
			<div class="forum-nav-views">
				<button
					class="forum-nav-tab posts-tab"
					class:active={isPostsView}
					onclick={() => onSelectView('posts')}
				>
					Posts
					{#if postNotification && !isPostsView}
						<span class="posts-nav-dot"></span>
					{/if}
				</button>
				{#if torrentEnabled}
					<button
						class="forum-nav-tab torrents-tab"
						class:active={currentView === 'torrents' || currentView === 'torrent-detail'}
						onclick={() => onSelectView('torrents')}
					>
						Torrents
					</button>
				{/if}
				<button
					class="forum-nav-tab chat-tab"
					class:active={currentView === 'chat'}
					onclick={() => onSelectView('chat')}
				>
					Chat
					{#if chatNotification && currentView !== 'chat'}
						<span class="chat-nav-dot" class:private={chatNotification === 'private'}></span>
					{/if}
				</button>
			</div>
			<IdentitySelector
				{identityMode}
				{privacyMode}
				{authorPubkey}
				{nip07Pubkey}
				{canPost}
				{connectError}
				{onConnectNip07}
				{onDisconnectNip07}
				{onStartAnon}
				bind:open={identityOpen}
			/>
		</div>
	</div>
</nav>

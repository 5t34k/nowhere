<script lang="ts">
	let { highlightManage = false } = $props();

	const tools = [
		{ name: 'Forum',      href: 'https://hostednowhere.com/forum' },
		{ name: 'Event',      href: 'https://hostednowhere.com/event' },
		{ name: 'Fundraiser', href: 'https://hostednowhere.com/fundraiser' },
		{ name: 'Store',      href: 'https://hostednowhere.com/store' },
		{ name: 'Petition',   href: 'https://hostednowhere.com/petition' },
		{ name: 'Message',    href: 'https://hostednowhere.com/message' },
		{ name: 'Drop',       href: 'https://hostednowhere.com/drop' },
		{ name: 'Art',        href: 'https://hostednowhere.com/art' },
	];

	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	function rand() { return chars[Math.floor(Math.random() * chars.length)]; }

	let toolsOpen    = $state(false);
	let displayNames = $state(tools.map(t => t.name));
	let timer: ReturnType<typeof setInterval> | null = null;

	function runDecode() {
		if (timer) clearInterval(timer);
		const names      = tools.map(t => t.name);
		const total      = names.reduce((a, n) => a + n.length, 0);
		const duration   = 600;
		const windowSize = 3;
		displayNames = names.map(name => name.split('').map(() => rand()).join(''));
		const start = performance.now();
		timer = setInterval(() => {
			const elapsed   = performance.now() - start;
			const waveFront = (elapsed / duration) * total;
			let offset = 0;
			displayNames = names.map(name => {
				let out = '';
				for (let i = 0; i < name.length; i++) {
					const gi = offset + i;
					if      (gi < waveFront)              out += name[i];
					else if (gi < waveFront + windowSize) out += rand();
					else                                  out += rand();
				}
				offset += name.length;
				return out;
			});
			if (elapsed >= duration) {
				clearInterval(timer!);
				timer = null;
				displayNames = names;
			}
		}, 16);
	}

	function toggle() { toolsOpen = !toolsOpen; if (toolsOpen) runDecode(); }
	function close()  { if (timer) { clearInterval(timer); timer = null; } toolsOpen = false; }
</script>

{#if toolsOpen}
	<div class="backdrop" onclick={close}></div>
{/if}

<nav class="nav">
	<a href="https://hostednowhere.com" class="nav-mark">nowhere</a>
	<div class="nav-links">
		<div class="nav-dropdown">
			<button class="nav-link nav-dropdown-btn" class:active={toolsOpen} onclick={toggle}>tools</button>
			{#if toolsOpen}
				<div class="nav-dropdown-list">
					{#each tools as tool, i}
						<a href={tool.href} class="nav-dropdown-item" onclick={close}>{displayNames[i]}</a>
					{/each}
				</div>
			{/if}
		</div>
		<a href="https://nowhr.xyz" class="nav-link">app</a>
		<a href="https://hostednowhere.com/manage" class="nav-link" class:nav-link-active={highlightManage}>manage</a>
		<a href="https://hostednowhere.com/#create" class="nav-link nav-link-create">create →</a>
	</div>
</nav>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 98;
	}

	.nav {
		position: fixed;
		top: 0; left: 0; right: 0;
		z-index: 100;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--col);
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
		text-decoration: none;
	}

	.nav-mark:hover { color: var(--ink); }

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.75rem;
	}

	.nav-link {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: color 0.15s;
	}

	.nav-link:hover { color: var(--ink); }

	.nav-link-active { color: var(--ink); }

	.nav-link-create { color: var(--ink-60); }

	.nav-dropdown { position: relative; }

	.nav-dropdown-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: var(--font);
	}

	.nav-dropdown-btn.active { color: var(--ink); }

	.nav-dropdown-list {
		position: absolute;
		top: calc(100% + 1rem);
		left: 0;
		z-index: 101;
		background: var(--nav-bg);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		padding: 0.75rem 0;
	}

	.nav-dropdown-item {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--ink-35);
		text-decoration: none;
		letter-spacing: 0.01em;
		padding: 0.35rem 0;
		transition: color 0.15s;
		white-space: nowrap;
		font-family: var(--mono);
	}

	.nav-dropdown-item:hover { color: var(--ink); }
</style>

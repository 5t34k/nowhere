<script lang="ts">
	declare const __BUILD_TIME__: string;
	import VersionPage from '$lib/pages/VersionPage.svelte';
</script>

<VersionPage buildTime={__BUILD_TIME__} />

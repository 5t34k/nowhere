<script lang="ts">
	import type { DecryptedReply } from '$lib/renderer/nostr/forum-events.js';

	interface Props {
		postSizeLimit: number;
		publishing: boolean;
		quotedReply?: DecryptedReply | null;
		onSubmit: (body: string, quotedId?: string) => void;
		onClearQuote?: () => void;
	}

	let { postSizeLimit, publishing, quotedReply = null, onSubmit, onClearQuote }: Props = $props();

	let body = $state('');

	const canSubmit = $derived(body.trim().length > 0 && body.length <= postSizeLimit && !publishing);
</script>

<div class="create-form">
	{#if quotedReply}
		<div class="reply-quote-preview">
			<div class="reply-quote-preview-header">
				<span class="reply-quote-preview-label">Replying to:</span>
				<button class="reply-quote-clear" onclick={onClearQuote} aria-label="Clear quote">✕</button>
			</div>
			<div class="reply-quote-preview-text">{quotedReply.payload.b}</div>
		</div>
	{/if}
	<div class="form-field">
		<label for="reply-body">Reply</label>
		<textarea
			id="reply-body"
			bind:value={body}
			placeholder="Write a reply..."
			rows="3"
		></textarea>
	</div>

	<div class="form-actions">
		<button class="form-submit-btn" disabled={!canSubmit} onclick={() => { onSubmit(body.trim(), quotedReply?.eventId); body = ''; }}>
			{publishing ? 'Posting...' : 'Reply'}
		</button>
		<span class="form-char-count" class:over={body.length > postSizeLimit}>
			{body.length}/{postSizeLimit}
		</span>
	</div>
</div>

<script lang="ts">
	interface Props {
		postSizeLimit: number;
		publishing: boolean;
		onSubmit: (title: string, body: string, link: string) => void;
		onCancel: () => void;
	}

	let { postSizeLimit, publishing, onSubmit, onCancel }: Props = $props();

	let title = $state('');
	let body = $state('');
	let link = $state('');

	const totalLength = $derived(title.length + body.length);
	const canSubmit = $derived(title.trim().length > 0 && totalLength <= postSizeLimit && !publishing);
</script>

<div class="create-form">
	<h4>New Post</h4>

	<div class="form-field">
		<label for="post-title">Title *</label>
		<input
			id="post-title"
			type="text"
			bind:value={title}
			placeholder="Post title"
		/>
	</div>

	<div class="form-field">
		<label for="post-link">Link <span style="opacity:0.5">(optional)</span></label>
		<input
			id="post-link"
			type="url"
			bind:value={link}
			placeholder="https://..."
		/>
	</div>

	<div class="form-field">
		<label for="post-body">Body</label>
		<textarea
			id="post-body"
			bind:value={body}
			placeholder="What's on your mind?"
			rows="4"
		></textarea>
	</div>

	<div class="form-actions">
		<div>
			<button class="form-submit-btn" disabled={!canSubmit} onclick={() => onSubmit(title.trim(), body.trim(), link.trim())}>
				{publishing ? 'Publishing...' : 'Post'}
			</button>
			<button class="form-cancel-btn" onclick={onCancel}>Cancel</button>
		</div>
		<span class="form-char-count" class:over={totalLength > postSizeLimit}>
			{totalLength}/{postSizeLimit}
		</span>
	</div>
</div>

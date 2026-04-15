<script lang="ts">
	interface Props {
		name: string;
		description: string;
		onUpdate: (field: string, value: unknown) => void;
	}

	let { name, description, onUpdate }: Props = $props();
</script>

<div class="panel">
	<h3>Content</h3>

	<section class="field-group">
		<label for="drop-title">
			Title
		</label>
		<input
			id="drop-title"
			type="text"
			value={name}
			onchange={(e) => onUpdate('name', e.currentTarget.value)}
			placeholder="Untitled drop"
		/>
	</section>

	<section class="field-group">
		<label for="drop-body">Drop <span class="required">*</span></label>
		<textarea
			id="drop-body"
			value={description}
			onchange={(e) => onUpdate('description', e.currentTarget.value)}
			placeholder="Paste your text here..."
			rows="16"
		></textarea>
	</section>
</div>

<style>
	.required {
		color: var(--color-danger, #dc2626);
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h3 {
		font-size: var(--text-lg);
		font-weight: 600;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-group label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.field-group input,
	.field-group textarea {
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-family: inherit;
	}

	.field-group input:focus,
	.field-group textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	textarea {
		resize: vertical;
		min-height: 240px;
		line-height: 1.6;
		font-family: var(--font-mono);
	}
</style>

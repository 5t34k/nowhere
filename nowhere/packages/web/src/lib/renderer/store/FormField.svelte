<script lang="ts">
	interface Props {
		label: string;
		name: string;
		type?: string;
		required?: boolean;
		value: string;
		placeholder?: string;
		options?: string[];
		onchange: (value: string) => void;
	}

	let { label, name, type = 'text', required = false, value, placeholder = '', options, onchange }: Props = $props();
</script>

<div class="field">
	<label for={name}>
		{label}{#if required}<span class="required">*</span>{/if}
	</label>
	{#if options}
		<select id={name} {name} {required} value={value} onchange={(e) => onchange(e.currentTarget.value)}>
			<option value="">Select...</option>
			{#each options as opt}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{:else if type === 'textarea'}
		<textarea id={name} {name} {required} {placeholder} value={value}
			oninput={(e) => onchange(e.currentTarget.value)} rows="3"></textarea>
	{:else}
		<input id={name} {name} {type} {required} {placeholder} {value}
			oninput={(e) => onchange(e.currentTarget.value)} />
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	label {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.required {
		color: var(--color-error);
		margin-left: 2px;
	}

	input, select, textarea {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		background: var(--color-bg);
		transition: border-color var(--transition-fast);
	}

	input:focus, select:focus, textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	textarea {
		resize: vertical;
	}
</style>

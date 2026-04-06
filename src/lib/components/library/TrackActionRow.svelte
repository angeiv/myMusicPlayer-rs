<script lang="ts">
  export let availability = 'available';
  export let active = false;
  export let selected = false;
  export let playing = false;
  export let interactive = false;
  export let role = 'row';
  export let tabindex: number | undefined = undefined;
  export let ariaDisabled: 'true' | 'false' | undefined = undefined;
  export let ariaDescribedBy: string | undefined = undefined;
  export let columnTemplate = '80px 1fr 120px';
  export let padding = '14px 24px';
  export let gap = '16px';
  export let className = '';
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_static_element_interactions -->
<div
  class={`track-action-row ${className}`.trim()}
  {role}
  {tabindex}
  data-surface="action-row"
  data-availability={availability}
  data-active={active ? 'true' : 'false'}
  data-selected={selected ? 'true' : 'false'}
  data-playing={playing ? 'true' : 'false'}
  data-interactive={interactive ? 'true' : 'false'}
  aria-disabled={ariaDisabled}
  aria-describedby={ariaDescribedBy}
  style={`--track-action-row-template:${columnTemplate};--track-action-row-padding:${padding};--track-action-row-gap:${gap};`}
  on:click
  on:dblclick
  on:focus
  on:keydown
  on:contextmenu
>
  <slot />
</div>

<style>
  .track-action-row {
    display: grid;
    grid-template-columns: var(--track-action-row-template);
    align-items: center;
    gap: var(--track-action-row-gap);
    padding: var(--track-action-row-padding);
    border-bottom: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-primary);
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
    user-select: none;
    -webkit-user-select: none;
  }

  .track-action-row :global(*) {
    user-select: none;
    -webkit-user-select: none;
  }

  .track-action-row[data-interactive='true'] {
    cursor: pointer;
  }

  .track-action-row[data-interactive='true']:hover {
    background: var(--accent-soft);
  }

  .track-action-row[data-selected='true'] {
    background: var(--state-selected);
  }

  .track-action-row[data-playing='true'] {
    background: color-mix(in srgb, var(--state-playing) 48%, var(--surface-panel-subtle));
  }

  .track-action-row[data-active='true'] {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
  }

  .track-action-row:focus-visible {
    outline: none;
    box-shadow:
      var(--focus-ring),
      inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
  }

  .track-action-row[data-availability='missing'] {
    color: var(--text-secondary);
  }

  .track-action-row[data-availability='missing'][data-interactive='true'] {
    cursor: not-allowed;
  }

  .track-action-row[data-availability='missing']:hover {
    background: color-mix(in srgb, var(--state-danger) 38%, transparent);
  }

  .track-action-row[data-availability='missing'] :global(.track-action-row__title) {
    color: var(--text-secondary);
  }

  .track-action-row[data-availability='missing'] :global(.track-action-row__muted),
  .track-action-row[data-availability='missing'] :global(.track-action-row__numeric),
  .track-action-row[data-availability='missing'] :global(.track-action-row__meta-text) {
    color: var(--text-tertiary);
  }

  .track-action-row[data-playing='true'] :global(.track-action-row__title) {
    color: color-mix(in srgb, var(--accent) 34%, var(--text-primary));
  }

  .track-action-row::selection,
  .track-action-row :global(*::selection) {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: inherit;
  }

  .track-action-row :global(.track-action-row__cell) {
    min-width: 0;
  }

  .track-action-row :global(.track-action-row__title-stack) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .track-action-row :global(.track-action-row__title) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--text-primary);
  }

  .track-action-row :global(.track-action-row__meta) {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .track-action-row :global(.track-action-row__meta-text),
  .track-action-row :global(.track-action-row__muted),
  .track-action-row :global(.track-action-row__numeric) {
    color: var(--text-tertiary);
  }

  .track-action-row :global(.track-action-row__numeric) {
    font-variant-numeric: tabular-nums;
  }

  .track-action-row :global(.track-action-row__badge) {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--state-danger) 65%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 45%, transparent);
    color: var(--text-primary);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
  }

  .track-action-row :global(.track-action-row__actions) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .track-action-row :global(.track-action-row__button) {
    border: none;
    min-width: 32px;
    height: 32px;
    border-radius: 999px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font: inherit;
    font-weight: 600;
    color: var(--text-primary);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    cursor: pointer;
    transition:
      background 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }

  .track-action-row :global(.track-action-row__button:hover:not(:disabled)),
  .track-action-row :global(.track-action-row__button:focus-visible:not(:disabled)) {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-panel-subtle));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent);
    outline: none;
  }

  .track-action-row :global(.track-action-row__button:disabled) {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>

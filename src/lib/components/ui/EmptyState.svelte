<script lang="ts">
  export let title: string;
  export let body = '';
  export let tone: 'default' | 'danger' | 'warning' | 'success' = 'default';
  export let align: 'start' | 'center' = 'start';
</script>

<section class="empty-state" data-empty-state data-tone={tone} data-align={align}>
  <slot name="visual" />

  <div class="copy">
    <h2>{title}</h2>
    {#if body}
      <p>{body}</p>
    {/if}
  </div>

  <div class="actions">
    <slot name="actions" />
  </div>
</section>

<style>
  .empty-state {
    display: grid;
    gap: 1rem;
    justify-items: start;
    padding: 1.5rem;
    border-radius: 20px;
    border: 1px dashed var(--border-default);
    background: color-mix(in srgb, var(--surface-panel) 88%, transparent);
    color: var(--text-primary);
  }

  .empty-state[data-align='center'] {
    justify-items: center;
    text-align: center;
  }

  .empty-state[data-tone='danger'] {
    background: color-mix(in srgb, var(--state-danger) 45%, var(--surface-panel));
    border-color: color-mix(in srgb, #ef4444 28%, var(--border-default));
  }

  .empty-state[data-tone='warning'] {
    background: color-mix(in srgb, var(--state-warning) 45%, var(--surface-panel));
    border-color: color-mix(in srgb, #f59e0b 28%, var(--border-default));
  }

  .empty-state[data-tone='success'] {
    background: color-mix(in srgb, var(--state-success) 45%, var(--surface-panel));
    border-color: color-mix(in srgb, #22c55e 28%, var(--border-default));
  }

  .copy {
    display: grid;
    gap: 0.45rem;
  }

  h2 {
    font-size: 1.1rem;
    line-height: 1.2;
    color: var(--text-primary);
  }

  p {
    max-width: 42rem;
    color: var(--text-secondary);
  }

  .actions {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
</style>

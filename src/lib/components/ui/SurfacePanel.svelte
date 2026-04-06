<script lang="ts">
  export let tone: 'default' | 'inset' | 'elevated' = 'default';
  export let padding: 'default' | 'compact' | 'spacious' = 'default';
</script>

<section class="surface-panel" data-surface-panel data-tone={tone} data-padding={padding}>
  <slot />
</section>

<style>
  .surface-panel {
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: 20px;
    box-shadow: var(--shadow-soft);
    padding: 1.25rem;
    color: var(--text-primary);
  }

  .surface-panel[data-tone='inset'] {
    background: var(--surface-panel-subtle);
    box-shadow: none;
  }

  .surface-panel[data-tone='elevated'] {
    background: var(--surface-elevated);
    border-color: var(--border-default);
    box-shadow: var(--shadow-elevated);
  }

  .surface-panel[data-padding='compact'] {
    padding: 1rem;
  }

  .surface-panel[data-padding='spacious'] {
    padding: 1.75rem;
  }
</style>

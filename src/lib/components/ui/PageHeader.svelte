<script lang="ts">
  export let title: string;
  export let subtitle = '';
</script>

<header class="page-header" data-page-header>
  <div class="copy">
    <h2>{title}</h2>
    {#if subtitle}
      <p>{subtitle}</p>
    {/if}
  </div>

  <div class="actions">
    <slot name="actions" />
  </div>
</header>

<style>
  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
  }

  .copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  h2 {
    font-size: clamp(1.5rem, 1.2rem + 0.9vw, 2rem);
    line-height: 1.1;
    color: var(--text-primary);
  }

  p {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-left: auto;
  }

  @media (max-width: 720px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .actions {
      margin-left: 0;
      justify-content: flex-start;
    }
  }
</style>

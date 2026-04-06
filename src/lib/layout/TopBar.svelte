<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import type { LibraryMaintenanceState } from '../features/library-scan/maintenance';
  import { commonCopy, shellCopy } from '../copy/zh-cn';

  const dispatch = createEventDispatcher();

  type TopBarMaintenanceCueTone = 'active' | 'warning' | 'danger';

  type TopBarMaintenanceCue = {
    tone: TopBarMaintenanceCueTone;
    title: string;
    detail: string;
  };

  // Two-way bound from parent via `<TopBar bind:searchTerm />`
  export let searchTerm = '';
  export let maintenance: LibraryMaintenanceState | null = null;
  export let showMaintenanceCue = true;

  $: maintenanceCue = resolveMaintenanceCue(maintenance);

  function onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchTerm = target.value;
    dispatch('searchTermChange');
  }

  function clearSearch() {
    // Updating bound prop updates parent directly; no custom event needed
    searchTerm = '';
    dispatch('searchTermChange');
  }

  function formatFollowUpDetail(maintenanceState: LibraryMaintenanceState): string {
    const followUpCount = maintenanceState.dirtyRoots.length || 1;
    return shellCopy.maintenanceQueuedFollowUp(followUpCount);
  }

  function resolveMaintenanceCue(
    maintenanceState: LibraryMaintenanceState | null,
  ): TopBarMaintenanceCue | null {
    if (!maintenanceState) {
      return null;
    }

    if (maintenanceState.activePhase === 'running') {
      return {
        tone: 'active',
        title: maintenanceState.title,
        detail: maintenanceState.queuedFollowUp
          ? formatFollowUpDetail(maintenanceState)
          : shellCopy.maintenanceRunning,
      };
    }

    if (maintenanceState.activePhase === 'cancelling') {
      return {
        tone: 'active',
        title: maintenanceState.title,
        detail: shellCopy.maintenanceStopping,
      };
    }

    if (maintenanceState.queuedFollowUp) {
      return {
        tone: 'warning',
        title: maintenanceState.title,
        detail: formatFollowUpDetail(maintenanceState),
      };
    }

    if (maintenanceState.watcherStatus.last_error?.trim()) {
      return {
        tone: 'warning',
        title: maintenanceState.title,
        detail: shellCopy.maintenanceReviewInSettings,
      };
    }

    if (maintenanceState.scanStatus.phase === 'failed') {
      return {
        tone: 'danger',
        title: maintenanceState.title,
        detail: shellCopy.maintenanceReviewInSettings,
      };
    }

    if (maintenanceState.scanStatus.phase === 'cancelled') {
      return {
        tone: 'warning',
        title: maintenanceState.title,
        detail: shellCopy.maintenanceRestartFromSettings,
      };
    }

    return null;
  }
</script>

<header class="top-bar" data-surface="shell">
  <div class="left">
    <div class="brand" aria-label={commonCopy.brandName}>
      <span class="brand-mark" aria-hidden="true">MM</span>
      <div class="titles">
        <span class="app-name">{commonCopy.brandName}</span>
        <span class="app-subtitle">{shellCopy.topbarSubtitle}</span>
      </div>
    </div>

    <label class="search no-drag" data-variant="toolbar-search">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input
        type="text"
        placeholder={shellCopy.searchPlaceholder}
        value={searchTerm}
        on:input={onSearchInput}
      />
      {#if searchTerm}
        <button class="clear" type="button" on:click={clearSearch} aria-label={shellCopy.clearSearch}>✕</button>
      {/if}
    </label>
  </div>

  {#if showMaintenanceCue && maintenanceCue}
    <a
      class={`maintenance-cue no-drag maintenance-cue--${maintenanceCue.tone}`}
      href="#/settings"
      aria-label={shellCopy.openMaintenanceDetails}
    >
      <span class="maintenance-dot" aria-hidden="true"></span>
      <span class="maintenance-copy">
        <span class="maintenance-title">{maintenanceCue.title}</span>
        <span class="maintenance-detail">{maintenanceCue.detail}</span>
      </span>
    </a>
  {/if}
</header>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0 1.5rem;
    height: 64px;
    background: color-mix(in srgb, var(--surface-shell) 94%, var(--surface-canvas));
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-subtle);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--text-on-accent) 4%, transparent);
    -webkit-app-region: drag;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: default;
    min-width: 0;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--accent) 88%, #ffffff 12%);
    color: var(--text-on-accent);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    box-shadow: var(--glow-accent);
  }

  .no-drag {
    -webkit-app-region: no-drag;
  }

  .titles {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
  }

  .app-name {
    font-size: 0.96rem;
    font-weight: 600;
  }

  .app-subtitle {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: var(--surface-panel-subtle);
    border: 1px solid var(--border-default);
    box-shadow: var(--shadow-soft);
  }

  .search:focus-within {
    border-color: color-mix(in srgb, var(--accent) 36%, var(--border-default));
    box-shadow: var(--focus-ring);
  }

  .search input {
    width: 260px;
    padding: 0.35rem 0.75rem 0.35rem 1.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .search input::placeholder {
    color: var(--text-tertiary);
  }

  .search input:focus {
    outline: none;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    font-size: 0.95rem;
    color: var(--text-tertiary);
  }

  .clear {
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.25rem;
    line-height: 1;
    border-radius: 999px;
  }

  .clear:hover,
  .clear:focus-visible {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    outline: none;
  }

  .maintenance-cue {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    max-width: min(360px, 100%);
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent);
    color: var(--text-primary);
    text-decoration: none;
    box-shadow: var(--shadow-soft);
    transition:
      transform 0.16s ease,
      box-shadow 0.16s ease,
      border-color 0.16s ease,
      background 0.16s ease;
  }

  .maintenance-cue:hover,
  .maintenance-cue:focus-visible {
    transform: translateY(-1px);
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .maintenance-cue--active {
    border-color: color-mix(in srgb, var(--accent) 24%, var(--border-default));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-panel));
  }

  .maintenance-cue--warning {
    border-color: color-mix(in srgb, #f59e0b 24%, var(--border-default));
    background: color-mix(in srgb, var(--state-warning) 46%, var(--surface-panel));
  }

  .maintenance-cue--danger {
    border-color: color-mix(in srgb, #ef4444 24%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 48%, var(--surface-panel));
  }

  .maintenance-dot {
    width: 0.55rem;
    height: 0.55rem;
    flex-shrink: 0;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.72;
  }

  .maintenance-cue--active .maintenance-dot {
    box-shadow: 0 0 0 0.28rem color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .maintenance-copy {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  .maintenance-title,
  .maintenance-detail {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .maintenance-title {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .maintenance-detail {
    font-size: 0.72rem;
    color: var(--text-secondary);
  }

  @media (max-width: 1180px) {
    .maintenance-detail {
      display: none;
    }
  }

  @media (max-width: 980px) {
    .app-subtitle {
      display: none;
    }

    .search input {
      width: 180px;
    }

    .maintenance-cue {
      padding-inline: 0.75rem;
      max-width: 220px;
    }
  }
</style>

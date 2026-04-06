<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import type { Readable } from 'svelte/store';

  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
  import { commonCopy, settingsCopy } from '../copy/zh-cn';
  import { applyThemeToDocument } from '../features/app-shell/theme';
  import {
    buildNextConfigForSettingsSave,
    normalizeConfigForSettings,
    normalizeTheme,
  } from '../transport/config';
  import {
    getAppVersion,
    getConfig,
    getLibraryPaths,
    pickAndAddLibraryFolder,
    removeLibraryPath,
    saveConfig as saveConfigCommand,
  } from '../api/config';
  import {
    getOutputDevices,
    getOutputDevice,
    setOutputDevice,
    setVolume,
  } from '../api/playback';
  import {
    describeSelectedOutputDevice,
    hydrateOutputDeviceState,
    switchOutputDeviceWithHydration,
  } from './settings-output-device';
  import { buildSettingsLibraryScanPresentation } from './settings-library-scan';

  import type { LibraryMaintenanceState } from '../features/library-scan/maintenance';
  import type { AppConfig, OutputDeviceInfo, ScanStatus, ThemeOption } from '../types';

  const dispatch = createEventDispatcher<{
    refreshLibrary: void;
    refreshPlaylists: void;
  }>();

  export let maintenance: Readable<LibraryMaintenanceState>;
  export let runLibraryScan: (paths: string[]) => Promise<ScanStatus>;
  export let runFullLibraryScan: (paths: string[]) => Promise<ScanStatus>;
  export let cancelLibraryScan: () => Promise<void>;

  const themeOptions: Array<{
    value: ThemeOption;
    label: string;
    description: string;
  }> = [
    {
      value: 'light',
      label: settingsCopy.themeOptions.light.label,
      description: settingsCopy.themeOptions.light.description,
    },
    {
      value: 'dark',
      label: settingsCopy.themeOptions.dark.label,
      description: settingsCopy.themeOptions.dark.description,
    },
    {
      value: 'system',
      label: settingsCopy.themeOptions.system.label,
      description: settingsCopy.themeOptions.system.description,
    },
  ];

  let libraryPaths: string[] = [];
  let isUpdatingPaths = false;
  let theme: ThemeOption = 'system';
  let autoScan = true;
  let defaultVolume = 0.7;
  let outputDevices: OutputDeviceInfo[] = [];
  let selectedDeviceId = 'default';
  let appVersion = 'unknown';

  $: scanPresentation = buildSettingsLibraryScanPresentation($maintenance);
  $: isMaintenanceActive =
    $maintenance.activePhase === 'running' || $maintenance.activePhase === 'cancelling';
  $: activeOutputDeviceLabel = describeSelectedOutputDevice(outputDevices, selectedDeviceId);

  onMount(async () => {
    await loadLibraryPaths();
    await loadConfig();
    await loadOutputDevices();
    await loadAppVersion();
    applyTheme(theme);
  });

  async function loadConfig() {
    try {
      const next = await getConfig();
      ({ theme, autoScan, defaultVolume, selectedDeviceId } = normalizeConfigForSettings(next, {
        autoScan,
        defaultVolume,
        selectedDeviceId: 'default',
      }));
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  async function saveConfig(overrides: Partial<AppConfig> = {}) {
    try {
      const base = await getConfig();
      const patch: Partial<AppConfig> = {
        ...overrides,
        library_paths: libraryPaths,
        theme,
        default_volume: defaultVolume,
        auto_scan: autoScan,
        output_device_id: selectedDeviceId === 'default' ? null : selectedDeviceId,
      };
      const next = buildNextConfigForSettingsSave(base, patch);
      await saveConfigCommand(next);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  async function loadLibraryPaths() {
    try {
      const paths = await getLibraryPaths();
      libraryPaths = paths ?? [];
    } catch (error) {
      console.error('Failed to load library paths:', error);
      libraryPaths = [];
    }
  }

  async function loadOutputDevices() {
    try {
      const next = await hydrateOutputDeviceState({
        getOutputDevices,
        getOutputDevice,
      });
      outputDevices = next.outputDevices;
      selectedDeviceId = next.selectedDeviceId;
    } catch (error) {
      console.error('Failed to load output devices:', error);
      outputDevices = [];
      selectedDeviceId = 'default';
    }
  }

  async function loadAppVersion() {
    try {
      appVersion = await getAppVersion();
    } catch (error) {
      console.error('Failed to get version:', error);
      appVersion = 'unknown';
    }
  }

  function applyTheme(next: ThemeOption) {
    theme = next;
    applyThemeToDocument(next);
  }

  async function handleAddFolder() {
    try {
      isUpdatingPaths = true;
      await pickAndAddLibraryFolder();
      await loadLibraryPaths();
      await loadConfig();
      dispatch('refreshLibrary');
    } catch (error) {
      console.error('Failed to add library path:', error);
      alert(commonCopy.addFolderFailed);
    } finally {
      isUpdatingPaths = false;
    }
  }

  async function handleRemovePath(path: unknown) {
    if (typeof path !== 'string') {
      return;
    }
    try {
      isUpdatingPaths = true;
      await removeLibraryPath(path);
      await loadLibraryPaths();
      await loadConfig();
    } catch (error) {
      console.error('Failed to remove library path:', error);
      alert(commonCopy.removeFolderFailed);
    } finally {
      isUpdatingPaths = false;
    }
  }

  async function handleRescan() {
    try {
      await runLibraryScan(libraryPaths);
      dispatch('refreshLibrary');
    } catch (error) {
      console.error('Rescan failed:', error);
      alert(commonCopy.rescanFailed);
    }
  }

  async function handleFullScan() {
    try {
      await runFullLibraryScan(libraryPaths);
      dispatch('refreshLibrary');
    } catch (error) {
      console.error('Full scan failed:', error);
      alert(commonCopy.fullScanFailed);
    }
  }

  async function handleCancelScan() {
    try {
      await cancelLibraryScan();
    } catch (error) {
      console.error('Failed to cancel scan:', error);
      alert(commonCopy.cancelScanFailed);
    }
  }

  function handleThemeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const next = normalizeTheme(input.value);
    applyTheme(next);
    void saveConfig({ theme: next });
  }

  function handleAutoScanChange(event: Event) {
    const input = event.target as HTMLInputElement;
    autoScan = input.checked;
    void saveConfig({ auto_scan: autoScan });
  }

  async function handleDefaultVolumeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value) / 100;
    defaultVolume = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : defaultVolume;
    void saveConfig({ default_volume: defaultVolume });

    try {
      await setVolume(defaultVolume);
    } catch (error) {
      console.error('Failed to apply default volume:', error);
    }
  }

  async function handleOutputDeviceChange(event: Event) {
    const input = event.target as HTMLSelectElement;
    const requestedDeviceId = input.value;
    const previousDeviceId = selectedDeviceId;
    selectedDeviceId = requestedDeviceId;

    try {
      const next = await switchOutputDeviceWithHydration(
        {
          setOutputDevice,
          getOutputDevice,
        },
        requestedDeviceId,
        previousDeviceId,
      );
      selectedDeviceId = next.selectedDeviceId;

      if (!next.committed) {
        throw new Error('Output device switch was not committed.');
      }

      void saveConfig({ output_device_id: selectedDeviceId === 'default' ? null : selectedDeviceId });
    } catch (error) {
      console.error('Failed to set output device:', error);
      alert(commonCopy.switchOutputDeviceFailed);
    }
  }
</script>

<section class="settings">
  <PageHeader title={settingsCopy.title} subtitle={settingsCopy.subtitle}>
    <div slot="actions" class="header-chip">
      <span>{settingsCopy.versionChip(appVersion)}</span>
      <small>{commonCopy.desktopBuild}</small>
    </div>
  </PageHeader>

  <div class="settings-grid">
    <SurfacePanel padding="spacious">
      <div class="panel-head">
        <div class="panel-copy">
          <span class="eyebrow">{settingsCopy.maintenanceEyebrow}</span>
          <h3>{settingsCopy.libraryTitle}</h3>
          <p>{settingsCopy.libraryDescription}</p>
        </div>
        <span class="status-pill" data-tone={scanPresentation.statusTone}>{scanPresentation.title}</span>
      </div>

      <div class="panel-body">
        {#if libraryPaths.length === 0}
          <EmptyState
            title={settingsCopy.noFoldersTitle}
            body={settingsCopy.noFoldersBody}
            align="start"
          >
            <button
              slot="actions"
              class="settings-button"
              data-variant="primary"
              type="button"
              on:click={handleAddFolder}
              disabled={isUpdatingPaths}
            >
              {settingsCopy.addFolder}
            </button>
          </EmptyState>
        {:else}
          <ul class="settings-list paths">
            {#each libraryPaths as path}
              <li>
                <span>{path}</span>
                <button
                  class="settings-button settings-button--compact"
                  data-variant="danger"
                  type="button"
                  on:click={() => handleRemovePath(path)}
                  disabled={isUpdatingPaths}
                  aria-label={settingsCopy.removeFolderAria(path)}
                >
                  {settingsCopy.removeFolder}
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        <div
          class="scan-status"
          data-testid="settings-maintenance-status"
          data-tone={scanPresentation.statusTone}
        >
          <div class="scan-status-headline" role="status" aria-live="polite" aria-atomic="true">
            <span class="scan-phase">{scanPresentation.title}</span>
          </div>

          <p class="scan-description">{scanPresentation.description}</p>

          <div class="scan-status-row scan-status-row--stacked">
            <span class="scan-label">{settingsCopy.autoSync}</span>
            <span class="scan-current">{scanPresentation.autoSyncSummary}</span>
          </div>

          {#if scanPresentation.watchedRoots.length > 0}
            <div class="scan-status-stack">
              <span class="scan-label">{settingsCopy.watchedFolders}</span>
              <ul class="scan-list" aria-label={settingsCopy.watchedFolders}>
                {#each scanPresentation.watchedRoots as root}
                  <li>{root}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if scanPresentation.currentPath}
            <div class="scan-status-row">
              <span class="scan-label">{scanPresentation.currentPathLabel}</span>
              <span class="scan-current">{scanPresentation.currentPath}</span>
            </div>
          {/if}

          {#if scanPresentation.queuedFollowUp}
            <div class="scan-callout" data-tone="warning" role="note">
              <span class="scan-label">{scanPresentation.queuedFollowUp.title}</span>
              <p class="scan-error-message">{scanPresentation.queuedFollowUp.description}</p>
            </div>
          {/if}

          <ul class="scan-metrics" aria-label={settingsCopy.scanSummary}>
            {#each scanPresentation.metrics as metric}
              <li data-tone={metric.tone ?? 'default'}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </li>
            {/each}
          </ul>

          {#if scanPresentation.actionGuide}
            <div class="scan-callout" data-tone={scanPresentation.statusTone === 'danger' ? 'danger' : 'default'} role="note">
              <span class="scan-label">{scanPresentation.actionGuide.title}</span>
              <p class="scan-error-message">{scanPresentation.actionGuide.description}</p>
            </div>
          {/if}

          {#if scanPresentation.recoveryHint && scanPresentation.actionGuide?.buttonLabel === settingsCopy.cancelScan}
            <div class="scan-callout" data-tone="active" role="note">
              <span class="scan-label">{settingsCopy.whatHappensNext}</span>
              <p class="scan-error-message">{scanPresentation.recoveryHint}</p>
            </div>
          {/if}

          {#if scanPresentation.watcherError}
            <div class="scan-callout" data-tone="warning" role="note">
              <span class="scan-label">{scanPresentation.watcherError.title}</span>
              <p class="scan-error-message">{scanPresentation.watcherError.description}</p>
            </div>
          {/if}

          {#if scanPresentation.sampleError}
            <div class="scan-callout" data-tone="danger" role="note">
              <span class="scan-label">{scanPresentation.sampleError.title}</span>
              <p class="scan-error-message">{scanPresentation.sampleError.description}</p>
            </div>
          {/if}
        </div>
      </div>

      <div class="action-row">
        <button
          class="settings-button"
          data-variant="primary"
          type="button"
          on:click={handleAddFolder}
          disabled={isUpdatingPaths}
        >
          {settingsCopy.addFolder}
        </button>
        <button
          class="settings-button"
          data-variant="secondary"
          type="button"
          on:click={handleRescan}
          disabled={libraryPaths.length === 0 || isUpdatingPaths || isMaintenanceActive}
        >
          {settingsCopy.rescanNow}
        </button>
        <button
          class="settings-button"
          data-variant="secondary"
          type="button"
          on:click={handleFullScan}
          disabled={libraryPaths.length === 0 || isUpdatingPaths || isMaintenanceActive}
        >
          {settingsCopy.fullScan}
        </button>
        {#if isMaintenanceActive}
          <button
            class="settings-button"
            data-variant="danger"
            type="button"
            on:click={handleCancelScan}
            disabled={isUpdatingPaths}
          >
            {settingsCopy.cancelScan}
          </button>
        {/if}
      </div>
    </SurfacePanel>

    <SurfacePanel padding="spacious">
      <div class="panel-head">
        <div class="panel-copy">
          <span class="eyebrow">{settingsCopy.appearanceEyebrow}</span>
          <h3>{settingsCopy.themeTitle}</h3>
          <p>{settingsCopy.themeDescription}</p>
        </div>
      </div>

      <div class="panel-body panel-body--stacked">
        <div class="option-grid" on:change={handleThemeChange} role="radiogroup" aria-label={settingsCopy.themeOptionsLabel}>
          {#each themeOptions as option}
            <label class="option-card" data-active={theme === option.value ? 'true' : 'false'}>
              <input type="radio" name="theme" value={option.value} checked={theme === option.value} />
              <span class="option-copy">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          {/each}
        </div>

        <label class="toggle-row">
          <span>
            <strong>{settingsCopy.scanOnStartupTitle}</strong>
            <small>{settingsCopy.scanOnStartupDescription}</small>
          </span>
          <input type="checkbox" checked={autoScan} on:change={handleAutoScanChange} />
        </label>

        <label class="slider-row">
          <span>
            <strong>{settingsCopy.defaultVolumeTitle}</strong>
            <small>{settingsCopy.defaultVolumeDescription}</small>
          </span>
          <div class="slider-control">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(defaultVolume * 100)}
              on:input={handleDefaultVolumeChange}
            />
            <span class="slider-value">{Math.round(defaultVolume * 100)}%</span>
          </div>
        </label>
      </div>
    </SurfacePanel>

    <SurfacePanel padding="spacious">
      <div class="panel-head">
        <div class="panel-copy">
          <span class="eyebrow">{settingsCopy.playbackEyebrow}</span>
          <h3>{settingsCopy.audioTitle}</h3>
          <p>{settingsCopy.audioDescription}</p>
        </div>
        <span class="status-pill" data-tone="active">{activeOutputDeviceLabel}</span>
      </div>

      <div class="panel-body panel-body--stacked">
        <label class="field">
          <span>
            <strong>{settingsCopy.outputDeviceTitle}</strong>
            <small>{settingsCopy.currentOutput(activeOutputDeviceLabel)}</small>
          </span>
          <select on:change={handleOutputDeviceChange} value={selectedDeviceId}>
            <option value="default">{commonCopy.systemDefault}</option>
            {#each outputDevices as device}
              <option value={device.id}>
                {device.name}{device.is_default ? `（${commonCopy.defaultDevice}）` : ''}
              </option>
            {/each}
          </select>
        </label>
      </div>

      <div class="action-row">
        <button class="settings-button" data-variant="secondary" type="button" disabled title={commonCopy.comingSoon}>
          {settingsCopy.advancedAudioSettings}
        </button>
      </div>
    </SurfacePanel>

    <SurfacePanel padding="spacious">
      <div class="panel-head">
        <div class="panel-copy">
          <span class="eyebrow">{settingsCopy.maintenanceEyebrow}</span>
          <h3>{settingsCopy.aboutTitle}</h3>
          <p>{settingsCopy.aboutDescription}</p>
        </div>
      </div>

      <div class="panel-body">
        <dl class="about-grid">
          <div>
            <dt>{settingsCopy.versionLabel}</dt>
            <dd>{appVersion || commonCopy.unknownVersion}</dd>
          </div>
          <div>
            <dt>{settingsCopy.authorLabel}</dt>
            <dd>{settingsCopy.authorValue}</dd>
          </div>
          <div>
            <dt>{settingsCopy.licenseLabel}</dt>
            <dd>MIT / Apache-2.0</dd>
          </div>
        </dl>
      </div>

      <div class="action-row">
        <button class="settings-button" data-variant="secondary" type="button" on:click={() => dispatch('refreshPlaylists')}>
          {settingsCopy.reloadPlaylists}
        </button>
      </div>
    </SurfacePanel>
  </div>
</section>

<style>
  .settings {
    padding: 32px 48px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header-chip,
  .status-pill {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.18rem;
    min-width: 0;
    padding: 0.8rem 1rem;
    border-radius: 18px;
    border: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    color: var(--text-primary);
    text-align: right;
  }

  .header-chip small {
    color: var(--text-tertiary);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-pill[data-tone='active'] {
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-panel));
    box-shadow: var(--shadow-soft);
  }

  .status-pill[data-tone='success'] {
    border-color: color-mix(in srgb, #22c55e 30%, var(--border-default));
    background: color-mix(in srgb, var(--state-success) 52%, var(--surface-panel));
  }

  .status-pill[data-tone='warning'] {
    border-color: color-mix(in srgb, #f59e0b 28%, var(--border-default));
    background: color-mix(in srgb, var(--state-warning) 52%, var(--surface-panel));
  }

  .status-pill[data-tone='danger'] {
    border-color: color-mix(in srgb, #ef4444 28%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 54%, var(--surface-panel));
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .panel-copy {
    display: grid;
    gap: 0.35rem;
  }

  .eyebrow {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .panel-copy h3 {
    margin: 0;
    font-size: 1.15rem;
    color: var(--text-primary);
  }

  .panel-copy p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .panel-body {
    display: grid;
    gap: 1rem;
  }

  .panel-body--stacked {
    gap: 1.25rem;
  }

  .settings-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .settings-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
  }

  .settings-list span {
    overflow-wrap: anywhere;
  }

  .scan-status {
    display: grid;
    gap: 0.9rem;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel-subtle) 90%, transparent);
  }

  .scan-status[data-tone='active'] {
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-panel-subtle));
  }

  .scan-status[data-tone='success'] {
    border-color: color-mix(in srgb, #22c55e 24%, var(--border-default));
    background: color-mix(in srgb, var(--state-success) 42%, var(--surface-panel-subtle));
  }

  .scan-status[data-tone='warning'] {
    border-color: color-mix(in srgb, #f59e0b 24%, var(--border-default));
    background: color-mix(in srgb, var(--state-warning) 42%, var(--surface-panel-subtle));
  }

  .scan-status[data-tone='danger'] {
    border-color: color-mix(in srgb, #ef4444 24%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 42%, var(--surface-panel-subtle));
  }

  .scan-status-headline {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .scan-phase {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .scan-description,
  .scan-current,
  .scan-label,
  .scan-error-message {
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .scan-description,
  .scan-error-message {
    margin: 0;
  }

  .scan-status-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .scan-status-row--stacked,
  .scan-status-stack {
    display: grid;
    gap: 0.35rem;
  }

  .scan-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .scan-list li {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel) 88%, transparent);
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .scan-current {
    text-align: right;
    overflow-wrap: anywhere;
  }

  .scan-metrics {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }

  .scan-metrics li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel) 88%, transparent);
    color: var(--text-secondary);
  }

  .scan-metrics li strong {
    color: var(--text-primary);
    font-size: 1rem;
  }

  .scan-metrics li[data-tone='success'] {
    border-color: color-mix(in srgb, #22c55e 20%, var(--border-default));
    background: color-mix(in srgb, var(--state-success) 40%, var(--surface-panel));
  }

  .scan-metrics li[data-tone='warning'] {
    border-color: color-mix(in srgb, #f59e0b 20%, var(--border-default));
    background: color-mix(in srgb, var(--state-warning) 42%, var(--surface-panel));
  }

  .scan-metrics li[data-tone='danger'] {
    border-color: color-mix(in srgb, #ef4444 22%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 44%, var(--surface-panel));
  }

  .scan-callout {
    display: grid;
    gap: 0.35rem;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel) 90%, transparent);
  }

  .scan-callout[data-tone='default'] {
    border-color: color-mix(in srgb, var(--accent) 10%, var(--border-default));
    background: color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent);
  }

  .scan-callout[data-tone='active'] {
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-panel));
  }

  .scan-callout[data-tone='warning'] {
    border-color: color-mix(in srgb, #f59e0b 22%, var(--border-default));
    background: color-mix(in srgb, var(--state-warning) 46%, var(--surface-panel));
  }

  .scan-callout[data-tone='danger'] {
    border-color: color-mix(in srgb, #ef4444 22%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 48%, var(--surface-panel));
  }

  .action-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .settings-button {
    border: 1px solid var(--border-default);
    border-radius: 999px;
    padding: 10px 18px;
    font-weight: 600;
    cursor: pointer;
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    color: var(--text-primary);
    transition:
      transform 0.16s ease,
      box-shadow 0.16s ease,
      border-color 0.16s ease,
      background 0.16s ease;
  }

  .settings-button:hover:not(:disabled),
  .settings-button:focus-visible:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-soft);
    outline: none;
  }

  .settings-button[data-variant='primary'] {
    border-color: color-mix(in srgb, var(--accent) 20%, var(--border-default));
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-panel));
    box-shadow: var(--glow-accent);
  }

  .settings-button[data-variant='secondary'] {
    background: color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent);
  }

  .settings-button[data-variant='danger'] {
    border-color: color-mix(in srgb, #ef4444 24%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 54%, var(--surface-panel));
  }

  .settings-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  .settings-button--compact {
    padding: 6px 12px;
    font-size: 0.82rem;
  }

  .option-grid {
    display: grid;
    gap: 12px;
  }

  .option-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: start;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    cursor: pointer;
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }

  .option-card[data-active='true'] {
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    background: color-mix(in srgb, var(--state-selected) 64%, var(--surface-panel));
    box-shadow: var(--shadow-soft);
  }

  .option-card:hover,
  .option-card:focus-within {
    border-color: color-mix(in srgb, var(--accent) 18%, var(--border-default));
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
  }

  .option-card input {
    margin-top: 2px;
    accent-color: var(--accent);
  }

  .option-copy {
    display: grid;
    gap: 0.2rem;
  }

  .option-copy strong,
  .toggle-row strong,
  .slider-row strong,
  .field strong {
    color: var(--text-primary);
  }

  .option-copy small,
  .toggle-row small,
  .slider-row small,
  .field small {
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .toggle-row,
  .slider-row,
  .field {
    display: grid;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
  }

  .toggle-row {
    grid-template-columns: 1fr auto;
    align-items: center;
  }

  .toggle-row input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }

  .slider-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .slider-value {
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    font-weight: 600;
  }

  select {
    width: 100%;
    border-radius: 14px;
    border: 1px solid var(--border-default);
    padding: 10px 12px;
    background: color-mix(in srgb, var(--surface-panel) 94%, transparent);
    color: var(--text-primary);
  }

  .about-grid {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px 16px;
  }

  .about-grid dt {
    color: var(--text-tertiary);
  }

  .about-grid dd {
    margin: 0;
    color: var(--text-primary);
  }

  @media (max-width: 820px) {
    .settings {
      padding: 24px;
    }

    .panel-head {
      flex-direction: column;
      align-items: stretch;
    }

    .header-chip,
    .status-pill {
      align-items: flex-start;
      text-align: left;
    }
  }
</style>

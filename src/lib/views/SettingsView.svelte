<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import type { Readable } from 'svelte/store';
  import { applyThemeToDocument } from '../features/app-shell/theme';
  import { normalizeConfigForSettings, normalizeTheme } from '../transport/config';
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
    hydrateOutputDeviceState,
    switchOutputDeviceWithHydration,
  } from './settings-output-device';

  import type { AppConfig, OutputDeviceInfo, ScanStatus, ThemeOption } from '../types';

  const dispatch = createEventDispatcher<{
    refreshLibrary: void;
    refreshPlaylists: void;
  }>();

  export let scanStatus: Readable<ScanStatus>;
  export let isScanning: Readable<boolean>;
  export let runLibraryScan: (paths: string[]) => Promise<ScanStatus>;
  export let cancelLibraryScan: () => Promise<void>;

  let libraryPaths: string[] = [];
  let isUpdatingPaths = false;
  let theme: ThemeOption = 'system';
  let autoScan = true;
  let defaultVolume = 0.7;
  let outputDevices: OutputDeviceInfo[] = [];
  let selectedDeviceId = 'default';
  let config: AppConfig | null = null;
  let appVersion = 'unknown';

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
      config = next;
      ({ theme, autoScan, defaultVolume, selectedDeviceId } = normalizeConfigForSettings(next, {
        autoScan,
        defaultVolume,
        selectedDeviceId: 'default',
      }));
    } catch (error) {
      console.error('Failed to load config:', error);
      config = null;
    }
  }

  async function saveConfig(overrides: Partial<AppConfig>) {
    try {
      const base = config ?? (await getConfig());
      const next: AppConfig = {
        ...base,
        ...overrides,
        library_paths: libraryPaths,
        theme,
        default_volume: defaultVolume,
        auto_scan: autoScan,
        output_device_id: selectedDeviceId === 'default' ? null : selectedDeviceId,
      };
      await saveConfigCommand(next);
      config = next;
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
      alert('Failed to add folder.');
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
      alert('Failed to remove folder.');
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
      alert('Rescan failed.');
    }
  }

  async function handleCancelScan() {
    try {
      await cancelLibraryScan();
    } catch (error) {
      console.error('Failed to cancel scan:', error);
      alert('Failed to cancel scan.');
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
      alert('Failed to switch output device.');
    }
  }
</script>

<section class="settings">
  <h2>Settings</h2>

  <div class="grid">
    <section class="panel">
      <header>
        <h3>Library</h3>
        <p>Manage your music folders</p>
      </header>
      <div class="content">
        {#if libraryPaths.length === 0}
          <p class="muted">No folders selected yet.</p>
        {:else}
          <ul class="paths">
            {#each libraryPaths as path}
              <li>
                <span>{path}</span>
                <button
                  on:click={() => handleRemovePath(path)}
                  disabled={isUpdatingPaths}
                  aria-label={`Remove folder ${path}`}
                >
                  Remove
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        <div class="scan-status">
          <div class="scan-status-row" role="status" aria-live="polite" aria-atomic="true">
            <span class="muted">Scan</span>
            <span class="scan-phase">{$scanStatus.phase}</span>
          </div>

          {#if $scanStatus.current_path}
            <div class="scan-status-row">
              <span class="muted">Current</span>
              <span class="scan-current">{$scanStatus.current_path}</span>
            </div>
          {/if}

          <div class="scan-metrics">
            <span>Files: {$scanStatus.processed_files}</span>
            <span>Tracks: {$scanStatus.inserted_tracks}</span>
            {#if $scanStatus.error_count > 0}
              <span class="scan-errors">Errors: {$scanStatus.error_count}</span>
            {/if}
          </div>
        </div>
      </div>
      <footer>
        <button class="primary" on:click={handleAddFolder} disabled={isUpdatingPaths}>
          ➕ Add Folder
        </button>
        <button
          on:click={handleRescan}
          disabled={libraryPaths.length === 0 || isUpdatingPaths || $isScanning}
        >
          🔄 Rescan Now
        </button>
        {#if $isScanning}
          <button class="danger" on:click={handleCancelScan} disabled={isUpdatingPaths}>
            ✋ Cancel Scan
          </button>
        {/if}
      </footer>
    </section>

    <section class="panel">
      <header>
        <h3>Appearance</h3>
        <p>Customize the interface</p>
      </header>
      <div class="content">
        <div class="theme-options" on:change={handleThemeChange}>
          <label>
            <input type="radio" name="theme" value="light" checked={theme === 'light'} />
            <span>Light</span>
          </label>
          <label>
            <input type="radio" name="theme" value="dark" checked={theme === 'dark'} />
            <span>Dark</span>
          </label>
          <label>
            <input type="radio" name="theme" value="system" checked={theme === 'system'} />
            <span>Follow System</span>
          </label>
        </div>
        <label class="toggle">
          <input type="checkbox" checked={autoScan} on:change={handleAutoScanChange} />
          <span>Scan library on startup</span>
        </label>
        <label class="slider">
          <span>Default volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(defaultVolume * 100)}
            on:input={handleDefaultVolumeChange}
          />
          <span class="value">{Math.round(defaultVolume * 100)}%</span>
        </label>
      </div>
    </section>

    <section class="panel">
      <header>
        <h3>Audio</h3>
        <p>Playback device</p>
      </header>
      <div class="content">
        <label class="select">
          <span>Output device</span>
          <select on:change={handleOutputDeviceChange} value={selectedDeviceId}>
            <option value="default">System default</option>
            {#each outputDevices as device}
              <option value={device.id}>
                {device.name}{device.is_default ? ' (default)' : ''}
              </option>
            {/each}
          </select>
        </label>
      </div>
      <footer>
        <button disabled title="Coming soon">Advanced audio settings</button>
      </footer>
    </section>

    <section class="panel">
      <header>
        <h3>About</h3>
        <p>Application information</p>
      </header>
      <div class="content about">
        <dl>
          <div>
            <dt>Version</dt>
            <dd>{appVersion || 'unknown'}</dd>
          </div>
          <div>
            <dt>Author</dt>
            <dd>myMusicPlayer-rs team</dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>MIT / Apache-2.0</dd>
          </div>
        </dl>
      </div>
      <footer>
        <button on:click={() => dispatch('refreshPlaylists')}>Reload playlists</button>
      </footer>
    </section>
  </div>
</section>

<style>
  .settings {
    padding: 32px 48px;
    color: var(--app-fg);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  h2 {
    margin: 0;
    font-size: 1.8rem;
    color: var(--app-fg);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 24px;
  }

  .panel {
    background: rgba(15, 23, 42, 0.78);
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    flex-direction: column;
  }

  header {
    padding: 20px 24px 12px 24px;
  }

  header h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #f8fafc;
  }

  header p {
    margin: 6px 0 0 0;
    color: rgba(148, 163, 184, 0.75);
  }

  .content {
    padding: 0 24px 16px 24px;
    flex: 1;
  }

  .paths {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .paths li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.4);
  }

  .paths span {
    overflow-wrap: anywhere;
  }

  .paths button {
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.25);
    color: #fecaca;
    cursor: pointer;
  }

  .paths button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .scan-status {
    margin-top: 16px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.4);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.95rem;
  }

  .scan-status-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .scan-phase {
    text-transform: capitalize;
    color: #f8fafc;
    font-variant-numeric: tabular-nums;
  }

  .scan-current {
    overflow-wrap: anywhere;
    text-align: right;
    color: rgba(226, 232, 240, 0.9);
  }

  .scan-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    color: rgba(148, 163, 184, 0.75);
    font-variant-numeric: tabular-nums;
  }

  .scan-errors {
    color: #fecaca;
  }

  footer {
    padding: 0 24px 20px 24px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  footer button {
    border: none;
    border-radius: 999px;
    padding: 10px 20px;
    cursor: pointer;
    background: rgba(30, 41, 59, 0.6);
    color: #bfdbfe;
  }

  footer button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .primary {
    background: rgba(34, 197, 94, 0.3);
    color: #dcfce7;
    box-shadow: 0 12px 24px rgba(34, 197, 94, 0.2);
  }

  .danger {
    background: rgba(239, 68, 68, 0.25);
    color: #fecaca;
  }

  .muted {
    color: rgba(148, 163, 184, 0.75);
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .theme-options label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.4);
    cursor: pointer;
  }

  .theme-options input {
    accent-color: #60a5fa;
  }

  .select {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  select {
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 10px 12px;
    background: rgba(15, 23, 42, 0.6);
    color: inherit;
  }

  .about dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px 16px;
  }

  dt {
    color: rgba(148, 163, 184, 0.75);
  }

  dd {
    margin: 0;
    color: #f8fafc;
  }

  @media (max-width: 820px) {
    .settings {
      padding: 24px;
    }
  }
</style>

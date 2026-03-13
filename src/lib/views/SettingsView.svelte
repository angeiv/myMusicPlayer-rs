<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getVersion } from '@tauri-apps/api/app';
  import { isTauri } from '../utils/env';

  type ThemeOption = 'system' | 'light' | 'dark';

  const dispatch = createEventDispatcher<{
    refreshLibrary: void;
    refreshPlaylists: void;
  }>();

  let libraryPaths: string[] = isTauri
    ? []
    : ['~/Music', '/Volumes/Sunset Sessions'];
  let isUpdatingPaths = false;
  let theme: ThemeOption = 'system';
  let appVersion = isTauri ? '' : 'dev-preview';

  onMount(async () => {
    await Promise.all([
      loadLibraryPaths(),
      loadAppVersion(),
    ]);
    applyTheme(theme);
  });

  async function loadLibraryPaths() {
    if (!isTauri) {
      return;
    }

    try {
      const paths = await invoke<string[]>('get_library_paths');
      libraryPaths = paths ?? [];
    } catch (error) {
      console.error('Failed to load library paths:', error);
      libraryPaths = [];
    }
  }

  async function loadAppVersion() {
    if (!isTauri) {
      appVersion = '0.1.0-dev';
      return;
    }

    try {
      appVersion = await getVersion();
    } catch (error) {
      console.error('Failed to get version:', error);
      appVersion = 'unknown';
    }
  }

  function applyTheme(next: ThemeOption) {
    theme = next;
    const root = document.documentElement;
    if (next === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
  }

  async function handleAddFolder() {
    if (!isTauri) {
      const selected = window.prompt('Enter a folder path to mock add to the library');
      const trimmed = selected?.trim();
      if (!trimmed) return;
      libraryPaths = [...libraryPaths, trimmed];
      dispatch('refreshLibrary');
      return;
    }

    try {
      isUpdatingPaths = true;
      await invoke('pick_and_add_library_folder');
      await loadLibraryPaths();
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
    if (!isTauri) {
      libraryPaths = libraryPaths.filter((item) => item !== path);
      return;
    }

    try {
      isUpdatingPaths = true;
      await invoke('remove_library_path', { path });
      await loadLibraryPaths();
    } catch (error) {
      console.error('Failed to remove library path:', error);
      alert('Failed to remove folder.');
    } finally {
      isUpdatingPaths = false;
    }
  }

  async function handleRescan() {
    if (!isTauri) {
      dispatch('refreshLibrary');
      return;
    }

    try {
      for (const path of libraryPaths) {
        await invoke('scan_directory', { path });
      }
      dispatch('refreshLibrary');
    } catch (error) {
      console.error('Rescan failed:', error);
      alert('Rescan failed.');
    }
  }

  function handleThemeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    applyTheme(input.value as ThemeOption);
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
                <button on:click={() => handleRemovePath(path)} disabled={isUpdatingPaths}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <footer>
        <button class="primary" on:click={handleAddFolder} disabled={isUpdatingPaths}>
          ➕ Add Folder
        </button>
        <button on:click={handleRescan} disabled={libraryPaths.length === 0 || isUpdatingPaths}>
          🔄 Rescan Now
        </button>
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
          <select disabled>
            <option>System default (coming soon)</option>
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
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  h2 {
    margin: 0;
    font-size: 1.8rem;
    color: #f8fafc;
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

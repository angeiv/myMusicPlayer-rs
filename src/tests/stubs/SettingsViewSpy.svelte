<script lang="ts">
  import type { Readable } from 'svelte/store';

  import type { ScanStatus } from '../../lib/types';

  export let scanStatus: Readable<ScanStatus>;
  export let isScanning: Readable<boolean>;
  export let runLibraryScan: (paths: string[]) => Promise<unknown> = async () => undefined;
  export let cancelLibraryScan: () => Promise<void> = async () => undefined;

  type SettingsViewSpyProps = {
    scanStatus: Readable<ScanStatus>;
    isScanning: Readable<boolean>;
    runLibraryScan: (paths: string[]) => Promise<unknown>;
    cancelLibraryScan: () => Promise<void>;
  };

  type SettingsViewSpyWindow = Window & {
    __settingsViewSpyProps?: SettingsViewSpyProps;
  };

  $: if (typeof window !== 'undefined') {
    const spyWindow = window as SettingsViewSpyWindow;

    spyWindow.__settingsViewSpyProps = {
      scanStatus,
      isScanning,
      runLibraryScan,
      cancelLibraryScan,
    };
  }
</script>

<div data-testid="settings-view-spy">SettingsView spy</div>

<script lang="ts">
  import { commonCopy } from '../copy/zh-cn';
  import { getPlaybackSurfaceAvailability } from '../utils/track-availability';
  import type { PlaybackStateInfo, Track } from '../types';

  const CURRENT_QUEUE_TRACK_REPLAY_BLOCKED_DESCRIPTION = '文件已缺失，无法重新播放';

  export let tracks: Track[] = [];
  export let currentTrackId: string | null = null;
  export let playbackState: PlaybackStateInfo = { state: 'stopped' };
  export let onSelect: (track: Track) => void = () => {};
  export let onRemove: (track: Track) => void = () => {};
  export let onClear: () => void = () => {};

  function isCurrent(track: Track): boolean {
    return Boolean(currentTrackId && track.id === currentTrackId);
  }

  function handleSelect(track: Track, blocked: boolean): void {
    if (isCurrent(track) || blocked) return;
    onSelect(track);
  }

  function handleRemove(event: MouseEvent, track: Track): void {
    event.preventDefault();
    event.stopPropagation();
    onRemove(track);
  }

  function formatDuration(totalSeconds: number | undefined): string {
    if (!totalSeconds || Number.isNaN(totalSeconds)) {
      return '0:00';
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
</script>

<div class="queue-root" data-surface="queue-list">
  <div class="queue-toolbar">
    <button type="button" class="queue-clear" on:click={() => onClear()} aria-label="清空队列">
      清空
    </button>
  </div>

  {#if tracks.length === 0}
    <p class="queue-empty">队列为空（后续已清空）</p>
  {:else}
    <ul class="queue-list">
      {#each tracks as track, index (track.id)}
        {@const current = isCurrent(track)}
        {@const availability = getPlaybackSurfaceAvailability(track, { isCurrent: current, playbackState })}
        {@const availabilityDescription =
          current && availability.status === 'continuing'
            ? CURRENT_QUEUE_TRACK_REPLAY_BLOCKED_DESCRIPTION
            : availability.description}
        {@const selectionBlocked = availability.status === 'blocked'}
        {@const availabilityDescriptionId = availabilityDescription ? `queue-track-availability-${index}` : undefined}
        <li
          class:active={current}
          class:is-missing={availability.availability === 'missing'}
          data-availability={availability.availability}
        >
          <div class="queue-row">
            <button
              type="button"
              class="queue-item"
              disabled={selectionBlocked && !current}
              aria-disabled={selectionBlocked && !current ? 'true' : undefined}
              aria-current={current ? 'true' : undefined}
              aria-describedby={availabilityDescriptionId}
              title={availabilityDescription || undefined}
              on:click={() => handleSelect(track, selectionBlocked)}
            >
              <span class="index">{index + 1}</span>
              <div class="queue-copy">
                <p class="queue-title">{track.title}</p>
                <p class="queue-artist">{track.artist_name ?? commonCopy.unknownArtist}</p>
                {#if availability.badge || availabilityDescription}
                  <div class="queue-meta-line">
                    {#if availability.badge}
                      <span class="availability-badge">{availability.badge}</span>
                    {/if}
                    {#if availabilityDescription}
                      <p id={availabilityDescriptionId} class="queue-status">{availabilityDescription}</p>
                    {/if}
                  </div>
                {/if}
              </div>
              <span class="queue-time">{formatDuration(track.duration)}</span>
            </button>

            {#if track.id !== currentTrackId}
              <button
                type="button"
                class="queue-remove"
                aria-label={`从队列移除 ${track.title}`}
                on:click={(event) => handleRemove(event, track)}
              >
                ✕
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .queue-root {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  p {
    margin: 0;
  }

  .queue-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .queue-clear {
    border: 1px solid var(--border-default);
    border-radius: 999px;
    padding: 6px 12px;
    background: var(--surface-panel-subtle);
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .queue-clear:hover,
  .queue-clear:focus-visible {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 24%, var(--border-default));
    outline: none;
  }

  .queue-empty {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .queue-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
  }

  .queue-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
  }

  .queue-item {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid transparent;
    background: var(--surface-panel-subtle);
    border-radius: 12px;
    padding: 8px 10px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .queue-item:hover:not(:disabled),
  .queue-item:focus-visible {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    box-shadow: var(--shadow-soft);
    outline: none;
  }

  li.active .queue-item {
    background: var(--state-selected);
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border-default));
  }

  li.is-missing .queue-item {
    border-color: color-mix(in srgb, var(--state-danger) 68%, var(--border-default));
  }

  .queue-item:disabled {
    cursor: not-allowed;
    opacity: 0.78;
  }

  .queue-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .queue-remove {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-default);
    border-radius: 10px;
    background: var(--surface-panel-subtle);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  .queue-remove:hover,
  .queue-remove:focus-visible {
    background: color-mix(in srgb, var(--state-danger) 78%, var(--surface-panel-subtle));
    border-color: color-mix(in srgb, var(--state-danger) 72%, var(--border-default));
    color: var(--text-primary);
    outline: none;
  }

  .queue-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .queue-artist {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .queue-meta-line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .availability-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--state-danger) 84%, var(--surface-elevated));
    border: 1px solid color-mix(in srgb, var(--state-danger) 72%, var(--border-default));
    color: var(--text-primary);
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .queue-status {
    font-size: 0.72rem;
    line-height: 1.4;
    color: color-mix(in srgb, var(--text-primary) 86%, var(--state-danger));
  }

  .queue-time {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .index {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    width: 1.5rem;
    color: var(--text-tertiary);
  }
</style>

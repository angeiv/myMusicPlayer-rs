<script lang="ts">
  import { getPlaybackSurfaceAvailability } from '../utils/track-availability';
  import type { PlaybackStateInfo, Track } from '../types';

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

<div class="queue-root">
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
        {@const selectionBlocked = availability.status === 'blocked'}
        {@const availabilityDescriptionId = availability.description ? `queue-track-availability-${index}` : undefined}
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
              title={availability.description || undefined}
              on:click={() => handleSelect(track, selectionBlocked)}
            >
              <span class="index">{index + 1}</span>
              <div class="queue-copy">
                <p class="queue-title">{track.title}</p>
                <p class="queue-artist">{track.artist_name ?? 'Unknown Artist'}</p>
                {#if availability.badge || availability.description}
                  <div class="queue-meta-line">
                    {#if availability.badge}
                      <span class="availability-badge">{availability.badge}</span>
                    {/if}
                    {#if availability.description}
                      <p id={availabilityDescriptionId} class="queue-status">{availability.description}</p>
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
    border: none;
    border-radius: 999px;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--player-border) 55%, transparent);
    color: rgba(226, 232, 240, 0.95);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .queue-clear:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .queue-empty {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.8);
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
    border: none;
    background: color-mix(in srgb, var(--player-border) 55%, transparent);
    border-radius: 10px;
    padding: 8px 10px;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .queue-item:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  li.active .queue-item {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  li.is-missing .queue-item {
    border: 1px solid rgba(248, 113, 113, 0.18);
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
    border: none;
    border-radius: 10px;
    background: color-mix(in srgb, var(--player-border) 55%, transparent);
    color: rgba(226, 232, 240, 0.95);
    cursor: pointer;
  }

  .queue-remove:hover {
    background: rgba(239, 68, 68, 0.18);
    color: rgba(254, 226, 226, 0.95);
  }

  .queue-title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .queue-artist {
    font-size: 0.75rem;
    color: var(--player-muted);
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
    background: rgba(127, 29, 29, 0.32);
    border: 1px solid rgba(248, 113, 113, 0.35);
    color: rgba(254, 226, 226, 0.95);
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .queue-status {
    font-size: 0.72rem;
    line-height: 1.4;
    color: rgba(254, 226, 226, 0.9);
  }

  .queue-time {
    font-size: 0.75rem;
    color: var(--player-muted);
  }

  .index {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    width: 1.5rem;
  }
</style>

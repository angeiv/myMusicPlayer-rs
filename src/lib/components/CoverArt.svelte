<script lang="ts">
  import { resolveArtworkSrc } from '../utils/artwork';

  export let artworkPath: string | null | undefined = null;
  export let title = '';
  export let alt = '';
  export let className = '';
  export let imageClassName = '';
  export let placeholderClassName = '';

  let imageLoadFailed = false;
  let lastArtworkPath: string | null | undefined = undefined;

  $: if (artworkPath !== lastArtworkPath) {
    lastArtworkPath = artworkPath;
    imageLoadFailed = false;
  }

  $: normalizedTitle = title.trim() || 'Unknown release';
  $: imageAlt = alt.trim() || `${normalizedTitle} cover art`;
  $: artworkSrc = imageLoadFailed ? null : resolveArtworkSrc(artworkPath);
  $: rootClassName = ['cover-art', className].filter(Boolean).join(' ');
  $: resolvedImageClassName = ['cover-art__image', imageClassName].filter(Boolean).join(' ');
  $: resolvedPlaceholderClassName = ['cover-art__placeholder', placeholderClassName]
    .filter(Boolean)
    .join(' ');

  function handleImageError(): void {
    imageLoadFailed = true;
  }
</script>

<div class={rootClassName}>
  {#if artworkSrc}
    <img
      class={resolvedImageClassName}
      src={artworkSrc}
      alt={imageAlt}
      loading="lazy"
      decoding="async"
      on:error={handleImageError}
    />
  {:else}
    <div
      class={resolvedPlaceholderClassName}
      data-testid="cover-art-placeholder"
      role="img"
      aria-label={`${normalizedTitle} cover placeholder`}
    >
      <span class="cover-art__disc" aria-hidden="true">
        <span class="cover-art__disc-ring"></span>
        <span class="cover-art__disc-center"></span>
      </span>
    </div>
  {/if}
</div>

<style>
  .cover-art {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 18px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at top, rgba(148, 163, 184, 0.2), transparent 48%),
      linear-gradient(160deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 16px 34px rgba(15, 23, 42, 0.22);
  }

  .cover-art__image,
  .cover-art__placeholder {
    width: 100%;
    height: 100%;
  }

  .cover-art__image {
    display: block;
    object-fit: cover;
    background: rgba(15, 23, 42, 0.5);
  }

  .cover-art__placeholder {
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at top, rgba(96, 165, 250, 0.16), transparent 42%),
      linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.88));
  }

  .cover-art__disc {
    width: 62%;
    aspect-ratio: 1;
    border-radius: 999px;
    position: relative;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 30% 30%, rgba(191, 219, 254, 0.22), transparent 34%),
      linear-gradient(145deg, rgba(71, 85, 105, 0.9), rgba(15, 23, 42, 0.98));
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.08),
      0 14px 28px rgba(15, 23, 42, 0.34);
  }

  .cover-art__disc-ring {
    position: absolute;
    inset: 16%;
    border-radius: inherit;
    border: 1px solid rgba(191, 219, 254, 0.22);
  }

  .cover-art__disc-center {
    width: 22%;
    aspect-ratio: 1;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.95);
    box-shadow:
      0 0 0 8px rgba(15, 23, 42, 0.88),
      0 0 0 10px rgba(191, 219, 254, 0.18);
  }
</style>

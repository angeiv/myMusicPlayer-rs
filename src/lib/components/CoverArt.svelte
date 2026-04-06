<script lang="ts">
  import { commonCopy } from '../locales/zh-cn';
  import { resolveArtworkSrc } from '../utils/artwork';

  export let artworkPath: string | null | undefined = null;
  export let title = '';
  export let alt: string | null | undefined = undefined;
  export let className = '';
  export let imageClassName = '';
  export let placeholderClassName = '';
  export let variant: 'default' | 'bottom-bar' | 'detail' = 'default';

  const coverArtShapeByVariant = {
    default: 'rounded-square',
    'bottom-bar': 'rounded-square',
    detail: 'rounded-square',
  } as const;

  const coverArtPlaceholderStyleByVariant = {
    default: 'disc-hint',
    'bottom-bar': 'disc-hint',
    detail: 'disc-hint',
  } as const;

  let imageLoadFailed = false;
  let lastArtworkPath: string | null | undefined = undefined;

  $: if (artworkPath !== lastArtworkPath) {
    lastArtworkPath = artworkPath;
    imageLoadFailed = false;
  }

  $: normalizedTitle = title.trim() || commonCopy.unknownRelease;
  $: resolvedAlt = alt == null ? `${normalizedTitle}封面` : alt.trim();
  $: isDecorative = resolvedAlt === '';
  $: artworkSrc = imageLoadFailed ? null : resolveArtworkSrc(artworkPath);
  $: resolvedShape = coverArtShapeByVariant[variant];
  $: resolvedPlaceholderStyle = coverArtPlaceholderStyleByVariant[variant];
  $: rootClassName = ['cover-art', `cover-art--${variant}`, className].filter(Boolean).join(' ');
  $: resolvedImageClassName = ['cover-art__image', imageClassName].filter(Boolean).join(' ');
  $: resolvedPlaceholderClassName = ['cover-art__placeholder', placeholderClassName]
    .filter(Boolean)
    .join(' ');

  function handleImageError(): void {
    imageLoadFailed = true;
  }
</script>

<div
  class={rootClassName}
  data-cover-art-variant={variant}
  data-cover-art-shape={resolvedShape}
>
  {#if artworkSrc}
    <img
      class={resolvedImageClassName}
      src={artworkSrc}
      alt={resolvedAlt}
      loading="lazy"
      decoding="async"
      on:error={handleImageError}
    />
  {:else}
    <div
      class={resolvedPlaceholderClassName}
      data-testid="cover-art-placeholder"
      data-cover-art-placeholder-style={resolvedPlaceholderStyle}
      role={isDecorative ? undefined : 'img'}
      aria-label={isDecorative ? undefined : resolvedAlt}
      aria-hidden={isDecorative ? 'true' : undefined}
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
    inline-size: 100%;
    block-size: auto;
    aspect-ratio: 1;
    position: relative;
    border-radius: 18px;
    overflow: hidden;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 10%, transparent), transparent 48%),
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--surface-panel-subtle) 90%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-panel) 88%, var(--surface-shell))
      );
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text-on-accent) 8%, transparent),
      var(--shadow-soft);
  }

  .cover-art--bottom-bar {
    inline-size: 72px;
    block-size: 72px;
    aspect-ratio: 1;
    border-radius: 16px;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 12%, transparent), transparent 48%),
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--surface-panel-subtle) 95%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-panel) 90%, var(--surface-shell))
      );
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text-on-accent) 7%, transparent),
      0 10px 24px color-mix(in srgb, var(--surface-canvas) 28%, transparent);
  }

  .cover-art--detail {
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 14%, transparent), transparent 50%),
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--surface-panel-subtle) 96%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-panel) 92%, var(--surface-shell))
      );
  }

  .cover-art__image,
  .cover-art__placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .cover-art__image {
    display: block;
    object-fit: cover;
    background: color-mix(in srgb, var(--surface-canvas) 34%, transparent);
  }

  .cover-art--bottom-bar .cover-art__image {
    object-fit: cover;
  }

  .cover-art__placeholder {
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 12%, transparent), transparent 42%),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-panel-subtle) 94%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-panel) 90%, var(--surface-shell))
      );
  }

  .cover-art--bottom-bar .cover-art__placeholder {
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 10%, transparent), transparent 40%),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-panel-subtle) 96%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-panel) 92%, var(--surface-shell))
      );
  }

  .cover-art--detail .cover-art__placeholder {
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 14%, transparent), transparent 42%),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-panel-subtle) 96%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-panel) 92%, var(--surface-shell))
      );
  }

  .cover-art__disc {
    width: 62%;
    aspect-ratio: 1;
    border-radius: 999px;
    position: relative;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--text-on-accent) 18%, transparent), transparent 34%),
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--text-tertiary) 72%, var(--surface-panel-subtle)),
        color-mix(in srgb, var(--surface-canvas) 92%, var(--surface-panel-subtle))
      );
    box-shadow:
      inset 0 1px 1px color-mix(in srgb, var(--text-on-accent) 8%, transparent),
      0 14px 28px color-mix(in srgb, var(--surface-canvas) 34%, transparent);
  }

  .cover-art--bottom-bar .cover-art__disc {
    width: 54%;
  }

  .cover-art__disc-ring {
    position: absolute;
    inset: 16%;
    border-radius: inherit;
    border: 1px solid color-mix(in srgb, var(--text-on-accent) 18%, transparent);
  }

  .cover-art__disc-center {
    width: 22%;
    aspect-ratio: 1;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-primary) 68%, var(--text-on-accent));
    box-shadow:
      0 0 0 8px color-mix(in srgb, var(--surface-canvas) 82%, transparent),
      0 0 0 10px color-mix(in srgb, var(--text-on-accent) 14%, transparent);
  }
</style>

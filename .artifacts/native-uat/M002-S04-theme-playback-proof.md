# M002 / S04 native theme + playback proof

## Verdict

**Pass.** The M002/S04 acceptance matrix was exercised in the real Tauri runtime (`music-player-rs` macOS app), backed by the isolated native-UAT fixture library. Theme persistence, browse chrome, album-detail playback seeding, bottom-bar truth, and Now Playing overlay behavior all held in the native shell.

## Runtime boundary

- Proof source: native Tauri window `Music Player` for app `music-player-rs`
- Fixture setup command: `just native-uat-setup`
- Native first-launch command: `just native-uat-dev`
- Preserved-runtime helper available: `bash scripts/native-uat-resume.sh`
- Regression/preflight gate: `bash scripts/verify-m002-s04-preflight.sh`
- Runtime config file: `.gsd/runtime/native-uat/current/config/config.json`
- Raw configured library root: `/Users/zhangxing/Code/myMusicPlayer-rs/.gsd/runtime/native-uat/current/library`
- Canonical runtime root observed through macOS AX / `realpath`: `/Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library`

## Screen Recording

- `mac_check_permissions` result: Accessibility **enabled**, Screen Recording **not enabled**.
- Consequence: no screenshot evidence is claimed in this proof.
- Evidence style used instead: macOS Accessibility tree (`mac_find` / `mac_get_tree`) plus runtime config reads from the isolated fixture state.

## Settings baseline and theme persistence

Settings was opened in the real Tauri shell before playback proof.

AX-visible baseline state in Settings:
- Heading: `Settings`
- Maintenance title/state: `Full scan complete`
- Auto-sync summary: `Watching 1 folder for automatic sync.`
- Watched folder list present
- Current path present
- Scan summary present with `Files checked 3`, `Added 3`, `Missing 0`, `Errors 0`

Theme loop performed in the native app:
1. Started at `Follow System` selected in the native `Theme options` radio group.
2. Clicked `Light` radio in the native Settings screen.
   - AX state changed to `Light [1]`, `Dark [0]`, `Follow System [0]`.
   - `.gsd/runtime/native-uat/current/config/config.json` updated to `"theme": "light"`.
3. Clicked `Dark` radio in the native Settings screen.
   - AX state changed to `Light [0]`, `Dark [1]`, `Follow System [0]`.
   - `.gsd/runtime/native-uat/current/config/config.json` updated to `"theme": "dark"`.

This retires the native theme-persistence part of the proof: the real runtime accepted both light and dark selections and persisted the chosen value into the isolated config.

## Native browse matrix

The following routes were exercised in the native shell while the dark theme remained selected:

- **Home**
  - Heading: `Home`
  - Secondary heading: `Recently Added Tracks`
  - Secondary heading: `Top Artists`
- **Songs**
  - Heading: `Songs`
  - Summary copy: `3 tracks in your library`
  - Table rows present for `Night Drive`, `Offline Echo`, `Signal Bloom`
- **Albums**
  - Heading: `Albums`
  - Summary copy: `2 albums catalogued`
  - Album cards visible for `Fixture Album A` and `Fixture Album B`
- **Artists**
  - Heading: `Artists`
  - Summary copy: `1 artists discovered`
  - Artist card visible for fixture artist
- **Settings**
  - Heading: `Settings`
  - Maintenance + Theme + Audio + About sections still present under dark theme

The shared top bar and sidebar remained accessible and semantically consistent across the route loop in the native Tauri shell.

## Playback seed path

Playback proof used the required real path:

`Albums -> Fixture Album A -> hero "▶ Play"`

No alternate seed seam was needed.

Native AX evidence immediately after pressing the album hero play button:
- Album detail heading remained `Fixture Album A`
- Bottom-bar current-track trigger changed from `当前没有正在播放内容` to `打开正在播放：Night Drive`
- Progress advanced from `0:00` to `0:08`
- Remaining time showed `-0:37`

This confirmed the hero play button seeded live playback in the native runtime.

## Bottom bar and Now Playing overlay

### Bottom bar

After the album-detail hero play action, the native bottom player exposed truthful state:
- Current-track trigger: `打开正在播放：Night Drive`
- Progress slider visible and advancing
- Transport controls visible: previous / play-pause / next
- Queue trigger visible
- Output device trigger visible

### Now Playing overlay

The Now Playing overlay was opened from the bottom-bar current-track trigger in the native app.

AX-visible overlay state on first open:
- Overlay heading: `正在播放`
- Subtitle: `Fixture Artist · Fixture Album A`
- Tabs present: `歌词`, `队列`
- Active tab on open: `歌词 [1]`
- Track summary title: `Night Drive`
- Track summary album: `Fixture Album A`
- Track summary duration: `0:45`
- Track summary queue count initially refreshed from `0 首` to `2 首` after queue-tab activation
- Lyrics panel showed the expected empty-state copy: `暂无歌词` / `当前歌曲还没有可显示的歌词内容。`

### Queue tab

After activating the queue tab in the native overlay:
- Tab state changed to `歌词 [0]`, `队列 [1]`
- Queue count in the summary updated to `2 首`
- Queue actions visible: `清空队列`
- Queue entries visible:
  - `1 Night Drive Fixture Artist 0:45`
  - `2 Signal Bloom Fixture Artist 0:45`
- Per-row remove action visible for the second queued track

This satisfies the Now Playing overlay / lyrics / queue native acceptance surface.

## Route-change continuity while playback was live

The app was navigated away from album detail while playback continued.

Observed native continuity:
- After returning to **Home**, the bottom bar truthfully advanced to the next track and exposed `打开正在播放：Signal Bloom` with a live progress readout (`0:17`, then later `0:28`).
- After navigating to **Settings**, the bottom bar still showed `打开正在播放：Signal Bloom` and continued advancing (`0:28`).
- Opening the Now Playing overlay again from **Settings** showed the same live playback context:
  - Overlay heading: `正在播放`
  - Track title: `Signal Bloom`
  - Album: `Fixture Album A`
  - Queue count: `2 首`
  - Lyrics tab still present and truthful for the current track

This demonstrates that route changes did not desynchronize the bottom player or the Now Playing overlay from the actual playback state.

## Notes and honest gaps

- No screenshots are attached because Screen Recording permission was unavailable during this run.
- The watcher-root string exposed through AX used the runtime's canonical realpath under `~/.gsd/projects/...`, while the persisted config still used the repo-local `.gsd/runtime/...` path. `realpath` confirmed they are the same isolated runtime, so this is a path-representation difference, not a second library.
- The first overlay snapshot showed queue count `0 首` before the queue tab refreshed. Activating the queue tab immediately corrected the native state to `2 首` and exposed the expected queue entries. The proof therefore relies on the post-refresh queue state, not the transient pre-refresh count.

## Final statement

M002/S04 native theme, browse, and playback acceptance passes in the real Tauri shell. The proof came from the native window, theme choices persisted to the isolated runtime config, playback was seeded from the album-detail hero play button, and the bottom bar plus Now Playing overlay remained truthful through route changes.

# M002 / S04 native maintenance, watcher, and recovery proof

## Verdict

**Pass.** The M002/S04 maintenance and recovery matrix now holds in the real Tauri runtime backed by the isolated native-UAT library. Startup, watcher-triggered maintenance, manual recovery, Settings maintenance copy, and the passive TopBar cue agree on the same state. The final rerun also confirms a conservative **no mass-missing** outcome when an unavailable root is introduced and then removed.

## Runtime boundary

- Proof source: native `music-player-rs` macOS window only
- Fixture setup / gate: `bash scripts/verify-m002-s04-preflight.sh`
- Preserved-runtime relaunch path used for restart-based acceptance: `bash scripts/native-uat-resume.sh`
- Teardown path: `just native-uat-teardown`
- Runtime config: `.gsd/runtime/native-uat/current/config/config.json`
- Runtime database: `.gsd/runtime/native-uat/current/data/library.sqlite`
- Fixture library from config: `/Users/zhangxing/Code/myMusicPlayer-rs/.gsd/runtime/native-uat/current/library`
- Canonical library realpath observed through AX / SQLite / `realpath`: `/Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library`

## Screen Recording

- `mac_check_permissions`: Accessibility enabled, Screen Recording disabled.
- No screenshots are claimed in this proof.
- Evidence source is macOS Accessibility, runtime config reads, SQLite truth, and native dev-session logs.

## Canonical-path handling

The native UI, SQLite rows, and on-disk config do not all render the library root the same way on macOS:

- Config library root: `/Users/zhangxing/Code/myMusicPlayer-rs/.gsd/runtime/native-uat/current/library`
- AX watched root / SQLite `library_root`: `/Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library`

`realpath` confirmed both resolve to the same directory before any comparisons were treated as valid:

- `realpath .gsd/runtime/native-uat/current/library`
- `realpath /Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library`

Both resolved to `/Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library`.

## Clean startup baseline

Fresh native startup on the isolated runtime reached the shipped Settings maintenance surface with a clean baseline:

- Settings headline: `Full scan complete`
- Settings description: `Watching 1 folder for changes. The last pass finished cleanly.`
- Auto-sync summary: `Watching 1 folder for automatic sync.`
- Watched folders list: canonical runtime root only
- Current path: `.../Fixture Album B/01-offline-echo.wav`
- Scan summary:
  - Files checked: `3`
  - Added: `3`
  - Changed: `0`
  - Unchanged: `0`
  - Restored: `0`
  - Missing: `0`
  - Errors: `0`
- SQLite truth before watcher mutations:
  - track rows: `3`
  - missing rows: `0`
  - titles: `Night Drive`, `Offline Echo`, `Signal Bloom`

Startup log evidence:

- `[2026-04-04][03:46:35][music_player_rs::api::library][INFO] Starting Full library scan for 1 path(s)`

## Watcher-driven filesystem mutation matrix

All watcher mutations were applied against `.gsd/runtime/native-uat/current/library` while the native Settings screen was open.

### Add: copy one fixture track into `incoming/`

Mutation:

- Copied `Fixture Album B/01-offline-echo.wav` to `incoming/99-watcher-add-offline-echo.wav`
- Canonical added path: `/Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library/incoming/99-watcher-add-offline-echo.wav`

Native log evidence:

- `[2026-04-04][03:49:28][music_player_rs::api::library][INFO] Starting Incremental library scan for 1 path(s)`
- `[2026-04-04][03:49:28][lofty::probe][DEBUG] Probe: Opening "/Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library/incoming/99-watcher-add-offline-echo.wav" for reading`

Settings evidence after settle:

- Headline: `Incremental sync complete`
- Description: `Watching 1 folder for changes. The last pass finished cleanly.`
- Scan summary:
  - Files checked: `4`
  - Added: `1`
  - Changed: `0`
  - Unchanged: `3`
  - Restored: `0`
  - Missing: `0`
  - Errors: `0`
- Sidebar song count updated to `Songs 4`

SQLite truth after settle:

- track rows: `4`
- missing rows: `0`
- added row present:
  - `Offline Echo | /Users/zhangxing/.gsd/projects/433560243004/runtime/native-uat/current/library/incoming/99-watcher-add-offline-echo.wav | available`

### Modify: update the designated fixture track mtime

Mutation:

- Touched `Fixture Album A/01-signal-bloom.wav`
- Filesystem mtime changed from `1775274256` to `1775274610`

Native log evidence:

- `[2026-04-04][03:50:12][music_player_rs::api::library][INFO] Starting Incremental library scan for 1 path(s)`

Settings evidence after settle:

- Headline: `Incremental sync complete`
- Scan summary:
  - Files checked: `4`
  - Added: `0`
  - Changed: `1`
  - Unchanged: `3`
  - Restored: `0`
  - Missing: `0`
  - Errors: `0`

SQLite truth after settle:

- `Signal Bloom | 1775274610503 | available`
- track rows remained `4`
- missing rows remained `0`

### Delete: remove the planned restore target from the watched root

Mutation:

- Moved `Fixture Album A/02-night-drive.wav` out of the library root into `.gsd/runtime/native-uat/current/staging/02-night-drive.wav`

Native log evidence:

- `[2026-04-04][03:50:49][music_player_rs::api::library][INFO] Starting Incremental library scan for 1 path(s)`

Settings evidence after settle:

- Headline: `Incremental sync complete`
- Description: `Watching 1 folder for changes. The last pass finished with issues.`
- Recommended next step surfaced: `Rescan Now`
- Scan summary:
  - Files checked: `3`
  - Added: `0`
  - Changed: `0`
  - Unchanged: `3`
  - Restored: `0`
  - Missing: `1`
  - Errors: `0`

SQLite truth after settle:

- track rows remained `4`
- missing rows: `1`
- affected row only:
  - `Night Drive | missing | 1775274649`
- other rows remained `available`

This is the first direct proof that delete handling stayed conservative: the watcher did **not** convert the whole library into missing rows.

### Restore: move the same track back into the watched root

Mutation:

- Moved `.gsd/runtime/native-uat/current/staging/02-night-drive.wav` back to `Fixture Album A/02-night-drive.wav`

Native log evidence:

- `[2026-04-04][03:51:19][music_player_rs::api::library][INFO] Starting Incremental library scan for 1 path(s)`

Settings evidence after settle:

- Headline: `Incremental sync complete`
- Description: `Watching 1 folder for changes. The last pass finished cleanly.`
- Scan summary:
  - Files checked: `4`
  - Added: `0`
  - Changed: `0`
  - Unchanged: `3`
  - Restored: `1`
  - Missing: `0`
  - Errors: `0`

SQLite truth after settle:

- track rows: `4`
- missing rows: `0`
- `Night Drive | available | <null missing_since>`

## Shared maintenance semantics

The native app kept startup, watcher, and manual recovery on the same shipped maintenance surfaces:

- Startup used `Full scan complete` in Settings.
- Watcher updates used `Incremental sync complete` plus the same Settings summary cards.
- Manual recovery reused the same `Rescan Now` action in Settings after the unavailable-root warning was fixed.
- The TopBar stayed lightweight and only exposed a passive cue when attention was needed.

## unavailable root attention + recovery

### Fault injection and preserved-runtime relaunch

I appended the planned unavailable root to the isolated config and relaunched with the preserved-runtime helper, not `just native-uat-dev`:

- unavailable root path: `/Users/zhangxing/Code/myMusicPlayer-rs/.gsd/runtime/native-uat/current/library/offline-root-mount`
- relaunch command: `bash scripts/native-uat-resume.sh`

Relaunch log evidence:

- `[2026-04-04][03:53:30][music_player_rs::api::library][INFO] Starting Incremental library scan for 2 path(s)`
- Rerun after the backend fix: `[2026-04-04][04:00:16][music_player_rs::api::library][INFO] Starting Incremental library scan for 2 path(s)`

### Attention state in Home / TopBar

On Home, the passive shell cue appeared in the native top bar exactly when the maintenance state needed attention:

- AX link: `Open maintenance details in Settings`
- cue title: `Auto-sync needs attention`
- cue detail: `Open Settings to review`

### Attention state in Settings

Settings showed the detailed recovery surface while keeping the good library root live:

- Headline: `Auto-sync needs attention`
- Description: `Watching 1 folder, but the last watcher update failed before a follow-up sync could start.`
- Folder list still contained the good root **and** the unavailable root entry so the operator could remove it
- Auto-sync summary still said `Watching 1 folder for automatic sync.`
- Watched folders list still showed the canonical good root only
- Scan summary:
  - Files checked: `4`
  - Added: `0`
  - Changed: `0`
  - Unchanged: `4`
  - Restored: `0`
  - Missing: `0`
  - Errors: `1`
- Watcher callout: `Rejected watcher roots: /Users/zhangxing/Code/myMusicPlayer-rs/.gsd/runtime/native-uat/current/library/offline-root-mount`
- Sample scan error: `/Users/zhangxing/Code/myMusicPlayer-rs/.gsd/runtime/native-uat/current/library/offline-root-mount — Root path does not exist or is not a directory`
- Recovery guidance: `After fixing the watcher problem or folder access, use Rescan Now to confirm the library state.`

### SQLite truth during unavailable-root attention

The attention state stayed conservative:

- track rows stayed `4`
- missing rows stayed `0`
- every row remained `available`

This is the critical unavailable-root **no mass-missing** proof.

## Real regression found during proof

The first recovery attempt exposed a real backend defect.

Observed failure before the fix:

- Removing the unavailable root through Settings correctly updated `config.json` back to the single good root.
- Pressing `Rescan Now` correctly launched `Starting Incremental library scan for 1 path(s)`.
- SQLite stayed correct (`4` rows, `0` missing, no unavailable-root path in config), and the scan summary had `Errors: 0`.
- But Settings still rendered `Auto-sync needs attention` and kept the stale watcher message `Rejected watcher roots: ...offline-root-mount`.

Root cause:

- `WatcherCoordinatorState` cleared `last_runtime_error` / `last_scheduler_error` but never reconciled the public `last_error` field, so the UI kept showing stale attention after a clean watcher refresh.

Shipped fix:

- File: `src-tauri/src/services/library/watcher.rs`
- Change: reconcile `last_error` whenever runtime or scheduler errors change, including the clear path.
- Regression test added: `watcher_runtime_refresh_clears_last_error_after_recovery`

Targeted proof for the fix:

- `cargo test --manifest-path ./src-tauri/Cargo.toml watcher_runtime_ -- --nocapture`
- Result: `7 passed; 0 failed`

## Recovery after the fix

I reran the unavailable-root sequence on the patched native runtime.

Recovery steps:

1. Start from the unavailable-root attention state above.
2. In native Settings, click `Remove folder .../offline-root-mount`.
3. Confirm `.gsd/runtime/native-uat/current/config/config.json` returns to the single good root.
4. Click native `Rescan Now`.
5. Wait for the incremental pass to settle.

Recovery log evidence:

- `[2026-04-04][04:01:53][music_player_rs::api::library][INFO] Starting Incremental library scan for 1 path(s)`

Settings evidence after the fixed recovery settles:

- Headline: `Incremental sync complete`
- Description: `Watching 1 folder for changes. The last pass finished cleanly.`
- Scan summary:
  - Files checked: `4`
  - Added: `0`
  - Changed: `0`
  - Unchanged: `4`
  - Restored: `0`
  - Missing: `0`
  - Errors: `0`
- The stale watcher-error callout is gone.
- The stale `Auto-sync needs attention` headline is gone.

Home / TopBar evidence after recovery:

- Home tree no longer exposes the `Open maintenance details in Settings` link.
- The passive attention cue disappears once the watcher error is actually cleared.

Config and SQLite truth after recovery:

- Config `library_paths` contains only the good root.
- SQLite track rows: `4`
- SQLite missing rows: `0`
- all rows remain `available`

## Final no mass-missing statement

The full native acceptance loop passes:

- watcher proof covered **add, modify, delete, and restore** against the isolated fixture library;
- unavailable root attention was surfaced through the shipped Settings and TopBar surfaces after a **preserved-runtime relaunch**;
- the fixed recovery path removed the bad root through Settings, ran a manual rescan, and returned the app to `Incremental sync complete` with no stale warning;
- SQLite truth stayed conservative throughout, with **no mass-missing** outcome during unavailable-root attention or recovery.

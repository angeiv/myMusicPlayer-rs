# Songs List Enhancement Design

Date: 2026-03-25
Status: Draft for review
Scope: First-phase enhancement of the library songs list in the desktop player

## Summary

This spec defines the first phase of the songs list upgrade so the library view behaves like a desktop music player rather than a static table. The focus is narrow and intentional: add desktop-style multi-selection, batch actions, and queue-aware playback semantics without expanding into destructive file management, general-purpose data grids, or unrelated application refactors.

The implementation will target the songs list only. It will introduce a reusable songs-list feature layer so the interaction model can be reused later in album, artist, and playlist detail views, but those views are explicitly out of scope for this phase.

## User-Approved Product Decisions

These choices were confirmed during design:

- The first subproject is **songs list functionality**, not the entire player.
- The first priority is **batch management**.
- First-phase actions must include:
  - **Add to playlist**
  - **Add to playback queue**
  - **Play selected**
- Multi-selection must use **desktop-style selection**:
  - single click to select
  - `Shift` range select
  - `Cmd`/`Ctrl` toggle select
  - double click to play
- **Play selected** means:
  - replace the current playback queue with the selected songs
  - preserve the current visible ordering from the songs list
  - start playback from the current active row when that row is part of the selection
  - otherwise fall back to the first selected track in visible order

## Current State

The existing `SongsView` already supports:

- rendering the songs library table
- text filtering through the shell search term
- client-side sorting by title, album, artist, duration, and added date
- double-click playback
- a minimal right-click menu shell

The existing backend and bridges already provide the APIs needed for first-phase actions:

- playback queue replacement
- playback of a specific track
- queue append
- playlist creation and playlist track insertion
- playlist retrieval for UI menus

The main gap is not backend capability. The missing pieces are songs-list interaction state, batch-action semantics, and UI affordances.

## Goals

1. Make the songs list feel like a desktop music player.
2. Support batch operations on one or more songs.
3. Preserve predictable playback semantics based on the visible list order.
4. Keep the first phase limited enough to be implemented and tested safely.
5. Improve code structure by extracting songs-list logic from the large Svelte view.

## Non-Goals

The following are explicitly out of scope for this phase:

- deleting local files
- removing files from disk or moving them to trash
- removing tracks from the library database
- drag-and-drop reordering in the songs list
- configurable columns
- virtualized rendering for extremely large lists
- full file-manager-grade keyboard navigation
- reuse of the new interaction model in album/artist/playlist detail views during this phase
- redesign of theme settings, playlists pages, or playback modes outside what is required for songs-list actions

## Approaches Considered

### Option 1: Extend `SongsView.svelte` in place

Add all selection state, menus, and batch logic directly inside `src/lib/views/SongsView.svelte`.

**Pros**
- smallest initial diff
- fastest path to a visible feature

**Cons**
- grows an already busy component
- makes testing selection logic harder
- discourages reuse in other track-list surfaces

### Option 2: Add a songs-list feature layer and keep `SongsView` as the page shell

Extract selection logic, actions, and smaller UI components while keeping `SongsView` responsible for page composition.

**Pros**
- clear boundaries between interaction rules, business actions, and UI
- easier unit testing for the most error-prone behavior
- supports future reuse without building a heavy generic grid now

**Cons**
- slightly more up-front structure than patching the view directly

### Option 3: Build a generic reusable data-grid framework

Create a fully generic list/grid abstraction for songs, albums, playlists, and other tabular screens.

**Pros**
- strongest long-term abstraction

**Cons**
- over-scoped for the current need
- higher risk of design churn
- delays delivery of the actual songs-list upgrade

## Chosen Approach

Use **Option 2**.

This keeps the first phase focused on the songs list while still improving maintainability. It avoids both extremes: continuing to overload one view file and prematurely building a generic grid framework.

## Functional Design

### Songs list interaction model

Each visible row may have independent state flags:

- **playing**: the row represents the currently playing track
- **selected**: the row belongs to the current multi-selection set
- **active**: the row is the current focus anchor for actions and range selection
- **hovered**: the row is currently under the cursor

These states do not replace one another. A row may be both `playing` and `selected`.

### Selection behavior

The songs list will use desktop-style selection rules.

#### Single click
- clear previous selection
- select only the clicked row
- set that row as the active row
- set that row as the selection anchor

#### Cmd/Ctrl + click
- toggle the clicked row in the selected set
- set that row as the active row
- set that row as the selection anchor
- preserve other selected rows

#### Shift + click
- if an anchor exists, select the inclusive visible range between anchor and clicked row
- set the clicked row as the active row
- preserve desktop-style predictable range semantics based on the current visible ordering
- if no anchor exists, fall back to selecting only the clicked row

#### Double click
- preserve the current direct-play behavior
- replace the playback queue with the current visible songs order
- start playback from the double-clicked track

### Right-click behavior

Right-click must follow desktop music-player expectations:

- if the user right-clicks an unselected row, selection becomes that single row, then the menu opens
- if the user right-clicks a row already in the selected set, keep the full selection unchanged, then open the menu

This allows single-item and multi-item context actions without surprising selection changes.

### Batch action bar

When one or more rows are selected, show a batch action bar above the songs table.

The bar will display:

- selected count
- play selected
- add to queue
- add to playlist
- clear selection

This provides a visible action surface so users do not depend entirely on right-click menus.

### Play selected semantics

When the user invokes **Play selected**:

1. derive the selected tracks from the current visible songs list
2. preserve the visible order after current filtering and sorting
3. replace the playback queue with exactly those selected tracks
4. start playback from the active track if it is part of the selected set
5. otherwise start from the first selected track in visible order

This behavior is deterministic and matches the user-approved requirement.

### Add to queue semantics

When the user invokes **Add to queue**:

- derive selected tracks from the current visible songs list
- preserve visible order
- append them to the playback queue through the existing playback API

### Add to playlist semantics

When the user invokes **Add to playlist**:

- show a lightweight playlist chooser populated from existing playlists
- allow the action to apply to the full selected set
- insert tracks in visible order
- keep the current selection after the operation

This phase assumes the destination playlist already exists or is created elsewhere via existing playlist flows.

## State and Architecture

### High-level structure

`SongsView` remains the page shell, but songs-list interaction rules move into a dedicated feature layer.

### Proposed module boundaries

#### `src/lib/views/SongsView.svelte`
Page composition only.

Responsibilities:
- receive tracks, loading state, and search term
- derive visible tracks through the extracted sort/filter logic
- hold local UI state for menus and selection
- wire UI events to actions
- render child components

#### `src/lib/features/songs-list/selection.ts`
Pure selection behavior.

Responsibilities:
- represent selection state
- apply single-click, modifier-click, shift-range, and right-click transitions
- clear selection
- reconcile selection state when the visible dataset changes

This module should be implemented as pure functions over an explicit state object so it can be tested independently.

#### `src/lib/features/songs-list/sort-filter.ts`
Visible-list derivation.

Responsibilities:
- filter tracks by search term
- sort tracks by the supported columns and direction
- return the visible order used by both UI rendering and batch-action semantics

#### `src/lib/features/songs-list/actions.ts`
Songs-list business actions.

Responsibilities:
- transform selection state plus visible tracks into concrete action payloads
- execute play selected, add to queue, and add to playlist actions through existing APIs
- return structured success/failure summaries so the view can present feedback

#### `src/lib/components/songs/SongsTable.svelte`
Presentational songs table.

Responsibilities:
- render table header and rows
- show playing, selected, and active row states
- emit interaction events for click, double click, key handling, and context menu
- remain API-agnostic

#### `src/lib/components/songs/SongsBulkActionBar.svelte`
Presentational batch action surface.

Responsibilities:
- show selected count
- emit action events
- stay free of business logic

#### `src/lib/components/songs/SongsContextMenu.svelte`
Presentational context menu.

Responsibilities:
- show actions relevant to the current selection
- emit action events
- close when requested by the parent

### State ownership

Keep songs-list interaction state local to `SongsView`.

Local page state includes:
- `sortKey`
- `sortDirection`
- `selectedIds`
- `activeTrackId`
- `anchorTrackId`
- context-menu open/position state
- playlist-picker open/anchor state
- transient action feedback state

Global application state remains where it already belongs:
- library tracks in the app-shell store
- playlists in the app-shell store
- playback and queue state in the playback store / existing playback APIs

This keeps the first phase focused and avoids inventing a new global store for page-local interaction state.

## Data Flow

### Visible list derivation

`SongsView` will derive `visibleTracks` from the incoming library tracks and current search/sort state through `sort-filter.ts`. All row rendering and batch actions must consume this same `visibleTracks` list so behavior stays consistent.

### Selection reconciliation

Whenever `visibleTracks` or the underlying tracks dataset changes, `selection.ts` must reconcile state by:

- removing selected IDs that no longer exist in the current dataset
- clearing `activeTrackId` if that track no longer exists
- clearing `anchorTrackId` if that track no longer exists

Selected IDs that still exist but are merely hidden by current filtering may remain in state, but actions in the songs list page operate only on the subset that is currently visible. This preserves consistency with user expectations in a filtered view.

### Action execution

#### Play selected
- compute ordered selected tracks from `visibleTracks`
- call playback queue replacement with those tracks
- call play-track for the chosen starting track

#### Add to queue
- compute ordered selected tracks from `visibleTracks`
- call queue append with the full ordered selection

#### Add to playlist
- compute ordered selected tracks from `visibleTracks`
- call playlist insertion for each selected track in order
- report whether the result was complete success, partial success, or total failure

## Error Handling

### General principles

- never silently drop a failed batch action
- do not clear selection automatically on failure
- close transient menus after action completion, but preserve selection so the user can retry or run another action

### Add to playlist

This action may fail per-track.

Required behavior:
- if all inserts succeed, report success
- if some inserts fail, report partial success with completed count and total count
- if all inserts fail, report failure

### Add to queue

Required behavior:
- if queue append fails, report failure and preserve selection

### Play selected

Required behavior:
- if queue replacement fails, stop and report failure
- if queue replacement succeeds but play-track fails, report failure and preserve selection

### Menu behavior

- clicking outside the context menu closes it
- `Escape` closes the context menu or playlist picker if open
- successful actions close the menu/picker that launched them
- selection remains until the user clears it or changes it

## Visual and UX Requirements

### Row styling

The songs table must visually distinguish:

- selected rows
- active row
- currently playing row
- hover state

`playing` must remain visible even when the row is selected.

### Batch action visibility

The batch action bar appears only when at least one visible row is selected.

### Empty states

The page must continue to show:
- loading state while the library is refreshing
- empty-search state when no visible songs match the current search term

## Testing Strategy

The first phase should prioritize tests for logic that is easy to regress.

### `selection.ts` tests

Cover:
- single-click single selection
- Cmd/Ctrl toggle selection
- Shift range selection
- Shift behavior without an anchor
- right-click on unselected rows
- right-click on already selected rows
- selection reconciliation after dataset change

### `sort-filter.ts` tests

Cover:
- title / artist / album filtering
- supported sort keys
- ascending and descending order
- stable, predictable visible ordering

### `actions.ts` tests

Cover:
- play selected uses visible order
- active track is preferred as playback start when selected
- fallback to first selected visible track when active track is absent or unselected
- add to queue preserves visible order
- add to playlist reports success / partial success / failure correctly

### Songs view integration tests

Cover:
- batch action bar visibility
- right-click menu visibility and targeting behavior
- component wiring from UI events to action calls
- selected count updates
- playing row styling hook-up

## Implementation Plan Boundaries

The implementation plan that follows this spec should remain within these boundaries:

1. extract and test pure songs-list logic first
2. add action orchestration second
3. split presentational UI components third
4. integrate into `SongsView` without changing unrelated application surfaces
5. run frontend tests, frontend checks, and backend regression tests before completion

## Acceptance Criteria

This first phase is complete when all of the following are true:

- the songs list supports desktop-style multi-selection
- the songs list can batch add selected songs to a playlist
- the songs list can batch append selected songs to the playback queue
- the songs list can replace the queue with selected songs and start from the active selected row
- right-click behavior matches the approved desktop semantics
- selected, active, and playing states are visually distinguishable
- the first-phase logic is covered by automated frontend tests
- existing backend regression tests still pass

## Risks and Mitigations

### Risk: selection rules become inconsistent across filtering and sorting
Mitigation: centralize selection transitions in a pure module and centralize visible-order derivation in `sort-filter.ts`.

### Risk: `SongsView` remains too large even after extraction
Mitigation: keep `SongsView` as orchestration only and push interaction rules plus UI fragments into dedicated modules/components.

### Risk: partial playlist failures create confusing UX
Mitigation: return structured results from actions and show explicit completed/failed counts.

## Follow-on Opportunities

These are intentionally deferred, not part of the first-phase implementation plan:

- reuse the same songs-list behavior in album, artist, and playlist detail screens
- add keyboard shortcut expansion beyond click-based desktop semantics
- support destructive library actions with explicit confirmation and platform-safe behavior
- introduce list virtualization if large-library performance requires it
- evolve the songs list extraction into a broader reusable track-list framework if repeated patterns justify it

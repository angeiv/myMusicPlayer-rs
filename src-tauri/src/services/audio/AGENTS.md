# src-tauri/src/services/audio (Audio Runtime)

## Overview
Playback orchestration (threaded), queue semantics, decoding, and visualization analysis.

## Where To Look
- Facade service (used by API): `src-tauri/src/services/audio/mod.rs`.
- Playback thread + command protocol: `src-tauri/src/services/audio/audio_player_thread.rs`.
- Queue semantics + tests: `src-tauri/src/services/audio/play_queue.rs`.
- Player state + helpers: `src-tauri/src/services/audio/player.rs`.
- Decoder wrapper: `src-tauri/src/services/audio/decoder.rs`.
- Analyzer (FFT/visualization): `src-tauri/src/services/audio/analyzer.rs`.

## Conventions
- Public surface should be owned by `AudioPlayerHandle`/`AudioService` and called from API layer.
- Keep queue rules/test coverage in `play_queue.rs` (this repo already uses it as the main template).

## Anti-Patterns
- Avoid returning borrowed references backed by `unsafe` TLS caches: `src-tauri/src/services/audio/mod.rs` (`current_track`).
- Avoid placeholder API behavior that looks complete: `src-tauri/src/services/audio/mod.rs` (`get_queue` currently returns empty).
- Avoid `unwrap` in analyzer/player runtime paths; map errors upward.

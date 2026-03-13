#!/usr/bin/env bash
set -euo pipefail

export TAURI_OPEN_DEVTOOLS=1
exec bash "${BASH_SOURCE%/*}/dev.sh"

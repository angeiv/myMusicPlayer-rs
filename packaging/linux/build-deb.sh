#!/usr/bin/env bash
set -euo pipefail

# Historical helper. Canonical path: repo root -> just package-linux
# No current repo-root .deb packaging contract exists.

script_path="packaging/linux/build-deb.sh"

printf '%s\n' "${script_path}: Historical helper. Canonical path: repo root -> just package-linux" >&2
printf '%s\n' "${script_path}: No current repo-root .deb packaging contract exists." >&2
printf '%s\n' "${script_path}: Linux remains a proof-only bundle lane; use just package-linux for the current Tauri path." >&2
exit 1

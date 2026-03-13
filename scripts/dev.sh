#!/usr/bin/env bash
set -euo pipefail

frontend_dir="${FRONTEND_DIR:-src}"
backend_dir="${BACKEND_DIR:-src-tauri}"
frontend_port="${FRONTEND_PORT:-1420}"
tauri_dev_url="${TAURI_DEV_URL:-http://localhost:${frontend_port}}"

frontend_pid=""
backend_pid=""
cleanup_ran=0

cleanup() {
  if [[ "${cleanup_ran}" == "1" ]]; then
    return
  fi
  cleanup_ran=1

  if [[ -n "${backend_pid}" ]]; then
    kill -TERM "${backend_pid}" 2>/dev/null || true
  fi

  if [[ -z "${frontend_pid}" ]]; then
    if [[ -n "${backend_pid}" ]]; then
      sleep 0.2
      kill -KILL "${backend_pid}" 2>/dev/null || true
      wait "${backend_pid}" 2>/dev/null || true
    fi
    return
  fi

  frontend_pgid="$(ps -o pgid= "${frontend_pid}" 2>/dev/null | tr -d ' ' || true)"
  if [[ -n "${frontend_pgid}" ]]; then
    kill -TERM -- "-${frontend_pgid}" 2>/dev/null || true
  fi

  kill -TERM "${frontend_pid}" 2>/dev/null || true
  sleep 0.2

  if [[ -n "${frontend_pgid}" ]]; then
    kill -KILL -- "-${frontend_pgid}" 2>/dev/null || true
  fi
  kill -KILL "${frontend_pid}" 2>/dev/null || true

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:${frontend_port} -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      kill -TERM ${pids} 2>/dev/null || true
      sleep 0.2
      kill -KILL ${pids} 2>/dev/null || true
    fi
  fi

  wait "${frontend_pid}" 2>/dev/null || true

  if [[ -n "${backend_pid}" ]]; then
    sleep 0.2
    kill -KILL "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'cleanup; exit 0' INT TERM

if command -v setsid >/dev/null 2>&1; then
  setsid npm --prefix "${frontend_dir}" run dev &
else
  npm --prefix "${frontend_dir}" run dev &
fi

frontend_pid=$!

(
  cd "${backend_dir}"
  TAURI_DEV_URL="${tauri_dev_url}" cargo tauri dev
) &

backend_pid=$!
wait "${backend_pid}"

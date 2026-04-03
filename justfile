# Development tasks for the Tauri Music Player

set shell := ["bash", "-lc"]
set windows-shell := ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]

frontend_dir := "src"
backend_dir := "src-tauri"
npm_bin := if os() == "windows" { "npm.cmd" } else { "npm" }

default:
    @just --list

# Install development dependencies
[unix]
install:
    @command -v rustup >/dev/null 2>&1 || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    {{npm_bin}} --prefix {{frontend_dir}} install
    @command -v cargo-tauri >/dev/null 2>&1 || cargo install tauri-cli --locked

[windows]
install:
    if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) { Write-Error "rustup not found. Install Rust first: https://www.rust-lang.org/tools/install"; exit 1 }
    {{npm_bin}} --prefix {{frontend_dir}} install
    if (-not (Get-Command cargo-tauri -ErrorAction SilentlyContinue)) { cargo install tauri-cli --locked }

# Check code quality
check:
    cargo fmt --manifest-path {{backend_dir}}/Cargo.toml -- --check
    cargo clippy --manifest-path {{backend_dir}}/Cargo.toml --all-targets -- -D warnings
    {{npm_bin}} --prefix {{frontend_dir}} run check

# Run tests
test:
    cargo test --manifest-path {{backend_dir}}/Cargo.toml --all-features -- --nocapture

# Run tests with coverage (requires cargo-tarpaulin)
coverage:
    @echo "Install cargo-tarpaulin first: cargo install cargo-tarpaulin"
    # Example usage:
    # cargo tarpaulin --manifest-path {{backend_dir}}/Cargo.toml --all-features --ignore-tests --out Lcov --output-dir target/tarpaulin
    # @echo "Coverage report generated at target/tarpaulin/lcov.info"

# Run all code quality checks
qa: check test

# Update dependencies
update:
    {{npm_bin}} --prefix {{frontend_dir}} update
    cargo update --manifest-path {{backend_dir}}/Cargo.toml

# Clean build artifacts
[unix]
clean:
    cargo clean --manifest-path {{backend_dir}}/Cargo.toml
    rm -rf dist
    rm -rf {{backend_dir}}/target
    rm -rf {{frontend_dir}}/node_modules

[windows]
clean:
    cargo clean --manifest-path {{backend_dir}}/Cargo.toml
    if (Test-Path dist) { Remove-Item -Recurse -Force dist }
    if (Test-Path {{backend_dir}}/target) { Remove-Item -Recurse -Force {{backend_dir}}/target }
    if (Test-Path {{frontend_dir}}/node_modules) { Remove-Item -Recurse -Force {{frontend_dir}}/node_modules }

# Build the project in debug mode
build:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo build --manifest-path {{backend_dir}}/Cargo.toml

# Build the project in release mode
release:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo build --manifest-path {{backend_dir}}/Cargo.toml --release

# Format code
[unix]
fmt:
    cargo fmt --manifest-path {{backend_dir}}/Cargo.toml --all
    if {{npm_bin}} --prefix {{frontend_dir}} exec -- prettier --version >/dev/null 2>&1; then {{npm_bin}} --prefix {{frontend_dir}} exec -- prettier --write .; else echo "Prettier not found. Install it with 'npm --prefix {{frontend_dir}} install --save-dev prettier' to enable frontend formatting."; fi

[windows]
fmt:
    cargo fmt --manifest-path {{backend_dir}}/Cargo.toml --all
    {{npm_bin}} --prefix {{frontend_dir}} exec -- prettier --version *> $null; if ($LASTEXITCODE -eq 0) { {{npm_bin}} --prefix {{frontend_dir}} exec -- prettier --write . } else { Write-Host "Prettier not found. Install it with 'npm --prefix {{frontend_dir}} install --save-dev prettier' to enable frontend formatting." }

# Package for all platforms
package:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml

# Package for Windows
[unix]
package-windows:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target x86_64-pc-windows-msvc

[windows]
package-windows:
    powershell -NoProfile -ExecutionPolicy Bypass -File packaging/windows/build.ps1

# Package for macOS
package-macos:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target aarch64-apple-darwin
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target x86_64-apple-darwin

# Package for Linux
package-linux:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target x86_64-unknown-linux-gnu

# Run the application in development mode
[unix]
dev:
    bash scripts/dev.sh

# Prepare an isolated native-UAT fixture runtime.
native-uat-setup:
    cargo run --manifest-path {{backend_dir}}/Cargo.toml --bin native-uat-fixture -- setup

# Tear down the isolated native-UAT fixture runtime.
native-uat-teardown:
    cargo run --manifest-path {{backend_dir}}/Cargo.toml --bin native-uat-fixture -- teardown

# Run the application in development mode against the isolated native-UAT fixture runtime.
[unix]
native-uat-dev:
    set -euo pipefail; cargo run --manifest-path {{backend_dir}}/Cargo.toml --bin native-uat-fixture -- setup >/dev/null; source .gsd/runtime/native-uat/current/env.sh; bash scripts/dev.sh

[windows]
native-uat-dev:
    $ErrorActionPreference = 'Stop'; cargo run --manifest-path {{backend_dir}}/Cargo.toml --bin native-uat-fixture -- setup *> $null; . .gsd/runtime/native-uat/current/env.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1

[windows]
dev:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1

# Run in release mode
[unix]
run:
    set -euo pipefail
    {{npm_bin}} --prefix {{frontend_dir}} run build
    trap 'exit 0' INT TERM
    cargo run --manifest-path {{backend_dir}}/Cargo.toml --release
    trap - INT TERM

[windows]
run:
    {{npm_bin}} --prefix {{frontend_dir}} run build
    cargo run --manifest-path {{backend_dir}}/Cargo.toml --release

# Show Tauri info
info:
    cargo tauri info --manifest-path {{backend_dir}}/Cargo.toml

# Development mode with DevTools opened automatically
[unix]
dev-tools:
    bash scripts/dev-tools.sh

[windows]
dev-tools:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-tools.ps1

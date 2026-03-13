# Development tasks for the Tauri Music Player

set shell := ["bash", "-lc"]

frontend_dir := "src"
backend_dir := "src-tauri"

default:
    @just --list

# Install development dependencies
install:
    @command -v rustup >/dev/null 2>&1 || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    npm --prefix {{frontend_dir}} install
    @command -v cargo-tauri >/dev/null 2>&1 || cargo install tauri-cli --locked

# Check code quality
check:
    mkdir -p dist
    cargo fmt --manifest-path {{backend_dir}}/Cargo.toml -- --check
    cargo clippy --manifest-path {{backend_dir}}/Cargo.toml --all-targets -- -D warnings
    npm --prefix {{frontend_dir}} run check

# Run tests
test:
    mkdir -p dist
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
    npm --prefix {{frontend_dir}} update
    cargo update --manifest-path {{backend_dir}}/Cargo.toml

# Clean build artifacts
clean:
    cargo clean --manifest-path {{backend_dir}}/Cargo.toml
    rm -rf dist
    rm -rf {{backend_dir}}/target
    rm -rf {{frontend_dir}}/node_modules

# Build the project in debug mode
build:
    npm --prefix {{frontend_dir}} run build
    cargo build --manifest-path {{backend_dir}}/Cargo.toml

# Build the project in release mode
release:
    npm --prefix {{frontend_dir}} run build
    cargo build --manifest-path {{backend_dir}}/Cargo.toml --release

# Format code
fmt:
    cargo fmt --manifest-path {{backend_dir}}/Cargo.toml --all
    if npm --prefix {{frontend_dir}} exec prettier --version >/dev/null 2>&1; then \
        npm --prefix {{frontend_dir}} exec prettier --write .; \
    else \
        echo "Prettier not found. Install it with 'npm --prefix {{frontend_dir}} install --save-dev prettier' to enable frontend formatting."; \
    fi

# Package for all platforms
package:
    npm --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml

# Package for Windows
package-windows:
    npm --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target x86_64-pc-windows-msvc

# Package for macOS
package-macos:
    npm --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target aarch64-apple-darwin
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target x86_64-apple-darwin

# Package for Linux
package-linux:
    npm --prefix {{frontend_dir}} run build
    cargo tauri build --manifest-path {{backend_dir}}/Cargo.toml --target x86_64-unknown-linux-gnu

# Run the application in development mode
dev:
    bash scripts/dev.sh

# Run in release mode
run:
    set -euo pipefail
    npm --prefix {{frontend_dir}} run build
    trap 'exit 0' INT TERM
    cargo run --manifest-path {{backend_dir}}/Cargo.toml --release
    trap - INT TERM

# Show Tauri info
info:
    cargo tauri info --manifest-path {{backend_dir}}/Cargo.toml

# Development mode with DevTools opened automatically
dev-tools:
    bash scripts/dev-tools.sh

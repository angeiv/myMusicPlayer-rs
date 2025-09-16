# Development tasks for the Tauri Music Player

# Default target (run when just is called without arguments)
default:
    @just --list

# Install development dependencies
install:
    # Install Rust toolchain if not installed
    @command -v rustup >/dev/null 2>&1 || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # Install Node.js dependencies
    cd src && npm install
    # Install Tauri CLI
    cargo install tauri-cli
    # Install cargo tools (optional)
    # cargo install cargo-udeps cargo-tarpaulin cargo-nextest

# Check code quality
check:
    # Format check
    cargo fmt -- --check
    # Lint with Clippy
    cargo clippy -- -D warnings

# Run tests
test:
    cargo test --all-features -- --nocapture
    cd src-tauri && cargo test -- --nocapture

# Run tests with coverage (requires cargo-tarpaulin)
coverage:
    @echo "Install cargo-tarpaulin first: cargo install cargo-tarpaulin"
    # cd src-tauri && cargo tarpaulin --all-features --ignore-tests --out Lcov --output-dir ../../target/tarpaulin
    # @echo "Coverage report generated at target/tarpaulin/lcov.info"

# Run all code quality checks
qa: check test

# Update dependencies
update:
    cargo update
    cd src && npm update

# Clean build artifacts
clean:
    cargo clean
    rm -rf dist
    rm -rf src-tauri/target
    cd src && rm -rf node_modules

# Build the project in debug mode
build:
    cd src && npm run build
    cd ../src-tauri && cargo build

# Build the project in release mode
release:
    cd src && npm run build
    cd ../src-tauri && cargo build --release

# Format code
fmt:
    cargo fmt --all
    cd src-tauri && cargo fmt --all
    cd ../src && npx prettier --write .

# Package for all platforms
package:
    cd src && npm run build
    cd ../src-tauri && cargo tauri build

# Package for Windows
package-windows:
    cd src && npm run build
    cd ../src-tauri && cargo tauri build --target x86_64-pc-windows-msvc

# Package for macOS
package-macos:
    cd src && npm run build
    cd ../src-tauri && cargo tauri build --target aarch64-apple-darwin
    cd ../src-tauri && cargo tauri build --target x86_64-apple-darwin

# Package for Linux
package-linux:
    cd src && npm run build
    cd ../src-tauri && cargo tauri build --target x86_64-unknown-linux-gnu

# Run the application in development mode
dev:
    cd src && npm run dev &
    cd src-tauri && cargo tauri dev

# Run in release mode
run:
    cd src && npm run build
    cd ../src-tauri && cargo tauri build --release

# Show Tauri info
info:
    cd src-tauri && cargo tauri info

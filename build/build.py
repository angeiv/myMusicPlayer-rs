#!/usr/bin/env python3
"""
Build and package script for Music Player
"""

import os
import sys
import shutil
import platform
import subprocess
import argparse
from pathlib import Path
from typing import List, Optional, Dict, Any

# Project configuration
PROJECT_NAME = "music-player"
VERSION = "1.0.0"
AUTHOR = "Music Player Team"
DESCRIPTION = "A modern music player"

# Platform detection
IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"

# Paths
ROOT_DIR = Path(__file__).parent.absolute()
TARGET_DIR = ROOT_DIR / "target"
DIST_DIR = ROOT_DIR / "dist"


def run_command(cmd: List[str], cwd: Optional[Path] = None) -> bool:
    """Run a shell command and return True if successful"""
    print(f"Running: {' '.join(str(c) for c in cmd)}")
    try:
        subprocess.run(cmd, cwd=cwd or ROOT_DIR, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Command failed with error: {e}")
        return False


def ensure_dir(path: Path) -> None:
    """Ensure a directory exists, create it if it doesn't"""
    path.mkdir(parents=True, exist_ok=True)


def clean() -> None:
    """Clean build artifacts"""
    if TARGET_DIR.exists():
        print(f"Cleaning {TARGET_DIR}")
        shutil.rmtree(TARGET_DIR)
    
    if DIST_DIR.exists():
        print(f"Cleaning {DIST_DIR}")
        shutil.rmtree(DIST_DIR)


def build(release: bool = True, target: Optional[str] = None) -> bool:
    """Build the project"""
    cmd = ["cargo", "build"]
    
    if release:
        cmd.append("--release")
    
    if target:
        cmd.extend(["--target", target])
    
    return run_command(cmd)


def test() -> bool:
    """Run tests"""
    return run_command(["cargo", "test"])


def package_windows() -> bool:
    """Package for Windows"""
    print("Packaging for Windows...")
    
    # Build the project
    if not build(release=True, target="x86_64-pc-windows-msvc"):
        return False
    
    # Create output directory
    dist_dir = DIST_DIR / "windows"
    ensure_dir(dist_dir)
    
    # Copy the binary
    bin_path = TARGET_DIR / "x86_64-pc-windows-msvc" / "release" / f"{PROJECT_NAME}.exe"
    if not bin_path.exists():
        print(f"Error: Binary not found at {bin_path}")
        return False
    
    shutil.copy2(bin_path, dist_dir / f"{PROJECT_NAME}.exe")
    
    # Run NSIS installer if available
    nsis_script = ROOT_DIR / "packaging" / "windows" / "installer.nsi"
    if nsis_script.exists():
        if not run_command(["makensis", str(nsis_script)]):
            print("Warning: Failed to create NSIS installer")
    
    print(f"Windows package created in {dist_dir}")
    return True


def package_macos() -> bool:
    """Package for macOS"""
    print("Packaging for macOS...")
    
    # Build the project
    if not build(release=True, target="x86_64-apple-darwin"):
        return False
    
    # Create output directory
    dist_dir = DIST_DIR / "macos"
    ensure_dir(dist_dir)
    
    # Run the macOS packaging script
    script_path = ROOT_DIR / "packaging" / "macos" / "build-app.sh"
    if not script_path.exists():
        print(f"Error: Packaging script not found at {script_path}")
        return False
    
    if not os.access(script_path, os.X_OK):
        script_path.chmod(0o755)
    
    return run_command([str(script_path)])


def package_linux() -> bool:
    """Package for Linux"""
    print("Packaging for Linux...")
    
    # Build the project
    if not build(release=True, target="x86_64-unknown-linux-gnu"):
        return False
    
    # Create output directory
    dist_dir = DIST_DIR / "linux"
    ensure_dir(dist_dir)
    
    # Try to create a Debian package
    deb_script = ROOT_DIR / "packaging" / "linux" / "build-deb.sh"
    if deb_script.exists() and shutil.which("dpkg-deb"):
        print("Creating Debian package...")
        if os.access(deb_script, os.X_OK) or run_command(["chmod", "+x", str(deb_script)]):
            run_command([str(deb_script)])
    
    # Try to create an AppImage
    appimage_script = ROOT_DIR / "packaging" / "linux" / "build-appimage.sh"
    if appimage_script.exists():
        print("Creating AppImage...")
        if os.access(appimage_script, os.X_OK) or run_command(["chmod", "+x", str(appimage_script)]):
            run_command([str(appimage_script)])
    
    print(f"Linux packages created in {dist_dir}")
    return True


def package_all() -> bool:
    """Package for all platforms"""
    results = []
    
    if IS_WINDOWS or not any([IS_WINDOWS, IS_MACOS, IS_LINUX]):
        results.append(package_windows())
    
    if IS_MACOS or not any([IS_WINDOWS, IS_MACOS, IS_LINUX]):
        results.append(package_macos())
    
    if IS_LINUX or not any([IS_WINDOWS, IS_MACOS, IS_LINUX]):
        results.append(package_linux())
    
    return all(results)


def main() -> int:
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Build and package Music Player")
    parser.add_argument("--clean", action="store_true", help="Clean build artifacts")
    parser.add_argument("--build", action="store_true", help="Build the project")
    parser.add_argument("--test", action="store_true", help="Run tests")
    parser.add_argument("--package", choices=["windows", "macos", "linux", "all"], 
                      help="Package for the specified platform")
    parser.add_argument("--release", action="store_true", help="Build in release mode")
    parser.add_argument("--target", help="Cross-compilation target")
    
    args = parser.parse_args()
    
    if not any(vars(args).values()):
        parser.print_help()
        return 1
    
    if args.clean:
        clean()
    
    success = True
    
    if args.build:
        success &= build(release=args.release, target=args.target)
    
    if args.test:
        success &= test()
    
    if args.package:
        if args.package == "windows":
            success &= package_windows()
        elif args.package == "macos":
            success &= package_macos()
        elif args.package == "linux":
            success &= package_linux()
        elif args.package == "all":
            success &= package_all()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())

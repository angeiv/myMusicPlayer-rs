//! Build helper functions and utilities

use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Build configuration
#[derive(Debug)]
pub struct BuildConfig {
    pub target_os: String,
    pub target_arch: String,
    pub profile: String,
    pub features: Vec<String>,
    pub out_dir: PathBuf,
}

impl Default for BuildConfig {
    fn default() -> Self {
        Self {
            target_os: env::var("CARGO_CFG_TARGET_OS").unwrap_or_else(|_| "unknown".to_string()),
            target_arch: env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| "unknown".to_string()),
            profile: env::var("PROFILE").unwrap_or_else(|_| "debug".to_string()),
            features: vec![],
            out_dir: PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR not set")),
        }
    }
}

impl BuildConfig {
    /// Create a new build configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a feature flag
    pub fn with_feature(mut self, feature: &str) -> Self {
        self.features.push(feature.to_string());
        self
    }

    /// Get the target triple
    pub fn target_triple(&self) -> String {
        format!("{}-{}", self.target_arch, self.target_os)
    }

    /// Build the project
    pub fn build(&self) -> std::io::Result<()> {
        let mut cmd = Command::new("cargo");
        cmd.arg("build")
            .arg("--profile")
            .arg(&self.profile);

        if !self.features.is_empty() {
            cmd.arg("--features").arg(self.features.join(","));
        }

        let status = cmd.status()?;

        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Build failed",
            ));
        }

        Ok(())
    }

    /// Package the application
    pub fn package(&self, output_dir: &Path) -> std::io::Result<()> {
        // Create output directory if it doesn't exist
        if !output_dir.exists() {
            std::fs::create_dir_all(output_dir)?;
        }

        // Platform-specific packaging
        match self.target_os.as_str() {
            "windows" => self.package_windows(output_dir),
            "macos" => self.package_macos(output_dir),
            "linux" => self.package_linux(output_dir),
            _ => Err(std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                format!("Unsupported target OS: {}", self.target_os),
            )),
        }
    }

    fn package_windows(&self, output_dir: &Path) -> std::io::Result<()> {
        // Windows packaging logic
        let exe_name = "music_player.exe";
        let src = self
            .out_dir
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join(&self.profile)
            .join(exe_name);
        let dest = output_dir.join(exe_name);

        std::fs::copy(&src, &dest)?;
        println!("Copied Windows executable to: {}", dest.display());
        Ok(())
    }

    fn package_macos(&self, output_dir: &Path) -> std::io::Result<()> {
        // macOS packaging logic
        let app_name = "Music Player.app";
        let app_dir = output_dir.join(app_name);
        let contents_dir = app_dir.join("Contents");
        let macos_dir = contents_dir.join("MacOS");
        let resources_dir = contents_dir.join("Resources");

        // Create directory structure
        std::fs::create_dir_all(&macos_dir)?;
        std::fs::create_dir_all(&resources_dir)?;

        // Copy binary
        let bin_name = "music_player";
        let src = self
            .out_dir
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join(&self.profile)
            .join(bin_name);
        let dest = macos_dir.join(bin_name);
        std::fs::copy(&src, &dest)?;

        // Make binary executable
        let status = Command::new("chmod")
            .arg("+x")
            .arg(&dest)
            .status()?;

        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to make binary executable",
            ));
        }

        // Create Info.plist
        let info_plist = contents_dir.join("Info.plist");
        std::fs::write(
            info_plist,
            include_str!("../resources/macos/Info.plist")
                .replace("${EXECUTABLE_NAME}", bin_name)
                .replace("${BUNDLE_IDENTIFIER}", "com.musicplayer.app")
                .replace("${BUNDLE_NAME}", "Music Player")
                .replace("${BUNDLE_VERSION}", env!("CARGO_PKG_VERSION")),
        )?;

        println!("Packaged macOS application to: {}", app_dir.display());
        Ok(())
    }

    fn package_linux(&self, output_dir: &Path) -> std::io::Result<()> {
        // Linux packaging logic
        let bin_name = "music-player";
        let bin_dir = output_dir.join("usr").join("bin");
        let share_dir = output_dir.join("usr").join("share");
        let apps_dir = share_dir.join("applications");
        let icons_dir = share_dir.join("icons").join("hicolor");
        let appdata_dir = share_dir.join("appdata");

        // Create directory structure
        std::fs::create_dir_all(&bin_dir)?;
        std::fs::create_dir_all(&apps_dir)?;
        std::fs::create_dir_all(&icons_dir)?;
        std::fs::create_dir_all(&appdata_dir)?;

        // Copy binary
        let src = self
            .out_dir
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join(&self.profile)
            .join(bin_name);
        let dest = bin_dir.join(bin_name);
        std::fs::copy(&src, &dest)?;

        // Make binary executable
        let status = Command::new("chmod")
            .arg("+x")
            .arg(&dest)
            .status()?;

        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Failed to make binary executable",
            ));
        }

        // Create .desktop file
        let desktop_file = apps_dir.join(format!("{}.desktop", bin_name));
        std::fs::write(
            desktop_file,
            include_str!("../resources/linux/music-player.desktop")
                .replace("${BIN_NAME}", bin_name)
                .replace("${APP_NAME}", "Music Player")
                .replace("${VERSION}", env!("CARGO_PKG_VERSION")),
        )?;

        // Create AppData file
        let appdata_file = appdata_dir.join(format!("{}.appdata.xml", bin_name));
        std::fs::write(
            appdata_file,
            include_str!("../resources/linux/music-player.appdata.xml")
                .replace("${APP_ID}", bin_name)
                .replace("${APP_NAME}", "Music Player")
                .replace("${SUMMARY}", "A modern music player")
                .replace("${VERSION}", env!("CARGO_PKG_VERSION")),
        )?;

        println!("Packaged Linux application to: {}", output_dir.display());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_config() {
        let config = BuildConfig::new();
        assert!(!config.target_os.is_empty());
        assert!(!config.target_arch.is_empty());
        assert!(!config.profile.is_empty());
    }
}

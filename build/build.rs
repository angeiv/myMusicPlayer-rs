use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Rebuild if build script changes
    println!("cargo:rerun-if-changed=build.rs");
    
    // Get the target operating system
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    
    // Set up build flags based on platform
    let mut build = cc::Build::new();
    
    // Platform-specific configurations
    match target_os.as_str() {
        "windows" => configure_windows(&mut build),
        "macos" => configure_macos(&mut build),
        "linux" => configure_linux(&mut build),
        _ => {}
    }
    
    // Generate version information
    let version = env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "0.1.0".to_string());
    let git_hash = get_git_hash().unwrap_or_else(|_| "unknown".to_string());
    let build_date = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    // Generate a version file
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
    let dest_path = PathBuf::from(&out_dir).join("version.rs");
    fs::write(
        &dest_path,
        format!(
            r#"
            pub const VERSION: &str = "{version}";
            pub const GIT_HASH: &str = "{git_hash}";
            pub const BUILD_DATE: &str = "{build_date}";
            pub const TARGET_OS: &str = "{target_os}";
            pub const TARGET_ARCH: &str = "{target_arch}";
            "#
        ),
    )
    .expect("Failed to write version file");
    
    // Link against system libraries if needed
    if target_os == "linux" {
        // For Linux, ensure we link against required system libraries
        println!("cargo:rustc-link-lib=dbus-1");
    }
    
    // Add build info to the binary
    println!("cargo:rustc-env=GIT_HASH={}", git_hash);
    println!("cargo:rustc-env=BUILD_DATE={}", build_date);
    println!("cargo:rustc-env=TARGET_OS={}", target_os);
    println!("cargo:rustc-env=TARGET_ARCH={}", target_arch);
    
    // Rebuild if any source files change
    println!("cargo:rerun-if-changed=src/");
}

fn configure_windows(build: &mut cc::Build) {
    // Windows-specific build configurations
    build.define("WINDOWS", None);
    
    // Add Windows resource file if it exists
    let res_path = "resources/windows/icon.rc";
    if std::path::Path::new(res_path).exists() {
        build.file(res_path);
    }
}

fn configure_macos(build: &mut cc::Build) {
    // macOS-specific build configurations
    build.define("MACOS", None);
    
    // Add macOS frameworks
    println!("cargo:rustc-link-lib=framework=AppKit");
    println!("cargo:rustc-link-lib=framework=CoreFoundation");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
}

fn configure_linux(build: &mut cc::Build) {
    // Linux-specific build configurations
    build.define("LINUX", None);
    
    // Add system libraries
    pkg_config::Config::new()
        .atleast_version("1.0")
        .probe("dbus-1")
        .expect("Could not find dbus-1");
}

fn get_git_hash() -> Result<String, std::io::Error> {
    let output = Command::new("git")
        .args(["rev-parse", "--short=8", "HEAD"])
        .output()?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to get git hash",
        ))
    }
}

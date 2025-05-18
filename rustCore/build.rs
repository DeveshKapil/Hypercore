fn main() {
    // Tell cargo to rerun this script if build.rs or Cargo.toml changes
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=Cargo.toml");
    // Build the bootloader
    bootloader::build::build_bootloader();
}

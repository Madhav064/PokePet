// No commands are exposed to the web page directly: the app's own commands call
// into this plugin from Rust (see src/lib.rs).
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}

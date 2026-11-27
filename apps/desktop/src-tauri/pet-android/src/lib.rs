//! PokePet's Android side. The Kotlin code in `android/` draws the pet on the home
//! screen and lock screen (a live wallpaper) and, when the user turns it on, over
//! other apps. This crate only hands the app a way to talk to that Kotlin code.

use serde::{de::DeserializeOwned, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

/// Lets the app call the Kotlin `PetPlugin` (see android/src/main/java/app/pokepet/pet/PetPlugin.kt).
pub struct PetAndroid<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> PetAndroid<R> {
    /// Runs a `@Command` of the Kotlin plugin and returns what it resolved with.
    /// Async, because some commands wait for the user (a permission screen, the photo picker).
    pub async fn call<T: Serialize, O: DeserializeOwned>(&self, command: &str, payload: T) -> Result<O, String> {
        self.0
            .run_mobile_plugin_async(command, payload)
            .await
            .map_err(|e| e.to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pet-android")
        .setup(|app, api| {
            let handle = api.register_android_plugin("app.pokepet.pet", "PetPlugin")?;
            app.manage(PetAndroid(handle));
            Ok(())
        })
        .build()
}

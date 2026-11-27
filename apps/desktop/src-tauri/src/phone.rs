//! Android only. The pet lives on the home screen and lock screen (a live wallpaper)
//! and, if the user turns on "Walk over my apps", on top of other apps too. That part is
//! Kotlin (pet-android/android) and runs even while the app is closed; this file connects
//! it to the collection.
//!
//! The phone keeps its own record of screen time and evolutions in phone-time.json (it
//! never touches collection.json). While the app runs, it folds that record in every few
//! seconds, so the PokePet screens always show the latest.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State, Wry};
use tauri_plugin_pet_android::PetAndroid;

use crate::collection::PhoneTime;
use crate::{Evolved, Store, COLLECTION_CHANGED, PET_EVOLVED};

/// How often the phone's record is folded into the collection while the app runs.
const FOLD_EVERY: Duration = Duration::from_secs(3);

/// What the PokePet window shows in its "On your phone" settings.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneStatus {
    /// PokePet is the phone's wallpaper, so the pet is on the home and lock screens.
    pub wallpaper_set: bool,
    /// "Walk over my apps" is on (and Android allows it).
    pub over_apps: bool,
    /// The user picked their own photo for behind the pet.
    pub has_background: bool,
    /// PokePet may "Display over other apps", so the pet can be picked up on the home screen.
    pub can_pick_up: bool,
}

pub fn setup(app: &mut tauri::App, store: Arc<Store>) -> tauri::Result<()> {
    // A phone has a single window: the PokePet screens (see tauri.android.conf.json).
    for config in app.config().app.windows.clone() {
        tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
    }

    // Tell the Kotlin side where the collection lives, so the wallpaper can find it.
    let data_dir = store.path.parent().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default();
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let pet = handle.state::<PetAndroid<Wry>>();
        if let Err(e) = pet.call::<_, PhoneStatus>("configure", json!({ "dataDir": data_dir })).await {
            eprintln!("PokePet: couldn't set up the phone pet: {e}");
        }
    });

    let handle = app.handle().clone();
    thread::spawn(move || loop {
        fold_phone_time(&handle, &store);
        thread::sleep(FOLD_EVERY);
    });
    Ok(())
}

/// Adds the screen time and evolutions the phone recorded since last time.
fn fold_phone_time(app: &AppHandle, store: &Store) {
    let file = store.path.with_file_name("phone-time.json");
    let Ok(text) = std::fs::read_to_string(&file) else { return };
    let Ok(phone) = serde_json::from_str::<PhoneTime>(&text) else { return };
    let mut c = store.collection.lock().unwrap();
    let fold = c.fold_phone_time(&phone);
    if !fold.changed {
        return;
    }
    let _ = c.save(&store.path);
    let _ = app.emit(COLLECTION_CHANGED, c.clone());
    drop(c);
    for (id, from, to) in fold.evolved {
        let _ = app.emit(PET_EVOLVED, Evolved { id, from, to });
    }
}

type Pet<'a> = State<'a, PetAndroid<Wry>>;

/// Status bar and navigation bar sizes in CSS px, so the page can stay clear of them.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Insets {
    pub top: f64,
    pub bottom: f64,
}

#[tauri::command]
pub async fn phone_insets(pet: Pet<'_>) -> Result<Insets, String> {
    pet.call("insets", json!({})).await
}

#[tauri::command]
pub async fn phone_status(pet: Pet<'_>) -> Result<PhoneStatus, String> {
    pet.call("status", json!({})).await
}

/// Opens Android's preview of the pet wallpaper, where the user confirms it.
#[tauri::command]
pub async fn phone_set_wallpaper(pet: Pet<'_>) -> Result<PhoneStatus, String> {
    pet.call("setWallpaper", json!({})).await
}

/// Turning it on may first show Android's "Display over other apps" screen.
#[tauri::command]
pub async fn phone_set_over_apps(pet: Pet<'_>, on: bool) -> Result<PhoneStatus, String> {
    pet.call("setOverApps", json!({ "on": on })).await
}

/// Opens Android's "Display over other apps" screen, so the pet can be picked up.
#[tauri::command]
pub async fn phone_allow_pick_up(pet: Pet<'_>) -> Result<PhoneStatus, String> {
    pet.call("allowPickUp", json!({})).await
}

#[tauri::command]
pub async fn phone_pick_background(pet: Pet<'_>) -> Result<PhoneStatus, String> {
    pet.call("pickBackground", json!({})).await
}

#[tauri::command]
pub async fn phone_clear_background(pet: Pet<'_>) -> Result<PhoneStatus, String> {
    pet.call("clearBackground", json!({})).await
}

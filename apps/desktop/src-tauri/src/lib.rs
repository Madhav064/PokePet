mod collection;
#[cfg(desktop)]
mod desktop;
#[cfg(target_os = "android")]
mod phone;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use collection::{valid_species, Collection, OwnedPet};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_deep_link::DeepLinkExt;

/// Event sent to every window whenever the collection changes.
const COLLECTION_CHANGED: &str = "collection-changed";
/// Event sent to every window when a pet evolves, for the celebrations.
const PET_EVOLVED: &str = "pet-evolved";
/// Event telling the PokePet window that a pokepet://adopt link is waiting.
const ADOPT_LINK: &str = "adopt-link";

// ---- collection ---------------------------------------------------------------------

struct Store {
    collection: Mutex<Collection>,
    path: PathBuf,
}

impl Store {
    /// Applies a change, saves it and tells every window. If `f` fails, nothing is saved.
    fn update<T>(&self, app: &AppHandle, f: impl FnOnce(&mut Collection) -> Result<T, String>) -> Result<T, String> {
        let mut c = self.collection.lock().unwrap();
        let out = f(&mut c)?;
        c.save(&self.path).map_err(|e| format!("Couldn't save your pets: {e}"))?;
        let _ = app.emit(COLLECTION_CHANGED, c.clone());
        Ok(out)
    }
}

#[tauri::command]
fn get_collection(store: State<'_, Arc<Store>>) -> Collection {
    store.collection.lock().unwrap().clone()
}

#[tauri::command]
fn adopt(app: AppHandle, store: State<'_, Arc<Store>>, species: String, line: String) -> Result<OwnedPet, String> {
    if !valid_species(&species) || !valid_species(&line) {
        return Err("That isn't a pet we know.".into());
    }
    store.update(&app, |c| c.adopt(&species, &line).ok_or_else(|| "You already have this pet.".into()))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Evolved {
    id: String,
    from: String,
    to: String,
}

#[tauri::command]
fn evolve(app: AppHandle, store: State<'_, Arc<Store>>, id: String, into: String) -> Result<(), String> {
    if !valid_species(&into) {
        return Err("That isn't a pet we know.".into());
    }
    let from = store.update(&app, |c| c.evolve(&id, &into).ok_or_else(|| "Nothing to evolve.".into()))?;
    let _ = app.emit(PET_EVOLVED, Evolved { id, from, to: into });
    Ok(())
}

#[tauri::command]
fn set_active(app: AppHandle, store: State<'_, Arc<Store>>, id: Option<String>) -> Result<(), String> {
    store.update(&app, |c| {
        if c.set_active(id.as_deref()) { Ok(()) } else { Err("That pet isn't in your collection.".into()) }
    })
}

#[tauri::command]
fn release(app: AppHandle, store: State<'_, Arc<Store>>, id: String) -> Result<(), String> {
    store.update(&app, |c| {
        if c.release(&id) { Ok(()) } else { Err("That pet isn't in your collection.".into()) }
    })
}

// ---- pokepet:// links -----------------------------------------------------------------

/// Pets asked for by `pokepet://adopt/<pet>` links, waiting for the PokePet window to
/// pick them up. A queue, because on a cold start the window may still be loading.
#[derive(Default)]
struct PendingAdoptions(Mutex<Vec<String>>);

/// `pokepet://adopt/bulbasaur` → `bulbasaur`.
fn adopt_link_slug(url: &url::Url) -> Option<String> {
    if url.scheme() != "pokepet" || url.host_str() != Some("adopt") {
        return None;
    }
    let slug = url.path().trim_matches('/').to_ascii_lowercase();
    valid_species(&slug).then_some(slug)
}

/// A link was opened (from the website, or anywhere else): bring up the PokePet window
/// and hand it the pets to adopt.
fn handle_links(app: &AppHandle, urls: Vec<url::Url>) {
    queue_adoptions(app, urls.iter().filter_map(adopt_link_slug).collect());
}

/// Brings up the PokePet window and hands it pets to adopt.
fn queue_adoptions(app: &AppHandle, slugs: Vec<String>) {
    // On a phone, opening the link already brought the app up.
    #[cfg(desktop)]
    desktop::show_manager(app);
    if slugs.is_empty() {
        return;
    }
    app.state::<PendingAdoptions>().0.lock().unwrap().extend(slugs);
    let _ = app.emit(ADOPT_LINK, ());
}

#[tauri::command]
fn take_pending_adoptions(state: State<'_, PendingAdoptions>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        // Must come first: a second launch (e.g. clicking a pokepet:// link while the app runs)
        // hands its link to this instance and exits, instead of opening a second pet.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| desktop::show_manager(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(desktop::PetHitbox::default())
        .manage(desktop::CaptureMouse::default())
        .invoke_handler(tauri::generate_handler![
            desktop::set_hitbox,
            desktop::set_capture,
            get_collection,
            adopt,
            evolve,
            set_active,
            release,
            desktop::open_manager,
            take_pending_adoptions
        ]);
    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_pet_android::init())
        .invoke_handler(tauri::generate_handler![
            get_collection,
            adopt,
            evolve,
            set_active,
            release,
            take_pending_adoptions,
            phone::phone_status,
            phone::phone_insets,
            phone::phone_set_wallpaper,
            phone::phone_set_over_apps,
            phone::phone_allow_pick_up,
            phone::phone_install_update,
            phone::phone_pick_background,
            phone::phone_clear_background
        ]);

    let app = builder
        .manage(PendingAdoptions::default())
        .setup(|app| {
            // The desktop installer registers pokepet:// links; in dev, register them here.
            #[cfg(all(desktop, debug_assertions))]
            let _ = app.deep_link().register_all();
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| handle_links(&handle, event.urls()));

            let path = app.path().app_data_dir()?.join("collection.json");
            let store = Arc::new(Store { collection: Mutex::new(Collection::load(&path)), path });
            app.manage(store.clone());

            #[cfg(desktop)]
            {
                let first_run = store.collection.lock().unwrap().pets.is_empty();
                desktop::setup(app, store, first_run)?;
            }
            #[cfg(target_os = "android")]
            phone::setup(app, store)?;

            // Started by opening a link while PokePet wasn't running.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                handle_links(app.handle(), urls);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building PokePet");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // Bank the last few seconds of on-screen time.
            if let Some(store) = app.try_state::<Arc<Store>>() {
                let _ = store.collection.lock().unwrap().save(&store.path);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::adopt_link_slug;

    fn slug(s: &str) -> Option<String> {
        adopt_link_slug(&url::Url::parse(s).unwrap())
    }

    #[test]
    fn reads_adopt_links() {
        assert_eq!(slug("pokepet://adopt/bulbasaur").as_deref(), Some("bulbasaur"));
        assert_eq!(slug("pokepet://adopt/mr-mime/").as_deref(), Some("mr-mime"));
        assert_eq!(slug("pokepet://adopt/Pikachu").as_deref(), Some("pikachu"));
    }

    #[test]
    fn ignores_anything_else() {
        assert_eq!(slug("pokepet://open"), None);
        assert_eq!(slug("pokepet://adopt/"), None);
        assert_eq!(slug("pokepet://adopt/..%2Fevil"), None);
        assert_eq!(slug("https://adopt/bulbasaur"), None);
    }
}

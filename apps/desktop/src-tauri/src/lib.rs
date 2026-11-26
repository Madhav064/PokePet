mod collection;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use collection::{valid_species, Collection, OwnedPet};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_deep_link::DeepLinkExt;

/// How often the cursor is checked against the pet, for click-through.
const CURSOR_POLL: Duration = Duration::from_millis(30);
/// How often on-screen time is credited to the active pet.
const CLOCK_TICK: Duration = Duration::from_secs(5);
/// A longer gap between ticks means the PC was asleep; don't count that as time on screen.
const MAX_TICK: Duration = Duration::from_secs(15);
/// How often the running clock is written to disk (changes are saved immediately).
const SAVE_EVERY: Duration = Duration::from_secs(30);
/// Event sent to every window whenever the collection changes.
const COLLECTION_CHANGED: &str = "collection-changed";
/// Event sent to every window when a pet evolves, for the celebrations.
const PET_EVOLVED: &str = "pet-evolved";
/// Event telling the PokePet window that a pokepet://adopt link is waiting.
const ADOPT_LINK: &str = "adopt-link";

// ---- click-through ----------------------------------------------------------------

/// Where the pet is inside the window, in logical px. Sent by the web side.
#[derive(Clone, Copy, Debug)]
struct Hitbox {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Hitbox {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
}

#[derive(Default)]
struct PetHitbox(Arc<Mutex<Option<Hitbox>>>);

/// When set, the window keeps the mouse everywhere: while carrying the pet, or
/// while it waits for you to click the spot it should walk to.
#[derive(Default)]
struct CaptureMouse(Arc<AtomicBool>);

#[tauri::command]
fn set_hitbox(state: State<'_, PetHitbox>, x: f64, y: f64, w: f64, h: f64) {
    *state.0.lock().unwrap() = Some(Hitbox { x, y, w, h });
}

#[tauri::command]
fn set_capture(app: AppHandle, state: State<'_, CaptureMouse>, on: bool) {
    state.0.store(on, Ordering::SeqCst);
    if on {
        if let Some(win) = app.get_webview_window("pet") {
            let _ = win.set_ignore_cursor_events(false);
            // Focus, so Escape reaches the pet while it waits for a spot.
            let _ = win.set_focus();
        }
    }
}

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

#[tauri::command]
fn open_manager(app: AppHandle) {
    show_manager(&app);
}

/// Credits on-screen time to the active pet while the pet window is showing.
fn run_clock(app: AppHandle, store: Arc<Store>) {
    thread::spawn(move || {
        let mut last = Instant::now();
        let mut last_save = Instant::now();
        loop {
            thread::sleep(CLOCK_TICK);
            let now = Instant::now();
            let elapsed = now - last;
            last = now;
            let on_screen = app
                .get_webview_window("pet")
                .and_then(|w| w.is_visible().ok())
                .unwrap_or(false);
            if !on_screen || elapsed > MAX_TICK {
                continue;
            }
            let mut c = store.collection.lock().unwrap();
            if !c.add_screen_time(elapsed.as_millis() as u64) {
                continue;
            }
            if now - last_save >= SAVE_EVERY {
                let _ = c.save(&store.path);
                last_save = now;
            }
            let _ = app.emit(COLLECTION_CHANGED, c.clone());
        }
    });
}

// ---- windows ------------------------------------------------------------------------

fn show_manager(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("manager") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        // On Windows, the very first show of a window can leave it minimized a moment
        // later, e.g. when a pokepet:// link starts the app. Keep checking for a few
        // seconds (startup can be slow) and restore it.
        thread::spawn(move || {
            for _ in 0..30 {
                thread::sleep(Duration::from_millis(100));
                if w.is_minimized().unwrap_or(false) {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        });
    }
}

/// Cover the primary monitor's work area (everything except the taskbar), so the
/// pet can be carried anywhere and falls back down to just above the taskbar.
fn cover_work_area(win: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match win.primary_monitor()? {
        Some(m) => Some(m),
        None => win.current_monitor()?,
    };
    let Some(monitor) = monitor else { return Ok(()) };
    let area = monitor.work_area();
    win.set_size(area.size)?;
    win.set_position(area.position)?;
    Ok(())
}

/// The window covers the screen, but only the pet should catch the mouse.
/// Poll the cursor and let clicks pass through to whatever is underneath,
/// unless it is over the pet or the pet asked to keep the mouse.
fn watch_cursor(win: WebviewWindow, hitbox: Arc<Mutex<Option<Hitbox>>>, capture: Arc<AtomicBool>) {
    thread::spawn(move || {
        let mut ignoring = true;
        let _ = win.set_ignore_cursor_events(true);
        loop {
            thread::sleep(CURSOR_POLL);
            let want_mouse = capture.load(Ordering::SeqCst) || {
                let (Ok(cursor), Ok(origin), Ok(scale)) =
                    (win.cursor_position(), win.outer_position(), win.scale_factor())
                else {
                    continue;
                };
                let x = (cursor.x - origin.x as f64) / scale;
                let y = (cursor.y - origin.y as f64) / scale;
                hitbox.lock().unwrap().is_some_and(|h| h.contains(x, y))
            };
            if want_mouse == ignoring {
                ignoring = !want_mouse;
                let _ = win.set_ignore_cursor_events(ignoring);
            }
        }
    });
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
    show_manager(app);
    if slugs.is_empty() {
        return;
    }
    app.state::<PendingAdoptions>().0.lock().unwrap().extend(slugs);
    let _ = app.emit(ADOPT_LINK, ());
}

// ---- the pet picked on the website before installing --------------------------------

/// Browsers attach a "Zone.Identifier" note to downloads, recording where they came from:
///   [ZoneTransfer]
///   ZoneId=3
///   ReferrerUrl=https://…/pet/bulbasaur
///   HostUrl=https://github.com/…/PokePet-Setup.exe?pet=bulbasaur
/// Finds the pet in either URL (a `pet=` parameter or a `/pet/<slug>` page).
fn pet_from_zone_identifier(text: &str) -> Option<String> {
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else { continue };
        if !matches!(key.trim(), "ReferrerUrl" | "HostUrl") {
            continue;
        }
        let Ok(url) = url::Url::parse(value.trim()) else { continue };
        let from_query = url.query_pairs().find(|(k, _)| k == "pet").map(|(_, v)| v.into_owned());
        let from_path = url.path_segments().and_then(|mut segs| {
            segs.by_ref().find(|s| *s == "pet")?;
            segs.next().map(str::to_owned)
        });
        for candidate in [from_query, from_path].into_iter().flatten() {
            let slug = candidate.to_ascii_lowercase();
            if valid_species(&slug) {
                return Some(slug);
            }
        }
    }
    None
}

/// Reads a text file that may be UTF-8 or UTF-16 (Windows writes both kinds of Zone.Identifier).
fn read_text_lossy(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if let [0xFF, 0xFE, rest @ ..] = bytes.as_slice() {
        let units: Vec<u16> = rest.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return Some(String::from_utf16_lossy(&units));
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// The installer leaves its own path behind (see windows/hooks.nsh). Read the pet the
/// visitor picked from the installer's download note, once, then forget it.
fn take_installer_pet(app: &tauri::App) -> Option<String> {
    let marker = app.path().app_data_dir().ok()?.join("installer-path.txt");
    let installer = std::fs::read_to_string(&marker).ok()?;
    let _ = std::fs::remove_file(&marker);
    let zone = read_text_lossy(&format!("{}:Zone.Identifier", installer.trim()))?;
    pet_from_zone_identifier(&zone)
}

#[tauri::command]
fn take_pending_adoptions(state: State<'_, PendingAdoptions>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

// ---- start with Windows -------------------------------------------------------------

/// Turn "start with Windows" on once, the first time the installed app runs.
/// Never in dev builds, which would register the debug executable.
fn enable_autostart_once(app: &tauri::App) {
    if cfg!(debug_assertions) {
        return;
    }
    let Ok(dir) = app.path().app_data_dir() else { return };
    let marker = dir.join("autostart-set");
    if marker.exists() {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(marker, b"1");
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open PokePet", true, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit PokePet", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &autostart, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("PokePet")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => show_manager(app),
            "autostart" => {
                let launcher = app.autolaunch();
                let on = launcher.is_enabled().unwrap_or(false);
                let _ = if on { launcher.disable() } else { launcher.enable() };
                let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(!on));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_manager(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Must come first: a second launch (e.g. clicking a pokepet:// link while the app runs)
        // hands its link to this instance and exits, instead of opening a second pet.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_manager(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(PetHitbox::default())
        .manage(CaptureMouse::default())
        .manage(PendingAdoptions::default())
        .invoke_handler(tauri::generate_handler![
            set_hitbox,
            set_capture,
            get_collection,
            adopt,
            evolve,
            set_active,
            release,
            open_manager,
            take_pending_adoptions
        ])
        .setup(|app| {
            // The installer registers pokepet:// links; in dev, register them here.
            #[cfg(debug_assertions)]
            let _ = app.deep_link().register_all();
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| handle_links(&handle, event.urls()));
            enable_autostart_once(app);

            let path = app.path().app_data_dir()?.join("collection.json");
            let store = Arc::new(Store { collection: Mutex::new(Collection::load(&path)), path });
            let first_run = store.collection.lock().unwrap().pets.is_empty();
            app.manage(store.clone());
            run_clock(app.handle().clone(), store);

            // The windows are created here, not by Tauri up front ("create": false), so their
            // pages can never ask for the collection before it's loaded. The installed app
            // loads pages fast enough to hit that race.
            for config in app.config().app.windows.clone() {
                tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            }

            let pet = app
                .get_webview_window("pet")
                .expect("the pet window is defined in tauri.conf.json");
            cover_work_area(&pet)?;
            // Click-through from the very first frame, so the screen is never blocked.
            pet.set_ignore_cursor_events(true)?;
            pet.show()?;
            watch_cursor(
                pet,
                app.state::<PetHitbox>().0.clone(),
                app.state::<CaptureMouse>().0.clone(),
            );

            // Closing the PokePet window just hides it; the pet keeps living on screen.
            let manager = app
                .get_webview_window("manager")
                .expect("the manager window is defined in tauri.conf.json");
            let to_hide = manager.clone();
            manager.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = to_hide.hide();
                }
            });
            if first_run {
                show_manager(app.handle());
            }

            build_tray(app)?;

            // Started by clicking a link while PokePet wasn't running.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                handle_links(app.handle(), urls);
            }
            // Just installed after picking a pet on the website: adopt it straight away.
            if let Some(slug) = take_installer_pet(app) {
                queue_adoptions(app.handle(), vec![slug]);
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
    use super::{adopt_link_slug, pet_from_zone_identifier};

    #[test]
    fn finds_the_pet_in_a_download_note() {
        let from_pet_page = "[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://poke-pet-murex.vercel.app/pet/bulbasaur\r\nHostUrl=https://objects.githubusercontent.com/x?sig=abc==\r\n";
        assert_eq!(pet_from_zone_identifier(from_pet_page).as_deref(), Some("bulbasaur"));
        let from_param = "[ZoneTransfer]\nZoneId=3\nReferrerUrl=https://poke-pet-murex.vercel.app/\nHostUrl=https://github.com/Madhav064/PokePet/releases/latest/download/PokePet-Setup.exe?pet=mr-mime\n";
        assert_eq!(pet_from_zone_identifier(from_param).as_deref(), Some("mr-mime"));
    }

    #[test]
    fn no_pet_when_the_note_has_none() {
        assert_eq!(pet_from_zone_identifier("[ZoneTransfer]\nZoneId=3\nReferrerUrl=https://poke-pet-murex.vercel.app/download\n"), None);
        assert_eq!(pet_from_zone_identifier("[ZoneTransfer]\nZoneId=3\n"), None);
        assert_eq!(pet_from_zone_identifier("ReferrerUrl=https://x.test/pet/..%2Fevil"), None);
    }

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

mod collection;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use collection::{valid_species, Collection, OwnedPet};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindow, WindowEvent};

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
        // Show first: un-minimizing a window that was never shown can leave it minimized.
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
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

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open PokePet", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit PokePet", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("PokePet")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_manager(app),
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
        .manage(PetHitbox::default())
        .manage(CaptureMouse::default())
        .invoke_handler(tauri::generate_handler![
            set_hitbox,
            set_capture,
            get_collection,
            adopt,
            evolve,
            set_active,
            release,
            open_manager
        ])
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("collection.json");
            let store = Arc::new(Store { collection: Mutex::new(Collection::load(&path)), path });
            let first_run = store.collection.lock().unwrap().pets.is_empty();
            app.manage(store.clone());
            run_clock(app.handle().clone(), store);

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

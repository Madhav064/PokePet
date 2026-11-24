use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State, WebviewWindow};

/// How often the cursor is checked against the pet, for click-through.
const CURSOR_POLL: Duration = Duration::from_millis(30);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PetHitbox::default())
        .manage(CaptureMouse::default())
        .invoke_handler(tauri::generate_handler![set_hitbox, set_capture])
        .setup(|app| {
            let win = app
                .get_webview_window("pet")
                .expect("the pet window is defined in tauri.conf.json");
            cover_work_area(&win)?;
            // Click-through from the very first frame, so the screen is never blocked.
            win.set_ignore_cursor_events(true)?;
            win.show()?;
            watch_cursor(
                win,
                app.state::<PetHitbox>().0.clone(),
                app.state::<CaptureMouse>().0.clone(),
            );

            let quit = MenuItem::with_id(app, "quit", "Quit PokePet", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("PokePet")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PokePet");
}

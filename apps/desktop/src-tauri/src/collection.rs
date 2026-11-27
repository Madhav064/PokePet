//! The user's pets: everything they've adopted, which one is on screen, and how long
//! each has spent on screen (the clock that drives evolution). Saved as JSON in the
//! app's data folder, so it survives restarts and both windows always agree.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedPet {
    /// Unique per adoption, so two Bulbasaurs are two different pets.
    pub id: String,
    /// Pet slug in the pack, e.g. "bulbasaur". Changes when it evolves.
    pub species: String,
    /// Evolution line it belongs to (its first form), e.g. "bulbasaur" for an Ivysaur.
    /// You can only have one pet per line. Older saves without it fall back to `species`.
    #[serde(default)]
    pub line: String,
    /// When it was adopted, in ms since the Unix epoch.
    pub adopted_at: u64,
    /// Total time this pet has spent on screen, in ms. Only grows while it's the active pet.
    pub on_screen_ms: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub pets: Vec<OwnedPet>,
    /// Id of the pet on screen. At most one at a time.
    pub active: Option<String>,
    /// Android only: how much of each pet's phone screen time (see [`PhoneTime`]) has
    /// already been added to its `on_screen_ms`. Read by the phone side too.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub phone_credited_ms: HashMap<String, u64>,
}

/// What the phone's wallpaper and over-apps pet record while the app may not be running,
/// in phone-time.json. Written only by the Kotlin side (PetState.kt), read only here.
#[cfg_attr(not(target_os = "android"), allow(dead_code))] // only the Android app folds phone time
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneTime {
    /// Total time each pet has been on the phone's screen, in ms. Only ever grows.
    #[serde(default)]
    pub screen_ms: HashMap<String, u64>,
    /// Pets that evolved on the phone, by id.
    #[serde(default)]
    pub evolved: HashMap<String, PhoneEvolution>,
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))] // only the Android app folds phone time
#[derive(Clone, Debug, Deserialize)]
pub struct PhoneEvolution {
    pub from: String,
    pub to: String,
}

/// What folding in the phone's records changed.
#[cfg_attr(not(target_os = "android"), allow(dead_code))] // only the Android app folds phone time
#[derive(Debug, Default, PartialEq)]
pub struct PhoneFold {
    pub changed: bool,
    /// (pet id, from, to) for every pet that evolved.
    pub evolved: Vec<(String, String, String)>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Pack slugs are lowercase letters, digits and dashes.
pub fn valid_species(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

impl Collection {
    /// Reads the saved collection, or starts empty if there is none (or it can't be read).
    pub fn load(path: &Path) -> Self {
        let mut c: Self = fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        for p in &mut c.pets {
            if p.line.is_empty() {
                p.line = p.species.clone();
            }
        }
        c
    }

    /// Whether a pet of this evolution line (or this exact species) is already in the collection.
    pub fn has_line(&self, species: &str, line: &str) -> bool {
        self.pets.iter().any(|p| p.line == line || p.species == species)
    }

    /// Writes to a temp file first, then swaps it in, so a crash never leaves a half-written file.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        fs::rename(&tmp, path)
    }

    /// Adds a new pet and puts it on screen. Returns None if you already have one of its line.
    pub fn adopt(&mut self, species: &str, line: &str) -> Option<OwnedPet> {
        if self.has_line(species, line) {
            return None;
        }
        let now = now_ms();
        let mut id = format!("{species}-{now}");
        let mut n = 1;
        while self.pets.iter().any(|p| p.id == id) {
            n += 1;
            id = format!("{species}-{now}-{n}");
        }
        let pet = OwnedPet {
            id,
            species: species.to_owned(),
            line: line.to_owned(),
            adopted_at: now,
            on_screen_ms: 0,
        };
        self.pets.push(pet.clone());
        self.active = Some(pet.id.clone());
        Some(pet)
    }

    /// Turns a pet into its next form. Returns the old species, or None if there is no such pet.
    pub fn evolve(&mut self, id: &str, into: &str) -> Option<String> {
        let pet = self.pets.iter_mut().find(|p| p.id == id)?;
        if pet.species == into {
            return None;
        }
        Some(std::mem::replace(&mut pet.species, into.to_owned()))
    }

    /// Puts a pet on screen (or none). Returns false if there is no such pet.
    pub fn set_active(&mut self, id: Option<&str>) -> bool {
        match id {
            None => {
                self.active = None;
                true
            }
            Some(id) if self.pets.iter().any(|p| p.id == id) => {
                self.active = Some(id.to_owned());
                true
            }
            Some(_) => false,
        }
    }

    /// Removes a pet for good. Returns false if there is no such pet.
    pub fn release(&mut self, id: &str) -> bool {
        let before = self.pets.len();
        self.pets.retain(|p| p.id != id);
        if self.active.as_deref() == Some(id) {
            self.active = None;
        }
        self.pets.len() != before
    }

    /// Adds what the phone recorded since last time: new screen time, and evolutions
    /// that still fit the pet (it hasn't changed species some other way since).
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    pub fn fold_phone_time(&mut self, phone: &PhoneTime) -> PhoneFold {
        let mut out = PhoneFold::default();
        for (id, &total) in &phone.screen_ms {
            let Some(pet) = self.pets.iter_mut().find(|p| &p.id == id) else { continue };
            let credited = self.phone_credited_ms.entry(id.clone()).or_insert(0);
            // A smaller total means the phone's record was reset: start counting from it.
            if total > *credited {
                pet.on_screen_ms += total - *credited;
            }
            if total != *credited {
                *credited = total;
                out.changed = true;
            }
        }
        for (id, step) in &phone.evolved {
            if !valid_species(&step.to) {
                continue;
            }
            let Some(pet) = self.pets.iter_mut().find(|p| &p.id == id) else { continue };
            if pet.species == step.from && pet.species != step.to {
                pet.species = step.to.clone();
                out.changed = true;
                out.evolved.push((id.clone(), step.from.clone(), step.to.clone()));
            }
        }
        // Forget released pets.
        let before = self.phone_credited_ms.len();
        let pets = &self.pets;
        self.phone_credited_ms.retain(|id, _| pets.iter().any(|p| &p.id == id));
        out.changed |= self.phone_credited_ms.len() != before;
        out
    }

    /// Credits on-screen time to the active pet. Returns false if no pet is on screen.
    #[cfg_attr(target_os = "android", allow(dead_code))] // the phone counts its own time (PhoneTime)
    pub fn add_screen_time(&mut self, ms: u64) -> bool {
        let Some(active) = self.active.as_deref() else { return false };
        match self.pets.iter_mut().find(|p| p.id == active) {
            Some(p) => {
                p.on_screen_ms += ms;
                true
            }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_is_banked_per_pet_across_swaps() {
        let mut c = Collection::default();
        let bulba = c.adopt("bulbasaur", "bulbasaur").unwrap();
        assert_eq!(c.active.as_deref(), Some(bulba.id.as_str()));
        c.add_screen_time(3 * 3_600_000);
        let charm = c.adopt("charmander", "charmander").unwrap();
        c.add_screen_time(1_000);
        c.set_active(Some(&bulba.id));
        c.add_screen_time(500);
        let get = |id: &str| c.pets.iter().find(|p| p.id == id).unwrap().on_screen_ms;
        assert_eq!(get(&bulba.id), 3 * 3_600_000 + 500);
        assert_eq!(get(&charm.id), 1_000);
    }

    #[test]
    fn releasing_the_active_pet_leaves_none_on_screen() {
        let mut c = Collection::default();
        let p = c.adopt("pichu", "pichu").unwrap();
        assert!(c.release(&p.id));
        assert!(c.active.is_none());
        assert!(!c.add_screen_time(10));
    }

    #[test]
    fn one_pet_per_evolution_line() {
        let mut c = Collection::default();
        let p = c.adopt("bulbasaur", "bulbasaur").unwrap();
        assert!(c.adopt("bulbasaur", "bulbasaur").is_none(), "same species twice");
        assert_eq!(c.evolve(&p.id, "ivysaur").as_deref(), Some("bulbasaur"));
        assert!(c.adopt("bulbasaur", "bulbasaur").is_none(), "evolved pet still blocks its line");
        assert!(c.adopt("charmander", "charmander").is_some());
        // Releasing frees the line up again.
        c.release(&p.id);
        assert!(c.adopt("bulbasaur", "bulbasaur").is_some());
    }

    #[test]
    fn evolving_keeps_the_pet_and_its_time() {
        let mut c = Collection::default();
        let p = c.adopt("eevee", "eevee").unwrap();
        c.add_screen_time(5 * 3_600_000);
        c.evolve(&p.id, "umbreon");
        let pet = &c.pets[0];
        assert_eq!((pet.id.as_str(), pet.species.as_str(), pet.line.as_str()), (p.id.as_str(), "umbreon", "eevee"));
        assert_eq!(pet.on_screen_ms, 5 * 3_600_000);
        assert!(c.evolve(&p.id, "umbreon").is_none(), "no-op evolve reports nothing");
    }

    fn phone(screen: &[(&str, u64)], evolved: &[(&str, &str, &str)]) -> PhoneTime {
        PhoneTime {
            screen_ms: screen.iter().map(|(id, ms)| (id.to_string(), *ms)).collect(),
            evolved: evolved
                .iter()
                .map(|(id, from, to)| (id.to_string(), PhoneEvolution { from: from.to_string(), to: to.to_string() }))
                .collect(),
        }
    }

    #[test]
    fn phone_time_is_counted_once() {
        let mut c = Collection::default();
        let p = c.adopt("bulbasaur", "bulbasaur").unwrap();
        c.add_screen_time(1_000);
        assert!(c.fold_phone_time(&phone(&[(&p.id, 5_000)], &[])).changed);
        assert_eq!(c.pets[0].on_screen_ms, 6_000);
        // Same record again: nothing new.
        assert_eq!(c.fold_phone_time(&phone(&[(&p.id, 5_000)], &[])), PhoneFold::default());
        assert_eq!(c.pets[0].on_screen_ms, 6_000);
        // The phone counted 2 s more.
        c.fold_phone_time(&phone(&[(&p.id, 7_000)], &[]));
        assert_eq!(c.pets[0].on_screen_ms, 8_000);
        // Unknown pets are ignored.
        assert!(!c.fold_phone_time(&phone(&[("nobody", 9_000), (&p.id, 7_000)], &[])).changed);
    }

    #[test]
    fn phone_evolutions_apply_once_and_only_if_they_still_fit() {
        let mut c = Collection::default();
        let p = c.adopt("bulbasaur", "bulbasaur").unwrap();
        let fold = c.fold_phone_time(&phone(&[], &[(&p.id, "bulbasaur", "venusaur")]));
        assert_eq!(fold.evolved, vec![(p.id.clone(), "bulbasaur".into(), "venusaur".into())]);
        assert_eq!(c.pets[0].species, "venusaur");
        assert!(c.fold_phone_time(&phone(&[], &[(&p.id, "bulbasaur", "venusaur")])).evolved.is_empty());
        // Stale record from an older species: ignored.
        assert!(c.fold_phone_time(&phone(&[], &[(&p.id, "bulbasaur", "ivysaur")])).evolved.is_empty());
        assert_eq!(c.pets[0].species, "venusaur");
        assert!(c.fold_phone_time(&phone(&[], &[(&p.id, "venusaur", "../evil")])).evolved.is_empty());
    }

    #[test]
    fn desktop_saves_are_unchanged() {
        let mut c = Collection::default();
        c.adopt("pichu", "pichu");
        let json = serde_json::to_string(&c).unwrap();
        assert!(!json.contains("phoneCreditedMs"));
    }

    #[test]
    fn rejects_bad_species() {
        assert!(valid_species("mr-mime"));
        assert!(!valid_species("../evil"));
        assert!(!valid_species(""));
    }
}

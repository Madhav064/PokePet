//! The user's pets: everything they've adopted, which one is on screen, and how long
//! each has spent on screen (the clock that drives evolution). Saved as JSON in the
//! app's data folder, so it survives restarts and both windows always agree.

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

    /// Credits on-screen time to the active pet. Returns false if no pet is on screen.
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

    #[test]
    fn rejects_bad_species() {
        assert!(valid_species("mr-mime"));
        assert!(!valid_species("../evil"));
        assert!(!valid_species(""));
    }
}

//! The WASM Lean prover's two admissions (SPEC.md §9, AGENTS.md).
//!
//! - Its handwritten driver, `sdk/npm/lean-prover/driver/{Elab,SymList}.lean`, is admitted only as the
//!   exact bytes a pinned LexLean release publishes: `model/dependencies.toml` names the release, its
//!   revision and the BLAKE3 κ-label of each file, and the directory holds those files and no other.
//! - Its generated patch to Lean's C++ at the pinned commit is admitted only with its pinned κ-label, and
//!   the only change it may make under Lean's `src/kernel/` is one extern declaration's return type in
//!   `src/kernel/environment.cpp`, `uint8*` to `uint8`, so it matches the definition Lean's generated C
//!   gives `lean_kernel_diag_is_enabled`. Any other kernel change is refused.
//!
//! Neither is PrismPM-authored Lean, and neither admits any other file.
use crate::Fail;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The driver's directory, and its exact files.
pub(super) const LEAN_PROVER_DRIVER: &str = "sdk/npm/lean-prover/driver";
pub(super) const LEAN_PROVER_DRIVER_SOURCES: [&str; 2] = ["Elab.lean", "SymList.lean"];
/// The prover's generated patch to Lean's C++.
pub(super) const LEAN_PROVER_PATCH: &str = "sdk/npm/lean-prover/upstream/lean-wasm-elaborator.patch";
/// The one kernel file the patch may change, and the declaration it may change there.
const KERNEL_HUNK_FILE: &str = "src/kernel/environment.cpp";
const KERNEL_HUNK_SYMBOL: &str = "lean_kernel_diag_is_enabled(";

/// The pinned release of the driver and the patch: `[[dependency]] id = "lean-prover-driver"`.
#[derive(Debug)]
pub(super) struct LeanProverPin {
    pub release: String,
    pub revision: String,
    /// Each pinned file by its repository path, to its κ-label.
    pub files: BTreeMap<String, String>,
}

fn is_kappa(label: &str) -> bool {
    label.len() == 71
        && label.starts_with("blake3:")
        && label[7..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn kappa_of(path: &Path) -> Result<String, Fail> {
    Ok(format!("blake3:{}", blake3::hash(&std::fs::read(path)?).to_hex()))
}

/// The pin, or none when `model/dependencies.toml` names no `lean-prover-driver`.
pub(super) fn lean_prover_pin(root: &Path) -> Result<Option<LeanProverPin>, Fail> {
    let value: toml::Value = toml::from_str(&std::fs::read_to_string(root.join("model/dependencies.toml"))?)?;
    let Some(dependency) = value
        .get("dependency")
        .and_then(toml::Value::as_array)
        .and_then(|rows| rows.iter().find(|row| row.get("id").and_then(toml::Value::as_str) == Some("lean-prover-driver")))
    else {
        return Ok(None);
    };
    let text = |key: &str| {
        dependency
            .get(key)
            .and_then(toml::Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| format!("lean-prover-driver dependency lacks {key}"))
    };
    if text("source")? != "lexlean-release" {
        return Err("lean-prover-driver is admitted only from a LexLean release (source = \"lexlean-release\")".into());
    }
    let release = text("release")?;
    let revision = text("revision")?;
    if revision.len() != 40 || !revision.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
        return Err(format!("lean-prover-driver revision {revision} is not a full lowercase commit").into());
    }
    let mut files = BTreeMap::new();
    for artifact in dependency
        .get("artifact")
        .and_then(toml::Value::as_array)
        .ok_or("lean-prover-driver dependency lists no artifact")?
    {
        let path = artifact.get("path").and_then(toml::Value::as_str).ok_or("lean-prover-driver artifact lacks path")?;
        let kappa = artifact.get("kappa").and_then(toml::Value::as_str).ok_or("lean-prover-driver artifact lacks kappa")?;
        if !is_kappa(kappa) {
            return Err(format!("lean-prover-driver artifact {path} has no BLAKE3 κ-label").into());
        }
        if files.insert(path.to_owned(), kappa.to_owned()).is_some() {
            return Err(format!("lean-prover-driver pins {path} twice").into());
        }
    }
    Ok(Some(LeanProverPin { release, revision, files }))
}

/// Admit the driver: its directory holds exactly the pinned files, each with its pinned κ-label. Resolves
/// the admitted paths, none when there is no driver.
pub(super) fn audit_lean_prover_driver(root: &Path) -> Result<Vec<PathBuf>, Fail> {
    let directory = root.join(LEAN_PROVER_DRIVER);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let pin = lean_prover_pin(root)?
        .ok_or("the lean-prover driver is present, and model/dependencies.toml pins no lean-prover-driver release")?;
    let expected: BTreeSet<String> = LEAN_PROVER_DRIVER_SOURCES.iter().map(|file| format!("{LEAN_PROVER_DRIVER}/{file}")).collect();
    let pinned: BTreeSet<String> = pin.files.keys().filter(|path| path.ends_with(".lean")).cloned().collect();
    if pinned != expected {
        return Err(format!("lean-prover-driver pins {pinned:?}, not exactly {expected:?}").into());
    }
    let mut found = BTreeSet::new();
    for entry in walkdir::WalkDir::new(&directory) {
        let entry = entry?;
        if entry.depth() == 0 {
            continue;
        }
        let relative = entry.path().strip_prefix(root).unwrap_or(entry.path()).to_string_lossy().replace('\\', "/");
        if !entry.file_type().is_file() {
            if entry.file_type().is_dir() {
                return Err(format!("lean-prover driver holds a directory, {relative}; it holds only its pinned files").into());
            }
            return Err(format!("lean-prover driver file {relative} is not a regular file").into());
        }
        if !expected.contains(&relative) {
            return Err(format!("{relative} is not a pinned lean-prover driver file").into());
        }
        found.insert(relative);
    }
    if found != expected {
        return Err(format!("the lean-prover driver lacks {:?}", expected.difference(&found).collect::<Vec<_>>()).into());
    }
    for relative in &expected {
        let (want, got) = (&pin.files[relative], kappa_of(&root.join(relative))?);
        if &got != want {
            return Err(format!("{relative} is {got}, not the {want} LexLean {} ({}) publishes", pin.release, pin.revision).into());
        }
    }
    Ok(expected.iter().map(|relative| root.join(relative)).collect())
}

/// Admit the patch: its pinned κ-label, and no kernel change but the one pinned declaration.
pub(super) fn audit_lean_prover_patch(root: &Path) -> Result<(), Fail> {
    let file = root.join(LEAN_PROVER_PATCH);
    if !file.exists() {
        return Ok(());
    }
    let pin = lean_prover_pin(root)?.ok_or("the lean-prover patch is present, and model/dependencies.toml pins no lean-prover-driver release")?;
    let want = pin.files.get(LEAN_PROVER_PATCH).ok_or("lean-prover-driver pins no patch")?;
    let got = kappa_of(&file)?;
    if &got != want {
        return Err(format!("{LEAN_PROVER_PATCH} is {got}, not the pinned {want}").into());
    }
    kernel_changes_admitted(&std::fs::read_to_string(&file)?)
}

/// Every change a unified diff makes under Lean's `src/kernel/` is the one pinned extern declaration.
pub(super) fn kernel_changes_admitted(patch: &str) -> Result<(), Fail> {
    let kernel = |path: &str| path.trim_start_matches("a/").trim_start_matches("b/").starts_with("src/kernel/");
    let (mut from, mut to) = (String::new(), String::new());
    let mut in_hunk = false;
    let (mut removed, mut added) = (Vec::new(), Vec::new());
    for line in patch.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            let mut parts = rest.split_whitespace();
            from = parts.next().unwrap_or_default().to_owned();
            to = parts.next().unwrap_or_default().to_owned();
            in_hunk = false;
            continue;
        }
        if !in_hunk {
            if let Some(path) = line.strip_prefix("--- ") {
                from = path.split_whitespace().next().unwrap_or_default().to_owned();
            } else if let Some(path) = line.strip_prefix("+++ ") {
                to = path.split_whitespace().next().unwrap_or_default().to_owned();
            } else if line.starts_with("@@") {
                in_hunk = true;
            } else if (line.starts_with("rename ") || line.starts_with("copy ") || line.contains(" mode ")) && line.contains("src/kernel/") {
                return Err(format!("the lean-prover patch renames, copies or re-modes a kernel file: {line}").into());
            }
            if (kernel(&from) || kernel(&to)) && from.trim_start_matches("a/") != to.trim_start_matches("b/") && !from.is_empty() && !to.is_empty() {
                return Err(format!("the lean-prover patch adds, removes or moves a kernel file: {from} to {to}").into());
            }
            continue;
        }
        if line.starts_with("@@") || line.starts_with("diff --git ") {
            continue;
        }
        let path = to.trim_start_matches("b/");
        if !kernel(path) {
            continue;
        }
        if let Some(text) = line.strip_prefix('-') {
            removed.push((path.to_owned(), text.to_owned()));
        } else if let Some(text) = line.strip_prefix('+') {
            added.push((path.to_owned(), text.to_owned()));
        }
    }
    match (removed.as_slice(), added.as_slice()) {
        ([], []) => Ok(()),
        ([(old_path, old)], [(new_path, new)])
            if old_path == KERNEL_HUNK_FILE
                && new_path == KERNEL_HUNK_FILE
                && old.contains(KERNEL_HUNK_SYMBOL)
                && old.contains("uint8*")
                && old.replacen("uint8*", "uint8", 1) == *new =>
        {
            Ok(())
        }
        _ => Err(format!(
            "the lean-prover patch changes Lean's kernel beyond the one pinned declaration in {KERNEL_HUNK_FILE}: {} removed and {} added kernel lines",
            removed.len(),
            added.len()
        )
        .into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ADMITTED: &str = "diff --git a/src/kernel/environment.cpp b/src/kernel/environment.cpp\n--- a/src/kernel/environment.cpp\n+++ b/src/kernel/environment.cpp\n@@ -10,3 +10,3 @@\n namespace lean {\n-extern \"C\" uint8* lean_kernel_diag_is_enabled(object*);\n+extern \"C\" uint8 lean_kernel_diag_is_enabled(object*);\n }\ndiff --git a/src/runtime/object.cpp b/src/runtime/object.cpp\n--- a/src/runtime/object.cpp\n+++ b/src/runtime/object.cpp\n@@ -1 +1,2 @@\n x\n+y\n";

    fn pin(root: &Path, files: &[(&str, String)]) {
        let mut text = String::from("spec = \"prismpm/dependencies/1\"\n\n[[dependency]]\nid = \"lean-prover-driver\"\nsource = \"lexlean-release\"\nrelease = \"lexlean-v0.0.0-test\"\nrevision = \"0123456789abcdef0123456789abcdef01234567\"\n");
        for (path, kappa) in files {
            text.push_str(&format!("\n[[dependency.artifact]]\nkind = \"file\"\npath = \"{path}\"\nkappa = \"{kappa}\"\n"));
        }
        std::fs::create_dir_all(root.join("model")).unwrap();
        std::fs::write(root.join("model/dependencies.toml"), text).unwrap();
    }

    fn driver() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join(LEAN_PROVER_DRIVER);
        std::fs::create_dir_all(&dir).unwrap();
        let mut files = Vec::new();
        for name in LEAN_PROVER_DRIVER_SOURCES {
            std::fs::write(dir.join(name), format!("-- {name}\n")).unwrap();
            files.push((format!("{LEAN_PROVER_DRIVER}/{name}"), kappa_of(&dir.join(name)).unwrap()));
        }
        pin(root.path(), &files.iter().map(|(p, k)| (p.as_str(), k.clone())).collect::<Vec<_>>());
        root
    }

    #[test]
    fn the_pinned_driver_is_admitted_and_nothing_else() {
        let root = driver();
        assert_eq!(audit_lean_prover_driver(root.path()).unwrap().len(), 2);
    }

    #[test]
    fn planted_defects_an_edited_extra_missing_or_unpinned_driver_file_is_refused() {
        let root = driver();
        std::fs::write(root.path().join(LEAN_PROVER_DRIVER).join("Elab.lean"), "-- edited\n").unwrap();
        assert!(audit_lean_prover_driver(root.path()).unwrap_err().to_string().contains("not the"));
        let root = driver();
        std::fs::write(root.path().join(LEAN_PROVER_DRIVER).join("Extra.lean"), "-- extra\n").unwrap();
        assert!(audit_lean_prover_driver(root.path()).unwrap_err().to_string().contains("is not a pinned lean-prover driver file"));
        let root = driver();
        std::fs::remove_file(root.path().join(LEAN_PROVER_DRIVER).join("SymList.lean")).unwrap();
        assert!(audit_lean_prover_driver(root.path()).unwrap_err().to_string().contains("lacks"));
        let root = driver();
        std::fs::write(root.path().join("model/dependencies.toml"), "spec = \"prismpm/dependencies/1\"\n").unwrap();
        assert!(audit_lean_prover_driver(root.path()).unwrap_err().to_string().contains("pins no lean-prover-driver release"));
    }

    #[test]
    fn the_one_pinned_kernel_declaration_is_admitted() {
        kernel_changes_admitted(ADMITTED).unwrap();
        kernel_changes_admitted("diff --git a/src/runtime/x.cpp b/src/runtime/x.cpp\n@@ -1 +1 @@\n-a\n+b\n").unwrap();
    }

    #[test]
    fn planted_defects_any_other_kernel_change_is_refused() {
        // A checker line in the type checker.
        let checker = "diff --git a/src/kernel/type_checker.cpp b/src/kernel/type_checker.cpp\n--- a/src/kernel/type_checker.cpp\n+++ b/src/kernel/type_checker.cpp\n@@ -1 +1 @@\n-    if (!is_def_eq(a, b)) throw kernel_exception();\n+    if (false) throw kernel_exception();\n";
        assert!(kernel_changes_admitted(checker).is_err());
        // One more line beside the pinned declaration.
        let extra = ADMITTED.replace(" }\ndiff --git a/src/runtime", "+bool skip_checks = true;\n }\ndiff --git a/src/runtime");
        assert!(kernel_changes_admitted(&extra).is_err());
        // The declaration changed to something else.
        assert!(kernel_changes_admitted(&ADMITTED.replace("+extern \"C\" uint8 lean_kernel", "+extern \"C\" uint16 lean_kernel")).is_err());
        // A removed kernel line that looks like a header inside a hunk.
        let hidden = "diff --git a/src/kernel/environment.cpp b/src/kernel/environment.cpp\n@@ -1,2 +1 @@\n--- check_no_metavar(e);\n context\n";
        assert!(kernel_changes_admitted(hidden).is_err());
        // A kernel file moved, removed or added.
        assert!(kernel_changes_admitted("diff --git a/src/kernel/expr.cpp b/src/kernel/expr2.cpp\nrename from src/kernel/expr.cpp\nrename to src/kernel/expr2.cpp\n").is_err());
        assert!(kernel_changes_admitted("diff --git a/src/kernel/expr.cpp b/src/kernel/expr.cpp\n--- a/src/kernel/expr.cpp\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n").is_err());
    }

    #[test]
    fn the_driver_release_is_pinned_in_this_repository() {
        // Fails until the LexLean release that publishes the driver exists and model/dependencies.toml pins it.
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let pin = lean_prover_pin(root).unwrap().expect("model/dependencies.toml pins the lean-prover-driver release");
        assert!(pin.files.contains_key(LEAN_PROVER_PATCH));
    }
}

//! The binary application profile, `prismpm/binary-application/1`, projected
//! as `prismpm/model-document/9` (#630, docs/proposals/630-binary-application.md).
//!
//! A binary application's requests and responses are bytes with no UTF-8 rule.
//! Its guest is the stateless world (@1), the session world (@2, #629) or the
//! checkpoint world (@3, HO-47). Large inputs are named by BLAKE3 digest, and
//! the model carries the bytes its acceptance names, so acceptance runs
//! offline. Every bound is model data; this module projects and checks it and
//! generates nothing.

use crate::error::PrismError;
use crate::holo::application::Definitions;
use crate::session_guest::{SessionGuestSpec, RESPONSE_COUNT_LIMIT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

/// The source-owned module of the declaration.
pub const MODULE: &str = "Foundation.Binary.Application.V1.Model";
/// The profile the declaration names.
pub const PROFILE: &str = "prismpm/binary-application/1";
/// The model document a binary application projects to.
pub const SCHEMA: &str = "prismpm/model-document/9";
/// The stateless guest contract.
pub const STATELESS: &str = "hologram:guest/core-wasm@1";
/// The session guest contract (#629).
pub const SESSION: &str = "hologram:guest/core-wasm@2";
/// The checkpoint guest contract (HO-47).
pub const CHECKPOINT: &str = "hologram:guest/core-wasm@3";
/// Request and response payloads, 1 byte to 64 MiB.
pub const MAXIMUM_PAYLOAD: u32 = 64 * 1024 * 1024;
/// Inputs one request may name.
pub const MAXIMUM_INPUTS: u32 = 64;
/// One input and all inputs of a request.
pub const MAXIMUM_INPUT_BYTES: u32 = 1024 * 1024 * 1024;
/// One input the model itself carries for its acceptance.
pub const MAXIMUM_ACCEPTANCE_INPUT: usize = 1024 * 1024;
/// The bytes of every acceptance vector, step and input together.
pub const MAXIMUM_CORPUS_BYTES: usize = 16 * 1024 * 1024;
const PAGE: u64 = 65_536;

/// The session bounds of a session-world or checkpoint-world guest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionBounds {
    /// The largest state a step may leave, in bytes.
    pub state_maximum: u32,
    /// The most responses one step may answer.
    pub response_count_maximum: u32,
}

/// One request of a stateless guest, the digests of the inputs it names, and its response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptanceVector {
    /// The request payload.
    pub request: Vec<u8>,
    /// The BLAKE3 digests of the inputs the request names, in order.
    pub inputs: Vec<Vec<u8>>,
    /// The response the guest must answer.
    pub response: Vec<u8>,
}

/// One step of a session: its request, the inputs it names, and its responses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptanceStep {
    /// The request payload.
    pub request: Vec<u8>,
    /// The BLAKE3 digests of the inputs the request names, in order.
    pub inputs: Vec<Vec<u8>>,
    /// The responses the step must answer, in order.
    pub responses: Vec<Vec<u8>>,
}

/// The projected declaration, field for field the `application` member of
/// `prismpm/model-document/9`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BinaryApplication {
    /// The profile, prismpm/binary-application/1.
    pub profile: String,
    /// Human-facing application name.
    pub name: String,
    /// Generated registry package name.
    pub cargo_name: String,
    /// Generated registry package version.
    pub cargo_version: String,
    /// Generated package description.
    pub cargo_description: String,
    /// Canonical package source repository URL.
    pub cargo_repository: String,
    /// Canonical package homepage URL.
    pub cargo_homepage: String,
    /// Fully qualified generated library roots.
    pub library_roots: Vec<String>,
    /// The Bytes -> Bytes root the guest runs.
    pub entry_root: String,
    /// The guest contract: the stateless, session or checkpoint world.
    pub core_contract: String,
    /// The largest request payload, in bytes.
    pub request_maximum: u32,
    /// The largest single response, in bytes.
    pub response_maximum: u32,
    /// The most inputs one request may name.
    pub input_count_maximum: u32,
    /// The largest single input, in bytes.
    pub input_maximum: u32,
    /// The most input bytes one request may name in all.
    pub input_total_maximum: u32,
    /// The exact guest memory maximum, in 64 KiB pages.
    pub core_memory_pages: u32,
    /// The guest linear-memory stack, in bytes.
    pub core_stack_bytes: u32,
    /// The session bounds of a session-world guest; none for the stateless world.
    pub session: Option<SessionBounds>,
    /// The acceptance of a stateless guest.
    pub acceptance_vectors: Vec<AcceptanceVector>,
    /// The acceptance of a session-world guest: ordered sessions of steps.
    pub acceptance_sessions: Vec<Vec<AcceptanceStep>>,
    /// The bytes of every input the acceptance names.
    pub acceptance_inputs: Vec<Vec<u8>>,
    /// Whether the capability request is canonically empty.
    pub capabilities_empty: bool,
    /// Whether the application requests a composed fat archive.
    pub fat_archive: bool,
    /// Zero-based primary layer.
    pub primary_layer: u8,
    /// Zero-based View layer.
    pub view_layer: u8,
}

fn refused(message: impl Into<String>) -> PrismError {
    PrismError::new("PP2027", message)
}

impl BinaryApplication {
    /// True for the session and checkpoint worlds.
    pub fn is_session(&self) -> bool {
        self.core_contract == SESSION || self.core_contract == CHECKPOINT
    }

    /// The largest frame the guest sees: the input count, each input's BLAKE3
    /// digest, length and bytes, then the payload (#630, "the resolved frame").
    pub fn resolved_frame_maximum(&self) -> u64 {
        4 + u64::from(self.input_count_maximum) * (32 + 4)
            + u64::from(self.input_total_maximum)
            + u64::from(self.request_maximum)
    }

    /// The session guest spec its build generates, for @2 and @3.
    pub fn session_spec(
        &self,
        crate_name: &str,
        entry: &str,
        input_ir_sha256: &str,
    ) -> Option<SessionGuestSpec> {
        let session = self.session.as_ref()?;
        Some(SessionGuestSpec {
            crate_name: crate_name.to_owned(),
            entry: entry.to_owned(),
            request_maximum: u32::try_from(self.resolved_frame_maximum()).ok()?,
            state_maximum: session.state_maximum,
            response_maximum: self.response_maximum,
            response_count_maximum: session.response_count_maximum,
            maximum_pages: self.core_memory_pages,
            stack_bytes: self.core_stack_bytes,
            input_ir_sha256: input_ir_sha256.to_owned(),
            checkpoint: self.core_contract == CHECKPOINT,
        })
    }
}

/// Every rule of the profile the schema cannot state. `PP2027` names the first
/// broken one; a declaration that passes is one the build can generate.
pub fn validate(value: &BinaryApplication) -> Result<(), PrismError> {
    if value.profile != PROFILE {
        return Err(refused(format!(
            "the profile is {}, not {PROFILE}",
            value.profile
        )));
    }
    let session_contract = match value.core_contract.as_str() {
        STATELESS => false,
        SESSION | CHECKPOINT => true,
        other => {
            return Err(refused(format!(
                "{other} is not a guest contract of a binary application"
            )))
        }
    };
    match (session_contract, &value.session) {
        (false, Some(_)) => {
            return Err(refused(
                "a stateless guest declares session bounds; its session member must be none",
            ))
        }
        (true, None) => return Err(refused("a session-world guest declares no session bounds")),
        _ => {}
    }
    if session_contract {
        if !value.acceptance_vectors.is_empty() || value.acceptance_sessions.is_empty() {
            return Err(refused(
                "a session-world application is accepted by sessions, never by vectors",
            ));
        }
        if value.acceptance_sessions.iter().any(Vec::is_empty) {
            return Err(refused("an acceptance session has no step"));
        }
    } else if value.acceptance_vectors.is_empty() || !value.acceptance_sessions.is_empty() {
        return Err(refused(
            "a stateless application is accepted by vectors, never by sessions",
        ));
    }
    for (name, bound) in [
        ("request", value.request_maximum),
        ("response", value.response_maximum),
    ] {
        if bound == 0 || bound > MAXIMUM_PAYLOAD {
            return Err(refused(format!(
                "the {name} maximum {bound} is outside 1..=64 MiB"
            )));
        }
    }
    if value.input_count_maximum > MAXIMUM_INPUTS
        || value.input_maximum > MAXIMUM_INPUT_BYTES
        || value.input_total_maximum > MAXIMUM_INPUT_BYTES
        || value.input_maximum > value.input_total_maximum
        || (value.input_count_maximum == 0) != (value.input_total_maximum == 0)
    {
        return Err(refused(
            "the input bounds must be at most 64 inputs and 1 GiB, one input no larger than all of them, and zero together",
        ));
    }
    if let Some(session) = &value.session {
        if session.response_count_maximum == 0
            || session.response_count_maximum > RESPONSE_COUNT_LIMIT
        {
            return Err(refused(format!(
                "the response count maximum {} is outside 1..={RESPONSE_COUNT_LIMIT}",
                session.response_count_maximum
            )));
        }
    }
    frame_fits(value)?;
    acceptance_is_closed(value)
}

/// The resolved frame, the answer and the stack fit the declared memory.
fn frame_fits(value: &BinaryApplication) -> Result<(), PrismError> {
    let memory = u64::from(value.core_memory_pages) * PAGE;
    if value.core_memory_pages == 0 || value.core_memory_pages > 32_767 {
        return Err(refused(format!(
            "core memory pages {} are outside 1..=32767",
            value.core_memory_pages
        )));
    }
    if value.is_session() {
        let spec = value
            .session_spec("binary-application", "step", &"0".repeat(64))
            .ok_or_else(|| refused("the resolved frame does not fit a 32-bit length"))?;
        if let Some(problem) = spec.bounds_problem() {
            return Err(refused(format!(
                "the declared frame does not fit: {problem}"
            )));
        }
        return Ok(());
    }
    let needed = value.resolved_frame_maximum()
        + u64::from(value.response_maximum)
        + u64::from(value.core_stack_bytes);
    if value.core_stack_bytes == 0 || !value.core_stack_bytes.is_multiple_of(16) || needed > memory
    {
        return Err(refused(format!(
            "the resolved frame, the response and the stack need {needed} bytes; the declared memory is {memory}"
        )));
    }
    Ok(())
}

/// Every request, response and input of the acceptance is within its bound,
/// and every input it names is one the model carries.
fn acceptance_is_closed(value: &BinaryApplication) -> Result<(), PrismError> {
    let mut carried = BTreeSet::new();
    let mut corpus = 0usize;
    for input in &value.acceptance_inputs {
        if input.len() > MAXIMUM_ACCEPTANCE_INPUT || input.len() > value.input_maximum as usize {
            return Err(refused(
                "an acceptance input is over 1 MiB or over the declared input maximum",
            ));
        }
        corpus = corpus.saturating_add(input.len());
        if !carried.insert(blake3::hash(input).as_bytes().to_vec()) {
            return Err(refused("an acceptance input is carried twice"));
        }
    }
    let named = |inputs: &[Vec<u8>], request: &[u8]| -> Result<usize, PrismError> {
        if inputs.len() > value.input_count_maximum as usize
            || request.len() > value.request_maximum as usize
        {
            return Err(refused(
                "an acceptance request is over its declared request or input count maximum",
            ));
        }
        let mut total = 0u64;
        for digest in inputs {
            if digest.len() != 32 || !carried.contains(digest) {
                return Err(refused(
                    "the acceptance names an input the model does not carry",
                ));
            }
            let bytes = value
                .acceptance_inputs
                .iter()
                .find(|input| blake3::hash(input).as_bytes().as_slice() == digest.as_slice())
                .map_or(0, Vec::len);
            total += bytes as u64;
        }
        if total > u64::from(value.input_total_maximum) {
            return Err(refused(
                "an acceptance request names more input bytes than the declared total",
            ));
        }
        Ok(request.len())
    };
    for vector in &value.acceptance_vectors {
        corpus = corpus.saturating_add(named(&vector.inputs, &vector.request)?);
        if vector.response.len() > value.response_maximum as usize {
            return Err(refused(
                "an acceptance response is over the declared response maximum",
            ));
        }
        corpus = corpus.saturating_add(vector.response.len());
    }
    let count = value
        .session
        .as_ref()
        .map_or(0, |session| session.response_count_maximum as usize);
    for step in value.acceptance_sessions.iter().flatten() {
        corpus = corpus.saturating_add(named(&step.inputs, &step.request)?);
        if step.responses.len() > count
            || step
                .responses
                .iter()
                .any(|response| response.len() > value.response_maximum as usize)
        {
            return Err(refused(
                "an acceptance step answers more or longer responses than declared",
            ));
        }
        corpus = corpus.saturating_add(step.responses.iter().map(Vec::len).sum());
    }
    if corpus > MAXIMUM_CORPUS_BYTES {
        return Err(refused("the acceptance corpus is over 16 MiB"));
    }
    Ok(())
}

// ------------------------------------------------------------------ projection

type Row = (&'static str, &'static str, &'static str);

fn fields(kind: &str) -> Option<&'static [Row]> {
    Some(match kind {
        "BinaryApplication" => &[
            ("profile", "profile", "String"),
            ("name", "name", "String"),
            ("cargoName", "cargo_name", "String"),
            ("cargoVersion", "cargo_version", "String"),
            ("cargoDescription", "cargo_description", "String"),
            ("cargoRepository", "cargo_repository", "String"),
            ("cargoHomepage", "cargo_homepage", "String"),
            ("libraryRoots", "library_roots", "ListString"),
            ("entryRoot", "entry_root", "String"),
            ("coreContract", "core_contract", "String"),
            ("requestMaximum", "request_maximum", "UInt32"),
            ("responseMaximum", "response_maximum", "UInt32"),
            ("inputCountMaximum", "input_count_maximum", "UInt32"),
            ("inputMaximum", "input_maximum", "UInt32"),
            ("inputTotalMaximum", "input_total_maximum", "UInt32"),
            ("coreMemoryPages", "core_memory_pages", "UInt32"),
            ("coreStackBytes", "core_stack_bytes", "UInt32"),
            ("session", "session", "Session"),
            (
                "acceptanceVectors",
                "acceptance_vectors",
                "ListAcceptanceVector",
            ),
            (
                "acceptanceSessions",
                "acceptance_sessions",
                "ListListAcceptanceStep",
            ),
            ("acceptanceInputs", "acceptance_inputs", "ListBytes"),
            ("capabilitiesEmpty", "capabilities_empty", "Bool"),
            ("fatArchive", "fat_archive", "Bool"),
            ("primaryLayer", "primary_layer", "UInt8"),
            ("viewLayer", "view_layer", "UInt8"),
        ],
        "SessionBounds" => &[
            ("stateMaximum", "state_maximum", "UInt32"),
            ("responseCountMaximum", "response_count_maximum", "UInt32"),
        ],
        "AcceptanceVector" => &[
            ("request", "request", "Bytes"),
            ("inputs", "inputs", "ListBytes"),
            ("response", "response", "Bytes"),
        ],
        "AcceptanceStep" => &[
            ("request", "request", "Bytes"),
            ("inputs", "inputs", "ListBytes"),
            ("responses", "responses", "ListBytes"),
        ],
        _ => return None,
    })
}

/// The source type a closed list of `kind` names as its element.
fn source_type(kind: &str) -> Value {
    if let Some(element) = kind.strip_prefix("List") {
        return json!({"kind": "list", "element": source_type(element)});
    }
    match kind {
        "String" => json!({"kind": "string"}),
        "Bytes" => json!({"kind": "bytes"}),
        _ => json!({"kind": "named", "member": {"module": MODULE, "name": kind}, "arguments": []}),
    }
}

struct Projector<'a> {
    definitions: &'a Definitions<'a>,
    fuel: usize,
    bytes: usize,
}

impl<'a> Projector<'a> {
    fn step(&mut self) -> Result<(), PrismError> {
        self.fuel = self.fuel.checked_sub(1).ok_or_else(|| {
            refused("the binary application declaration exceeds its traversal budget")
        })?;
        Ok(())
    }

    /// Follow closed zero-argument aliases to the value they name.
    fn resolve(
        &mut self,
        mut owner: &'a str,
        mut value: &'a Value,
    ) -> Result<(&'a str, &'a Value), PrismError> {
        let mut visited = BTreeSet::new();
        loop {
            self.step()?;
            if value["kind"] != "call" {
                return Ok((owner, value));
            }
            if !value["arguments"].as_array().is_some_and(Vec::is_empty) {
                return Err(refused(
                    "a binary application declaration calls a function with arguments",
                ));
            }
            let name = value["function"]["name"]
                .as_str()
                .ok_or_else(|| refused("a binary application alias is malformed"))?;
            if let Some(module) = value["function"].get("module") {
                owner = module
                    .as_str()
                    .ok_or_else(|| refused("a binary application alias owner is malformed"))?;
            }
            if !visited.insert((owner, name)) {
                return Err(refused("a binary application alias is cyclic"));
            }
            let declaration = self
                .definitions
                .get(&(owner.to_owned(), name.to_owned()))
                .ok_or_else(|| refused("a binary application alias is unknown"))?;
            if !declaration["parameters"]
                .as_array()
                .is_some_and(Vec::is_empty)
            {
                return Err(refused("a binary application alias has parameters"));
            }
            value = declaration
                .get("body")
                .ok_or_else(|| refused("a binary application alias has no body"))?;
        }
    }

    fn list(
        &mut self,
        owner: &'a str,
        value: &'a Value,
        element: &str,
    ) -> Result<Value, PrismError> {
        let mut result = Vec::new();
        let (mut module, mut current) = (owner, value);
        loop {
            (module, current) = self.resolve(module, current)?;
            if current["kind"] == "nil" {
                if current.get("element") != Some(&source_type(element)) {
                    return Err(refused(
                        "a binary application list has a substituted element type",
                    ));
                }
                return Ok(Value::Array(result));
            }
            if current["kind"] != "cons" || result.len() == 65_536 {
                return Err(refused(
                    "a binary application list is malformed or oversized",
                ));
            }
            let head = current
                .get("head")
                .ok_or_else(|| refused("a binary application list has no head"))?;
            result.push(self.value(module, head, element)?);
            current = current
                .get("tail")
                .ok_or_else(|| refused("a binary application list has no tail"))?;
        }
    }

    fn integer(value: &Value, kind: &str) -> Result<Value, PrismError> {
        let representation = if kind == "UInt32" { "uint32" } else { "uint8" };
        let text = value["value"]
            .as_str()
            .filter(|_| value["representation"] == representation);
        let number = text
            .and_then(|text| {
                text.parse::<u32>()
                    .ok()
                    .filter(|number| number.to_string() == text)
            })
            .filter(|number| kind == "UInt32" || *number <= 255)
            .ok_or_else(|| {
                refused("a binary application integer is not a canonical value of its type")
            })?;
        Ok(json!(number))
    }

    fn octets(&mut self, value: &Value) -> Result<Value, PrismError> {
        let hex = value["hex"]
            .as_str()
            .ok_or_else(|| refused("binary application bytes are malformed"))?;
        self.bytes = self.bytes.saturating_add(hex.len() / 2);
        if hex.len() % 2 != 0
            || self.bytes > MAXIMUM_CORPUS_BYTES
            || !hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(refused(
                "binary application bytes are noncanonical or over 16 MiB in all",
            ));
        }
        Ok(Value::Array(
            hex.as_bytes()
                .chunks_exact(2)
                .map(|pair| {
                    json!(
                        u8::from_str_radix(std::str::from_utf8(pair).expect("ASCII hex"), 16)
                            .expect("checked hex")
                    )
                })
                .collect(),
        ))
    }

    fn session(&mut self, owner: &'a str, value: &'a Value) -> Result<Value, PrismError> {
        let name = value["constructor"]["name"].as_str();
        if value["kind"] != "constructor" || value["constructor"]["module"] != MODULE {
            return Err(refused("the session member is not a source-owned Session"));
        }
        let arguments = value["arguments"].as_array().map_or(&[][..], Vec::as_slice);
        match (name, arguments) {
            (Some("Session.none"), []) => Ok(Value::Null),
            (Some("Session.bounded"), [bounds]) => self.value(owner, bounds, "SessionBounds"),
            _ => Err(refused("the session member is neither none nor bounded")),
        }
    }

    fn record(
        &mut self,
        owner: &'a str,
        value: &'a Value,
        kind: &str,
    ) -> Result<Value, PrismError> {
        let expected = fields(kind).ok_or_else(|| refused("an unknown binary application type"))?;
        if value["kind"] != "record" || value["type"] != json!({"module": MODULE, "name": kind}) {
            return Err(refused(format!(
                "a {kind} record is not the source-owned type"
            )));
        }
        let rows = value["fields"]
            .as_array()
            .ok_or_else(|| refused("a binary application record has no fields"))?;
        if rows.len() != expected.len() {
            return Err(refused(format!(
                "a {kind} record does not have exactly its declared fields"
            )));
        }
        let mut seen = BTreeSet::new();
        let mut result = Map::new();
        for row in rows {
            let field = row["field"]
                .as_str()
                .ok_or_else(|| refused("a binary application field is malformed"))?;
            let (_, output, ty) = expected
                .iter()
                .find(|row| row.0 == field)
                .ok_or_else(|| refused(format!("{field} is not a field of {kind}")))?;
            if !seen.insert(field) {
                return Err(refused(format!("{field} is given twice")));
            }
            let value = row
                .get("value")
                .ok_or_else(|| refused("a binary application field has no value"))?;
            result.insert((*output).to_owned(), self.value(owner, value, ty)?);
        }
        Ok(Value::Object(result))
    }

    fn value(&mut self, owner: &'a str, value: &'a Value, kind: &str) -> Result<Value, PrismError> {
        let (owner, value) = self.resolve(owner, value)?;
        if let Some(element) = kind.strip_prefix("List") {
            return self.list(owner, value, element);
        }
        match kind {
            "String" if value["kind"] == "string" => {
                let text = value["value"]
                    .as_str()
                    .ok_or_else(|| refused("a binary application string is malformed"))?;
                if text.len() > 4096 {
                    return Err(refused("a binary application string is over 4096 bytes"));
                }
                Ok(Value::String(text.to_owned()))
            }
            "Bool" if value["kind"] == "bool" => value["value"]
                .as_bool()
                .map(Value::Bool)
                .ok_or_else(|| refused("a binary application Bool is malformed")),
            "UInt32" | "UInt8" if value["kind"] == "integer" => Self::integer(value, kind),
            "Bytes" if value["kind"] == "bytes" => self.octets(value),
            "Session" => self.session(owner, value),
            "String" | "Bool" | "UInt32" | "UInt8" | "Bytes" => Err(refused(format!(
                "a binary application value is not a closed {kind}"
            ))),
            _ => self.record(owner, value, kind),
        }
    }
}

/// Project the closed `BinaryApplication` declaration, then hold it to every
/// rule of the profile.
pub(in crate::holo) fn project<'a>(
    definitions: &'a Definitions<'a>,
    owner: &'a str,
    declaration: &'a Value,
) -> Result<BinaryApplication, PrismError> {
    if declaration.get("result") != Some(&source_type("BinaryApplication"))
        || !declaration["parameters"]
            .as_array()
            .is_some_and(Vec::is_empty)
    {
        return Err(refused(
            "a binary application is a closed value of the source-owned BinaryApplication type",
        ));
    }
    let body = declaration
        .get("body")
        .ok_or_else(|| refused("the binary application has no body"))?;
    let value = Projector {
        definitions,
        fuel: 1 << 20,
        bytes: 0,
    }
    .value(owner, body, "BinaryApplication")?;
    let application: BinaryApplication = serde_json::from_value(value)
        .map_err(|_| refused("the binary application projection is not closed"))?;
    validate(&application)?;
    Ok(application)
}

/// The entry root is an executable `Bytes -> Bytes` definition of the snapshot.
pub fn validate_roots(
    value: &BinaryApplication,
    snapshot: &lexlean::SemanticSnapshot,
) -> Result<(), PrismError> {
    let found = snapshot.modules().iter().any(|module| {
        module.declarations().iter().any(|declaration| {
            declaration.kind() == "definition"
                && format!("{}.{}", module.name(), declaration.logical_id()) == value.entry_root
        })
    });
    if found {
        Ok(())
    } else {
        Err(PrismError::new(
            "PP2001",
            format!(
                "the binary application entry root {} is not defined",
                value.entry_root
            ),
        ))
    }
}

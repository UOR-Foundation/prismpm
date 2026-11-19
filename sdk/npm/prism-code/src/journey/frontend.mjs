/**
 * Where LexLean's front end runs for an app. No step runs a local image.
 *
 * - `wasm`: LexLean as WebAssembly on this machine (lexlean-wasm.mjs). It
 *   checks the model and takes its semantic snapshot; it has no Lean in it.
 *   A rule app needs nothing more: Lean's kernel judges its guarantees in
 *   this process.
 * - `kernel`: any other app's theorems, proved in this process from the
 *   semantic snapshot by the kernel path (model-prove.mjs): the model lowered
 *   to Lean kernel declarations, a proof found for each theorem, and Lean's
 *   own kernel judging all of it. It is the default prover, and sends nothing.
 * - `hosted`: the hosted verifier at mcp.uor.foundation, only when the user
 *   sets PRISM_CODE_TIER=hosted. It runs `lexlean verify` and stores the
 *   model unlisted, not privately. PRISM_CODE_TIER=offline sends nothing
 *   anywhere.
 *
 */
import { PrismCodeError } from '../errors.mjs';

/** The proposal phase that put LexLean's front end in WebAssembly. */
export const PHASE_3 = 'docs/proposals/canonical-serverless-build.md, Phase 3: LexLean\'s front end as WebAssembly';
/** The phase that proves an app's own theorems with no Lean toolchain: kernel terms produced in-process. */
export const PHASE_4 = 'docs/proposals/canonical-serverless-build.md, Phase 4: in-process proof producers';

/** Where each step runs, said wherever the state matters. */
export const NO_DOCKER_FREE_BUILD = `No step needs Docker or an image. LexLean runs as WebAssembly on this machine (${PHASE_3}), fetched once (about 4 MB) and checked against its BLAKE3 label; it checks every app. Every app's theorems are then proved by Lean's own kernel, as WebAssembly, in this process (${PHASE_4}), fetched once (about 1.7 MB) and checked the same way. Nothing about the app is sent anywhere unless the user sets PRISM_CODE_TIER=hosted; PRISM_CODE_TIER=offline sends nothing.`;

/** No place to run the step. `code` is `build.frontend-unavailable`. */
export function frontendUnavailable(why) {
  return new PrismCodeError('build.frontend-unavailable', `${why}. ${NO_DOCKER_FREE_BUILD}`);
}

const offline = (env) => env.PRISM_CODE_TIER === 'offline';

/** Where the front end runs: `hosted` when the user asked for it, else `wasm` when it is here, else `hosted` unless the user is offline. */
export function frontendWhere({ env = process.env, hasWasm = () => false } = {}) {
  if (env.PRISM_CODE_TIER === 'hosted') return 'hosted';
  if (hasWasm()) return 'wasm';
  if (!offline(env)) return 'hosted';
  throw frontendUnavailable('LexLean as WebAssembly is not on this machine, and PRISM_CODE_TIER=offline sends nothing to the hosted verifier');
}

/** Where an app's theorems are proved: Lean's kernel in this process, or the hosted verifier when the user asked for it. */
export function proverWhere({ env = process.env } = {}) {
  return env.PRISM_CODE_TIER === 'hosted' ? 'hosted' : 'kernel';
}

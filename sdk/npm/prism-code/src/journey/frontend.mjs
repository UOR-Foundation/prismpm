/**
 * Where LexLean's front end runs for an app: the program that checks the
 * model, exports its semantic snapshot, and has Lean prove it.
 *
 * - `wasm`: LexLean as WebAssembly on this machine (lexlean-wasm.mjs), with
 *   no Docker, no toolchain and no server. It checks and takes the snapshot;
 *   it has no Lean in it, so it proves nothing by itself. A rule app needs
 *   nothing more: Lean's kernel judges its guarantees in this process.
 * - `local`: the SDK image on this machine, which needs Docker. It is where
 *   `lexlean verify` proves an app's theorems.
 * - `hosted`: the hosted verifier at mcp.uor.foundation, only when the user
 *   sets PRISM_CODE_TIER=hosted. It stores the model unlisted, not privately.
 *   Prism never picks it on the user's behalf.
 *
 * With none, a step fails with `build.frontend-unavailable`. There is no
 * fallback.
 */
import { PrismCodeError } from '../errors.mjs';

/** The proposal phase that put LexLean's front end in WebAssembly. */
export const PHASE_3 = 'docs/proposals/canonical-serverless-build.md, Phase 3: LexLean\'s front end as WebAssembly';
/** The phase that proves an app's own theorems with no Lean toolchain: kernel terms produced in-process. */
export const PHASE_4 = 'docs/proposals/canonical-serverless-build.md, Phase 4: in-process proof producers';

/** What runs with no Docker, said wherever the state matters. */
export const NO_DOCKER_FREE_BUILD = `Without Docker, LexLean runs as WebAssembly on this machine (${PHASE_3}) from its pinned copy, fetched once (about 4 MB) and checked against its κ-label: it checks every app and takes its semantic snapshot, and a rule app is then proved by Lean's kernel in this process and built with no server. Proving any other app's theorems needs Lean, the SDK image (Docker) or the hosted verifier when you set PRISM_CODE_TIER=hosted, until in-process proof producers land (${PHASE_4}).`;

/** No place to run the step. `code` is `build.frontend-unavailable`. */
export function frontendUnavailable(why) {
  return new PrismCodeError('build.frontend-unavailable', `${why}. ${NO_DOCKER_FREE_BUILD} Prism does not choose the hosted verifier for you: it sends the model to mcp.uor.foundation and stores it unlisted.`);
}

/**
 * Where the front end runs: `hosted` when the user opted in, else `wasm` when
 * LexLean as WebAssembly is here, else `local` when the SDK image can run
 * here. Throws `build.frontend-unavailable` otherwise.
 */
export function frontendWhere({ env = process.env, hasWasm = () => false, hasLocal = () => false } = {}) {
  if (env.PRISM_CODE_TIER === 'hosted') return 'hosted';
  if (hasWasm()) return 'wasm';
  if (hasLocal()) return 'local';
  throw frontendUnavailable('LexLean as WebAssembly is not on this machine, there is no SDK image, and PRISM_CODE_TIER=hosted is not set');
}

/** Where `lexlean verify` proves an app's theorems: the user's hosted opt-in, else the SDK image. Throws when neither is here. */
export function proverWhere({ env = process.env, hasLocal = () => false } = {}) {
  if (env.PRISM_CODE_TIER === 'hosted') return 'hosted';
  if (hasLocal()) return 'local';
  throw frontendUnavailable("Proving this app's theorems needs Lean, and there is no SDK image and PRISM_CODE_TIER=hosted is not set");
}

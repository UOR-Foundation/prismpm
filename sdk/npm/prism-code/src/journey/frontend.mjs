/**
 * Where LexLean's front end runs for an app: the program that checks the
 * model, exports its semantic snapshot, and has Lean prove it.
 *
 * The canonical build runs it as WebAssembly on the user's machine, with no
 * Docker and no toolchain (docs/proposals/canonical-serverless-build.md,
 * Phase 3). That is not built yet. Until it is, there are two places, and
 * Prism never picks the second on the user's behalf:
 *
 * - `local`: the SDK image on this machine, which needs Docker;
 * - `hosted`: the hosted verifier at mcp.uor.foundation, only when the user
 *   sets PRISM_CODE_TIER=hosted. It stores the model unlisted, not privately.
 *
 * With neither, every check, proof and build fails with
 * `build.frontend-unavailable`, which names Phase 3 as what is missing. There
 * is no fallback.
 */
import { PrismCodeError } from '../errors.mjs';

/** The proposal phase that removes the need for the SDK image or the hosted verifier. */
export const PHASE_3 = 'docs/proposals/canonical-serverless-build.md, Phase 3: LexLean\'s front end as WebAssembly';

/** Why there is no Docker-free build yet, said wherever the state matters. */
export const NO_DOCKER_FREE_BUILD = `A Docker-free build is temporarily unavailable: LexLean's front end does not run as WebAssembly yet (${PHASE_3}). Until it does, checking, proving and building an app needs the SDK image on this machine (Docker), or the hosted verifier when you set PRISM_CODE_TIER=hosted.`;

/** Neither place is available. `code` is `build.frontend-unavailable`. */
export function frontendUnavailable(why) {
  return new PrismCodeError('build.frontend-unavailable', `${why}. ${NO_DOCKER_FREE_BUILD} Prism does not choose the hosted verifier for you: it sends the model to mcp.uor.foundation and stores it unlisted.`);
}

/**
 * Where the front end runs: `hosted` when the user opted in, `local` when the
 * SDK image can run here. Throws `build.frontend-unavailable` otherwise.
 * `local` is decided by `hasLocal()`, which says whether Docker and the image
 * are on this machine (or the image can be pulled, for a build).
 */
export function frontendWhere({ env = process.env, hasLocal = () => false } = {}) {
  if (env.PRISM_CODE_TIER === 'hosted') return 'hosted';
  if (hasLocal()) return 'local';
  throw frontendUnavailable('There is no SDK image on this machine, and PRISM_CODE_TIER=hosted is not set');
}

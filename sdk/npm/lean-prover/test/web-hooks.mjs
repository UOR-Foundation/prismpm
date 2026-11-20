// Module resolution for loading web/ in Node, as web/serve.mjs lays it out for a browser: `./blake3.mjs` is this
// package's BLAKE3 and `./src/` its src folder.
export async function resolve(specifier, context, next) {
  const parent = context.parentURL ?? "";
  if (/\/web\/[^/]+\.mjs(\?|$)/.test(parent)) {
    if (specifier === "./blake3.mjs") return next(new URL("../src/vendor/blake3.mjs", parent).href, context);
    if (specifier.startsWith("./src/")) return next(new URL(`../${specifier.slice(2)}`, parent).href, context);
  }
  return next(specifier, context);
}

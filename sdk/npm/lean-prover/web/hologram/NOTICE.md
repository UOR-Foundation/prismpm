# hologram_store

`hologram_store.js` and `hologram_store_bg.wasm` are built from Hologram's `hologram-store` crate
(Hologram-Technologies/hologram, commit 12bc8cb), licensed MIT OR Apache-2.0. The sealed prover uses only
`address`: BLAKE3 over bytes, the same labels as `src/vendor/blake3.mjs`, about 40 times faster in WebAssembly.
The seal pins both files by SHA-256 (`web/seal.json`, `bootstrap`).

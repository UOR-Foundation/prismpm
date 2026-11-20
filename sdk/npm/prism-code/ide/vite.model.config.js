// The build of the model editor alone (model.html). The spike's own page (index.html) needs files that are fetched,
// not committed, so it is built separately, by vite.config.js.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

export default mergeConfig(base, defineConfig({
  publicDir: false,
  build: { outDir: 'dist-model', emptyOutDir: true, rollupOptions: { input: 'model.html' } },
}));

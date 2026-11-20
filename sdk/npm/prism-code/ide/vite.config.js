import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'esnext', minify: false, sourcemap: false },
  worker: { format: 'es' },
  preview: { cors: true },
  plugins: [{
    name: 'load-vscode-css-as-string',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, options);
      if (resolved && /node_modules\/(@codingame\/monaco-vscode|vscode|monaco-editor).*\.css$/.test(resolved.id)) {
        return { ...resolved, id: resolved.id + '?inline' };
      }
      return undefined;
    },
  }],
});

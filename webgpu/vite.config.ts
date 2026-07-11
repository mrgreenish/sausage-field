import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  publicDir: path.resolve(import.meta.dirname, '../shared-assets'),
  build: { target: 'es2022', sourcemap: true },
});

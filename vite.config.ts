import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` genera un único dist/index.html autocontenido (JS y CSS en línea) que funciona
// abierto con doble clic desde el disco (file://), sin servidor.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});

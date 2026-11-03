import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Unik ID for hvert bygg. Appen sammenligner sin egen ID med version.json
// og laster seg selv på nytt når en nyere versjon er publisert.
const BUILD_ID = process.env.GITHUB_SHA || String(Date.now());

export default defineConfig({
  // Relative stier: appen virker både på jurgmaister.github.io/braryd/ og på eget domene.
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { chunkSizeWarningLimit: 900 },
  plugins: [
    react(),
    {
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
});

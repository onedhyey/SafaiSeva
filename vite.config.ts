import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Service worker: src/sw.ts, precache manifest injected at build (audit F9).
      // The web manifest stays hand-written in public/manifest.webmanifest.
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
          // The main bundle is ~680 kB; keep it precachable.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
        devOptions: {enabled: false},
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Optional: set DISABLE_HMR=true to turn off hot-reload and file watching.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

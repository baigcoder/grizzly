/// <reference types="vitest" />
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `vite preview` falls back to the home page for deep links. Production hosts serve the prerendered
 * folder (dist/products/peach/index.html) for /products/peach; this makes preview do the same.
 */
const servePrerenderedRoutes = (): Plugin => ({
  name: 'serve-prerendered-routes',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '');
      if (path && !/\.[a-z0-9]+$/i.test(path) && existsSync(resolve('dist', `.${path}`, 'index.html'))) {
        req.url = `${path}/index.html`;
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), servePrerenderedRoutes()],
  build: {
    rollupOptions: {
      output: {
        // Vendor code changes far less often than the app: separate, stable file names keep it cached
        // across deploys, and the 3D engine stays out of the first-paint bundle (it loads with the scene).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (/node_modules\/three\//.test(id)) return 'vendor-three';
          if (/node_modules\/lenis\//.test(id)) return 'vendor-motion';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  server: {
    port: 3000,
    host: true,
    watch: {
      usePolling: true,
    },
  },
});

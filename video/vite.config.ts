import { defineConfig } from 'vite';

// The film page: served on its own, reading the site's label art from ../public.
export default defineConfig({
  root: '.',
  publicDir: '../public',
  server: { port: 5190, strictPort: true, fs: { allow: ['..'] }, watch: { ignored: ['**/.cache/**', '**/out/**', '**/film/**', '**/brag-output/**'] } },
});

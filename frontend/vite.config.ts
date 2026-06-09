import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run dev` the SPA proxies API + media calls to the backend on :3000.
// In production these are served by nginx (see frontend/nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/media': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});

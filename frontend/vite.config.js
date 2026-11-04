import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // In local dev, proxy /api calls to your local backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});


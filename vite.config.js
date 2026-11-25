import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
        secure: false,
        ws: false,
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname,'index.html'),
        preparations: resolve(import.meta.dirname,'review/preparations.html')
      }
    }
  }
});


import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env from project root (parent directory)
    const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
    return {
      server: {
        port: 4567,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:4568',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

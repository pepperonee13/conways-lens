import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    open: true,
    port: 5174,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});

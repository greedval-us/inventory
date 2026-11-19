import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  cacheDir: '../../.cache/vite',
  plugins: [
    vue(),
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
          .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5175");
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  build: { outDir: '../../build/renderer', emptyOutDir: true },
});

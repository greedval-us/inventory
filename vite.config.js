import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { win7Colors } from './scripts/legacy/win7Colors.mjs';

export default defineConfig(({ mode }) => ({
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
  css: mode === 'win7' ? { postcss: { plugins: [win7Colors()] } } : undefined,
  build: {
    ...(mode === 'win7' && { target: 'chrome108', cssTarget: 'chrome108' }),
    outDir: mode === 'win7' ? '../../build/legacy/renderer' : '../../build/renderer',
    emptyOutDir: true,
  },
}));

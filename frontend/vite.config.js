import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Static SPA build — no SSR — so `dist/` drops straight into an S3 bucket
// behind CloudFront. Remember to configure CloudFront to rewrite 403/404 to
// /index.html so client-side routes survive a hard refresh.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor code so a product-page tweak doesn't bust the whole
        // cache for returning visitors. Function form — Vite 8's rolldown
        // bundler no longer accepts the object shorthand.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'react';
          }
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id)) return 'http';
          return undefined;
        },
      },
    },
  },
});

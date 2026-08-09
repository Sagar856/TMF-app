import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  // Using relative base path ('./') ensures assets are loaded with relative paths,
  // which works seamlessly across Android Capacitor WebView (preventing white screen),
  // GitHub Pages subpath deployment, and Netlify root deployment.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});

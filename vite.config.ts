import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from https://<user>.github.io/TMF-app/, so
  // the base path must match the repo name there. Netlify (and Capacitor's
  // local webDir) serve from the domain root, so base stays "/" everywhere
  // else. Set GITHUB_PAGES=true only in the GH Pages deploy workflow.
  base: process.env.GITHUB_PAGES === 'true' ? '/TMF-app/' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});

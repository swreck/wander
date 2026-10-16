import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // We provide our own manifest.json in public/
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  // The libraries in a file of their own: its name (and the phone's saved copy) stays the same from one deploy to the
  // next, so a phone fetches only Wander's own code again — it re-fetched all 1.1 MB on each deploy, on roaming data in
  // Japan (cost audit, Oct 16 2026). The app's file keeps its index-*.js name, which the deploy checks look for.
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/node_modules/') ? 'vendor' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})

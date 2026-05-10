import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GuardNet',
        short_name: 'GuardNet',
        description: 'GuardNet safety and awareness platform.',
        start_url: '/',
        display: 'standalone',
        background_color: '#eff6ff',
        theme_color: '#1d4ed8',
      },
    }),
  ],
})

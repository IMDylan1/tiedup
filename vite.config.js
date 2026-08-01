import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // works from any host path, including drag-and-drop static hosts
  server: {
    port: 5173,
    host: true // listen on the LAN so phones on the same Wi-Fi can connect
  }
})

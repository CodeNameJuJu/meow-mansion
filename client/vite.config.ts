import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8081', ws: true },
    },
  },
})

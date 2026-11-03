import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Der Dev-Server MUSS auf 127.0.0.1 laufen: atproto-OAuth erlaubt im
// "localhost exception"-Modus nur Redirect-URIs auf http://127.0.0.1/ oder
// http://[::1]/ (Port wird ignoriert). "http://localhost:5173" würde von den
// Authorization Servern abgelehnt.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        verify: resolve(__dirname, 'verify.html'),
      },
    },
  },
})

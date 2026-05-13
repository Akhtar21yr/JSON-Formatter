import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Absolute asset URLs so nested routes like /formatter/tree load JS/CSS from site root.
  base: '/',
})

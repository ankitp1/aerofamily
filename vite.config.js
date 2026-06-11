import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // urlValidator.test.js is a standalone Puppeteer script, not a vitest suite
    exclude: ['**/node_modules/**', 'tests/urlValidator.test.js'],
  },
})

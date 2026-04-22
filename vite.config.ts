import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/tests/**',
        'src/mocks/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
      ],
    },
  },
})

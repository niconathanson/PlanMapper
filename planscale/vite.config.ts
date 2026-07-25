import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
// Relative asset paths ('./') for the production build so it loads under the
// Electron app:// protocol; dev server stays at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  // Single source of truth for the version shown in the app: package.json,
  // which is bumped alongside Cargo.toml / tauri.conf.json for every release.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
}))

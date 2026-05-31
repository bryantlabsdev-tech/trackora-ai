import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  assertSupabaseClientEnvForDeploy,
  formatSupabaseBuildEnvLog,
} from './shared/supabaseClientEnv.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  console.log(formatSupabaseBuildEnvLog(env))
  assertSupabaseClientEnvForDeploy(env)

  return {
    // Relative asset paths for Capacitor WebView
    base: './',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  }
})

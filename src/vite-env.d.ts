/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional API origin override (no trailing slash). Default is https://trackora-ai.onrender.com */
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

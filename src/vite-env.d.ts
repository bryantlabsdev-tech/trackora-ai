/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional API origin override (no trailing slash). Default is https://trackora-ai.onrender.com */
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Accepted alias — prefer VITE_SUPABASE_PUBLISHABLE_KEY in Vercel */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Not exposed to client by Vite unless prefixed; listed for tooling only */
  readonly SUPABASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

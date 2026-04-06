/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional API origin override (no trailing slash). Default is https://trackora-ai.onrender.com */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

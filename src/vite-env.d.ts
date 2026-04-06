/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for native builds, e.g. http://192.168.1.10:3001 — no trailing slash */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

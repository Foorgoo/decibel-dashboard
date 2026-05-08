/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: 'dashboard' | 'trading';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

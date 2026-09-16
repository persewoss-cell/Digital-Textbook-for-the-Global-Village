/// <reference types="vite/client" />

declare module "*?url" {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_ADMIN_MASTER_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

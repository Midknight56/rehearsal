/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' in the test build (vite build --mode test); absent in the production build. */
  readonly VITE_REHEARSAL_TEST?: string;
}

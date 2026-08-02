/**
 * Whether `<PrivyProvider>` is mounted (see main.tsx) — `usePrivy()` throws
 * outside of it, so any component that calls it must be gated on this first.
 */
export const PRIVY_ENABLED = Boolean(import.meta.env.VITE_PRIVY_APP_ID);

/**
 * useDemoMode — returns true when the VITE_DEMO_MODE environment variable is
 * set to "true".
 *
 * Demo mode is enabled by default (VITE_DEMO_MODE=true in .env) so the app
 * works out of the box without a backend. Set VITE_DEMO_MODE=false to connect
 * to a real backend.
 */
export function useDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true'
}

/**
 * useDemoMode — returns true when the current URL contains `?demo=true`.
 *
 * Uses React Router's useSearchParams so the value is reactive and stays
 * in sync with the router state (unlike reading window.location.search directly,
 * which does not update when React Router navigates without a full page reload).
 */
import { useSearchParams } from 'react-router-dom'

export function useDemoMode(): boolean {
  const [searchParams] = useSearchParams()
  return searchParams.get('demo') === 'true'
}

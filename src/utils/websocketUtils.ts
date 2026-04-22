/**
 * Calculates the reconnection delay for a given attempt number using
 * exponential backoff, capped at 30 seconds.
 *
 * delay(n) = min(1000 * 2^n, 30000) milliseconds
 *
 * Examples:
 *   attempt 0 → 1000ms
 *   attempt 1 → 2000ms
 *   attempt 2 → 4000ms
 *   attempt 5 → 30000ms (capped)
 */
export function calculateReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

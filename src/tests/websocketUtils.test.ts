import { describe, it, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import * as fc from 'fast-check';
import { calculateReconnectDelay } from '@/utils/websocketUtils';

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('calculateReconnectDelay', () => {
  it('returns 1000ms for attempt 0', () => {
    expect(calculateReconnectDelay(0)).toBe(1000);
  });

  it('returns 2000ms for attempt 1', () => {
    expect(calculateReconnectDelay(1)).toBe(2000);
  });

  it('returns 4000ms for attempt 2', () => {
    expect(calculateReconnectDelay(2)).toBe(4000);
  });

  it('returns 8000ms for attempt 3', () => {
    expect(calculateReconnectDelay(3)).toBe(8000);
  });

  it('returns 16000ms for attempt 4', () => {
    expect(calculateReconnectDelay(4)).toBe(16000);
  });

  it('caps at 30000ms for attempt 5', () => {
    expect(calculateReconnectDelay(5)).toBe(30000);
  });

  it('caps at 30000ms for attempt 10', () => {
    expect(calculateReconnectDelay(10)).toBe(30000);
  });
});

/**
 * Property 12: WebSocket Reconnection Exponential Backoff
 * Validates: Requirements 7.7, 7.5
 *
 * For any sequence of reconnection attempts in [0, 10]:
 * - The delay sequence is non-decreasing
 * - No delay exceeds 30,000ms
 */
test.prop([fc.integer({ min: 0, max: 10 })])(
  'calculateReconnectDelay is non-decreasing and never exceeds 30000ms',
  (attempt) => {
    const delay = calculateReconnectDelay(attempt);

    // Never exceeds 30 seconds
    expect(delay).toBeLessThanOrEqual(30000);

    // Non-decreasing: delay for next attempt is >= current delay
    if (attempt < 10) {
      const nextDelay = calculateReconnectDelay(attempt + 1);
      expect(nextDelay).toBeGreaterThanOrEqual(delay);
    }

    // Delay is always positive
    expect(delay).toBeGreaterThan(0);
  }
);

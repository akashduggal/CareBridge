/**
 * Unit tests for the useDebounce hook
 *
 * Verifies that the hook correctly debounces a value by the specified delay,
 * only updating the returned value after the delay has elapsed since the last change.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('does not update the debounced value before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    )

    rerender({ value: 'updated', delay: 300 })

    // Before 300ms — still the old value
    act(() => {
      vi.advanceTimersByTime(299)
    })

    expect(result.current).toBe('initial')
  })

  it('updates the debounced value after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    )

    rerender({ value: 'updated', delay: 300 })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('updated')
  })

  it('resets the timer on each new value change (trailing debounce)', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    )

    // Type 'b' at t=0
    rerender({ value: 'b', delay: 300 })
    act(() => { vi.advanceTimersByTime(200) })

    // Type 'c' at t=200 — resets the timer
    rerender({ value: 'c', delay: 300 })
    act(() => { vi.advanceTimersByTime(200) })

    // At t=400 total, only 200ms since last change — still 'a'
    expect(result.current).toBe('a')

    // Advance to t=500 (300ms after last change)
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('c')
  })

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: number; delay: number }) => useDebounce(value, delay),
      { initialProps: { value: 1, delay: 300 } }
    )

    rerender({ value: 42, delay: 300 })

    act(() => { vi.advanceTimersByTime(300) })

    expect(result.current).toBe(42)
  })

  it('respects the specified delay (not hardcoded to 300ms)', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })

    // 300ms is not enough for a 500ms delay
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('initial')

    // 500ms is enough
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('updated')
  })
})

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface FocusTrapProps {
  children: React.ReactNode
  /** Whether the trap is active */
  active?: boolean
  /** Element to return focus to when trap deactivates */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

export function FocusTrap({ children, active = true, returnFocusRef }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    // Focus the first focusable element inside the trap
    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))

    const focusable = getFocusable()
    focusable[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return

      const els = getFocusable()
      const firstEl = els[0]
      const lastEl = els[els.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault()
          lastEl?.focus()
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault()
          firstEl?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Return focus to the triggering element when trap deactivates
      returnFocusRef?.current?.focus()
    }
  }, [active, returnFocusRef])

  return <div ref={containerRef}>{children}</div>
}

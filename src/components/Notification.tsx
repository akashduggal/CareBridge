import { useEffect, useRef } from 'react'

type NotificationVariant = 'status' | 'actionable' | 'error'

interface NotificationProps {
  message: string
  variant?: NotificationVariant
  /** Called when the notification is dismissed (manually or auto) */
  onDismiss: () => void
  /** Action button label — only shown for 'actionable' variant */
  actionLabel?: string
  /** Action button handler */
  onAction?: () => void
}

const VARIANT_CLASSES: Record<NotificationVariant, string> = {
  status: 'bg-gray-900 text-white',
  actionable: 'bg-blue-700 text-white',
  error: 'bg-red-700 text-white',
}

/** Auto-dismiss delay for status-only notifications (ms) */
const AUTO_DISMISS_MS = 5000

export function Notification({
  message,
  variant = 'status',
  onDismiss,
  actionLabel,
  onAction,
}: NotificationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Auto-dismiss only for status-only notifications
    if (variant === 'status') {
      timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS)
    }
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [variant, onDismiss])

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${VARIANT_CLASSES[variant]}`}
    >
      <span>{message}</span>
      <div className="flex items-center gap-2">
        {variant === 'actionable' && actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="rounded-md p-1 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

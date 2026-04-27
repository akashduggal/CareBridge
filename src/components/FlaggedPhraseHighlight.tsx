import { useId, useState } from 'react'

interface FlaggedPhraseHighlightProps {
  /** The flagged text to display */
  text: string
  /** Clinical reason shown in the tooltip */
  reason: string
}

/**
 * Renders a flagged phrase with:
 * - Red highlight meeting WCAG 2.1 AA ≥4.5:1 contrast (bg-red-100 / text-red-800)
 * - Keyboard-accessible tooltip (visible on hover AND focus) showing the clinical reason
 * - Proper ARIA tooltip pattern: role="tooltip" + aria-describedby
 */
export function FlaggedPhraseHighlight({ text, reason }: FlaggedPhraseHighlightProps) {
  const tooltipId = useId()
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline">
      {/* Highlighted trigger — tabIndex makes it keyboard-focusable */}
      <span
        tabIndex={0}
        role="mark"
        aria-describedby={tooltipId}
        className="cursor-help rounded bg-red-100 px-0.5 font-medium text-red-800 underline decoration-red-400 decoration-dotted underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        data-testid="flagged-phrase-highlight"
      >
        {text}
      </span>

      {/* Tooltip — always in DOM for aria-describedby, visually hidden when not active */}
      <span
        id={tooltipId}
        role="tooltip"
        className={[
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-xs -translate-x-1/2 rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg transition-opacity duration-150',
          visible ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        aria-hidden={!visible}
      >
        {reason}
        {/* Tooltip arrow */}
        <span
          className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900"
          aria-hidden="true"
        />
      </span>
    </span>
  )
}

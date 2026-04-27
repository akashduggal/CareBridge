import { useEffect } from 'react'
import { CallOutcomePill } from '@/components/CallOutcomePill'
import { FocusTrap } from '@/components/FocusTrap'
import { formatDateTime } from '@/utils/formatUtils'
import type { Call, CallOutcome, Discharge, Medication } from '@/types'

const VALID_OUTCOMES = new Set<CallOutcome>([
  'completed',
  'voicemail',
  'no_answer',
  'refused',
  'wrong_party',
])

interface DischargeDrawerProps {
  discharge: Discharge | null
  calls: Call[]
  isOpen: boolean
  onClose: () => void
  /** Ref to the element that triggered the drawer — focus returns here on close */
  triggerRef?: React.RefObject<HTMLElement | null>
}

export function DischargeDrawer({
  discharge,
  calls,
  isOpen,
  onClose,
  triggerRef,
}: DischargeDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !discharge) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Discharge details for ${discharge.patientName}`}
        className={[
          'fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col',
          'border-l border-gray-200 bg-white shadow-xl',
          'transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <FocusTrap active={isOpen} returnFocusRef={triggerRef}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              {discharge.patientName}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* Medication List */}
            <section aria-labelledby="drawer-medications-heading">
              <h3
                id="drawer-medications-heading"
                className="mb-3 text-sm font-semibold text-gray-700"
              >
                Medication List
              </h3>
              {discharge.medications.length === 0 ? (
                <p className="text-sm text-gray-500">No medications recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {discharge.medications.map((med: Medication, i: number) => (
                    <li
                      key={i}
                      className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {med.name}
                        {med.newMed && (
                          <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                            New
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {med.dose} · {med.frequency}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Call History Timeline */}
            <section aria-labelledby="drawer-call-history-heading">
              <h3
                id="drawer-call-history-heading"
                className="mb-3 text-sm font-semibold text-gray-700"
              >
                Call History
              </h3>
              {calls.length === 0 ? (
                <p className="text-sm text-gray-500">No calls recorded.</p>
              ) : (
                <ol className="relative border-l border-gray-200 pl-4 space-y-4">
                  {calls.filter((call) => VALID_OUTCOMES.has(call.outcome)).map((call) => (
                    <li key={call.id} className="relative">
                      <span className="absolute -left-[1.125rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" aria-hidden="true" />
                      <p className="text-xs text-gray-500">
                        {formatDateTime(call.startTime)}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <CallOutcomePill outcome={call.outcome} />
                        {call.riskScore !== undefined && (
                          <span className="text-xs text-gray-500">
                            Score: {call.riskScore}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </FocusTrap>
      </div>
    </>
  )
}

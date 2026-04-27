import type { CallOutcome } from '@/types'

const OUTCOME_CONFIG: Record<CallOutcome, { label: string; classes: string }> = {
  completed: { label: 'Completed', classes: 'bg-green-100 text-green-700' },
  voicemail: { label: 'Voicemail', classes: 'bg-blue-100 text-blue-700' },
  no_answer: { label: 'No Answer', classes: 'bg-gray-100 text-gray-600' },
  refused: { label: 'Refused', classes: 'bg-red-100 text-red-700' },
  wrong_party: { label: 'Wrong Party', classes: 'bg-orange-100 text-orange-700' },
}

const CALL_STATUS_FALLBACK: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-gray-100 text-gray-500' },
  in_progress: { label: 'In Progress', classes: 'bg-yellow-100 text-yellow-700' },
  failed: { label: 'Failed', classes: 'bg-red-100 text-red-600' },
}

interface CallOutcomePillProps {
  outcome: CallOutcome
}

export function CallOutcomePill({ outcome }: CallOutcomePillProps) {
  const config =
    OUTCOME_CONFIG[outcome] ??
    CALL_STATUS_FALLBACK[outcome] ??
    { label: outcome, classes: 'bg-gray-100 text-gray-500' }
  const { label, classes } = config
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}
    >
      {label}
    </span>
  )
}

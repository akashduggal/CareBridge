import type { Discharge } from '@/types'

type CallStatus = Discharge['callStatus']

const STATUS_CONFIG: Record<CallStatus, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-gray-100 text-gray-500' },
  in_progress: { label: 'In Progress', classes: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Completed', classes: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', classes: 'bg-red-100 text-red-600' },
}

interface CallStatusPillProps {
  status: CallStatus
}

export function CallStatusPill({ status }: CallStatusPillProps) {
  const { label, classes } = STATUS_CONFIG[status] ?? {
    label: status,
    classes: 'bg-gray-100 text-gray-500',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}
    >
      {label}
    </span>
  )
}

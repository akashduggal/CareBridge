import type { DiagnosisGroup } from '@/types'

const GROUP_COLORS: Record<DiagnosisGroup, string> = {
  CHF: 'bg-blue-100 text-blue-700',
  COPD: 'bg-teal-100 text-teal-700',
  AMI: 'bg-orange-100 text-orange-700',
  PNEUMONIA: 'bg-yellow-100 text-yellow-700',
  ORTHO: 'bg-indigo-100 text-indigo-700',
  OTHER: 'bg-gray-100 text-gray-700',
}

interface DiagnosisGroupBadgeProps {
  group: DiagnosisGroup
}

export function DiagnosisGroupBadge({ group }: DiagnosisGroupBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${GROUP_COLORS[group]}`}
    >
      {group}
    </span>
  )
}

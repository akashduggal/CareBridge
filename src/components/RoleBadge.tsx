import type { UserRole } from '@/types'

const ROLE_CONFIG: Record<UserRole, { label: string; classes: string }> = {
  admin: {
    label: 'Admin',
    classes: 'bg-purple-100 text-purple-800',
  },
  nurse: {
    label: 'Nurse',
    classes: 'bg-blue-100 text-blue-800',
  },
  physician: {
    label: 'Physician',
    classes: 'bg-green-100 text-green-800',
  },
}

interface RoleBadgeProps {
  role: UserRole
  className?: string
}

export function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const { label, classes } = ROLE_CONFIG[role]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes} ${className}`.trim()}
      aria-label={`Role: ${role}`}
    >
      {label}
    </span>
  )
}

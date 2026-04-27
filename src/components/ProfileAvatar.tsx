import { useState } from 'react'

interface ProfileAvatarProps {
  photoURL: string | null
  displayName: string | null
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
}

function extractInitials(displayName: string | null): string {
  if (!displayName || displayName.trim() === '') return '?'
  const words = displayName.trim().split(/\s+/)
  const first = words[0].charAt(0).toUpperCase()
  if (words.length === 1) return first
  const last = words[words.length - 1].charAt(0).toUpperCase()
  return first + last
}

export function ProfileAvatar({
  photoURL,
  displayName,
  size = 'md',
}: ProfileAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const sizeClasses = SIZE_CLASSES[size]
  const initials = extractInitials(displayName)

  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={displayName ?? ''}
        className={`${sizeClasses} rounded-full object-cover`}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span
      className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800`}
      aria-label={displayName ? `Avatar for ${displayName}` : 'Avatar'}
    >
      {initials}
    </span>
  )
}

/** Animated skeleton placeholder for card-shaped content */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 ${className}`}
      role="status"
      aria-label="Loading"
      aria-busy="true"
    />
  )
}

/** Animated skeleton placeholder for a single table row */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr role="row" aria-label="Loading row" aria-busy="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-gray-200" />
        </td>
      ))}
    </tr>
  )
}

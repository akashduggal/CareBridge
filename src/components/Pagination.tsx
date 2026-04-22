const PAGE_SIZE = 25

interface PaginationProps {
  page: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-gray-200 px-4 py-3"
    >
      <p className="text-sm text-gray-600">
        Page <span className="font-medium">{page}</span> of{' '}
        <span className="font-medium">{totalPages}</span>
        {total > 0 && (
          <>
            {' '}
            &mdash; <span className="font-medium">{total}</span> total
          </>
        )}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Next page"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Next
        </button>
      </div>
    </nav>
  )
}

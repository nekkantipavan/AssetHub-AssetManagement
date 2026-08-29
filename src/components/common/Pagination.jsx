import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({
  totalItems = 0,
  currentPage = 1,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100, 250],
  className = ''
}) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  function handlePageSizeSelect(e) {
    const newSize = parseInt(e.target.value, 10)
    if (onPageSizeChange) {
      onPageSizeChange(newSize)
    }
  }

  // Generate page numbers array with ellipses for clean layout
  function getPageNumbers() {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages)
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
      }
    }
    return pages
  }

  if (totalItems === 0) return null

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl px-5 py-3.5 shadow-card border border-cream-200 dark:border-gray-700/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${className}`}>
      {/* Items info & Rows per page selector */}
      <div className="flex items-center gap-4 flex-wrap text-ink-500 dark:text-gray-400">
        <span>
          Showing <strong className="font-semibold text-ink-900 dark:text-gray-100">{startItem}</strong> to{' '}
          <strong className="font-semibold text-ink-900 dark:text-gray-100">{endItem}</strong> of{' '}
          <strong className="font-semibold text-ink-900 dark:text-gray-100">{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={handlePageSizeSelect}
              className="bg-cream-100 dark:bg-gray-700 border border-cream-200 dark:border-gray-600 rounded-xl px-2.5 py-1 text-xs text-ink-900 dark:text-gray-100 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-cream-200 dark:border-gray-700 hover:bg-cream-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent text-ink-600 dark:text-gray-300 transition-colors"
          title="Previous Page"
        >
          <ChevronLeft size={16} />
        </button>

        {getPageNumbers().map((p, idx) => (
          <React.Fragment key={idx}>
            {p === '...' ? (
              <span className="px-2 py-1 text-ink-400 dark:text-gray-500">...</span>
            ) : (
              <button
                onClick={() => onPageChange(p)}
                className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-semibold transition-all ${
                  currentPage === p
                    ? 'bg-brand-500 text-white shadow-soft'
                    : 'text-ink-600 dark:text-gray-300 hover:bg-cream-100 dark:hover:bg-gray-700 border border-cream-200 dark:border-gray-700'
                }`}
              >
                {p}
              </button>
            )}
          </React.Fragment>
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-cream-200 dark:border-gray-700 hover:bg-cream-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent text-ink-600 dark:text-gray-300 transition-colors"
          title="Next Page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

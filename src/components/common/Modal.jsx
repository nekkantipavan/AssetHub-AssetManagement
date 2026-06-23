import { useEffect } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(46,46,46,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={clsx('bg-white dark:bg-gray-800 rounded-3xl shadow-medium w-full flex flex-col max-h-[90vh]', sizes[size])}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-base font-bold border-cream-200 dark:border-gray-700">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-cream-100 dark:bg-gray-800 flex items-center justify-center transition-colors"
          >
            <X size={16} className="text-ink-500" />
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

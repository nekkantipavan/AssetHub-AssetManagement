import clsx from 'clsx'

export default function Button({ children, variant = 'primary', size = 'md', className, onClick, type = 'button', disabled }) {
  const base = 'inline-flex items-center gap-2 font-semibold rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary:   'bg-orange-gradient text-white shadow-soft hover:shadow-medium hover:opacity-90',
    secondary: 'bg-white dark:bg-gray-800 text-ink-700 border border-cream-300 hover:bg-cream-100 dark:bg-gray-800',
    ghost:     'text-ink-500 hover:bg-cream-200 hover:border-cream-200 dark:border-gray-700',
    danger:    'bg-red-500 text-white hover:bg-red-600 shadow-soft',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(base, variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  )
}

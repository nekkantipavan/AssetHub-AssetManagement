import clsx from 'clsx'

export default function Card({ children, className, highlight = false, padding = true }) {
  return (
    <div
      className={clsx(
        'rounded-3xl shadow-card transition-all duration-200',
        highlight ? 'bg-orange-gradient text-white' : 'bg-white dark:bg-gray-800',
        padding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

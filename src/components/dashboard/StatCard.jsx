import clsx from 'clsx'

export default function StatCard({ icon: Icon, label, value, sub, highlight = false, trend }) {
  return (
    <div className={clsx(
      'rounded-3xl p-6 shadow-card transition-all duration-200 hover:shadow-medium',
      highlight
        ? 'bg-orange-gradient text-white'
        : 'bg-white dark:bg-gray-800 dark:bg-gray-800 border-cream-200 dark:border-gray-700 dark:text-white'
    )}>
      
      <div className="flex items-start justify-between mb-4">
        
        {/* Icon */}
        <div className={clsx(
          'w-10 h-10 rounded-2xl flex items-center justify-center',
          highlight
            ? 'bg-white dark:bg-gray-800/20'
            : 'bg-orange-soft dark:bg-gray-700'
        )}>
          <Icon size={20} className={highlight ? 'text-white' : 'text-brand-600 dark:text-brand-400'} />
        </div>

        {/* Trend */}
        {trend && (
          <span className={clsx(
            'text-xs font-semibold px-2 py-1 rounded-xl',
            highlight
              ? 'bg-white dark:bg-gray-800/20 text-white'
              : trend > 0
                ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400'
          )}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>

      {/* Value */}
      <p className={clsx(
        'text-2xl font-bold',
        highlight
          ? 'text-white'
          : 'border-cream-200 dark:border-gray-700 dark:text-white'
      )}>
        {value}
      </p>

      {/* Label */}
      <p className={clsx(
        'text-sm mt-0.5',
        highlight
          ? 'text-white/80'
          : 'text-ink-500 dark:text-gray-400'
      )}>
        {label}
      </p>

      {/* Subtext */}
      {sub && (
        <p className={clsx(
          'text-xs mt-1',
          highlight
            ? 'text-white/60'
            : 'text-ink-300 dark:text-gray-400 dark:text-gray-500'
        )}>
          {sub}
        </p>
      )}
    </div>
  )
}
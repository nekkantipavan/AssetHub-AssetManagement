import clsx from 'clsx'

const statusColors = {
  Active:        'bg-green-50 text-green-700',
  Inactive:      'bg-gray-100 text-gray-500',
  'In Transfer': 'bg-blue-50 text-blue-700',
  Completed:     'bg-green-50 text-green-700',
  Pending:       'bg-yellow-50 text-yellow-700',
  'In Progress': 'bg-blue-50 text-blue-700',
  Admin:         'bg-orange-50 text-orange-700',
  Manager:       'bg-purple-50 text-purple-700',
  User:          'bg-gray-100 text-gray-600',
  Returnable:    'bg-teal-50 text-teal-700',
  'Non-Returnable': 'bg-rose-50 text-rose-700',
}

export function Badge({ label, className }) {
  return (
    <span className={clsx('badge', statusColors[label] || 'bg-gray-100 text-gray-600', className)}>
      {label}
    </span>
  )
}

export function DotBadge({ label }) {
  const colors = {
    Active:   'bg-green-500',
    Inactive: 'bg-gray-400',
    Pending:  'bg-yellow-500',
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('w-1.5 h-1.5 rounded-full', colors[label] || 'bg-gray-400')} />
      <span className="text-sm text-ink-700">{label}</span>
    </span>
  )
}

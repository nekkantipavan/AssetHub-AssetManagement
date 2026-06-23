import clsx from 'clsx'

export function Input({ label, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-ink-700">{label}</label>}
      <input
        className={clsx('input-field', className)}
        {...props}
      />
    </div>
  )
}

export function Select({ label, children, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-ink-700">{label}</label>}
      <select
        className={clsx('input-field appearance-none cursor-pointer', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function Textarea({ label, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-ink-700">{label}</label>}
      <textarea
        className={clsx('input-field resize-none', className)}
        {...props}
      />
    </div>
  )
}

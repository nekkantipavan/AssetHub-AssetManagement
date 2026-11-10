import { useId } from 'react'
import clsx from 'clsx'

export function Input({ label, className, error, ...props }) {
  const generatedId = useId()
  const id = props.id || generatedId
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-ink-700 dark:text-gray-300">{label}</label>}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : undefined}
        className={clsx('input-field', className)}
        {...props}
      />
      {error && <p id={id + '-error'} role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function Select({ label, children, className, error, ...props }) {
  const generatedId = useId()
  const id = props.id || generatedId
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-ink-700 dark:text-gray-300">{label}</label>}
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : undefined}
        className={clsx('input-field appearance-none cursor-pointer', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p id={id + '-error'} role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function Textarea({ label, className, error, ...props }) {
  const generatedId = useId()
  const id = props.id || generatedId
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-ink-700 dark:text-gray-300">{label}</label>}
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : undefined}
        className={clsx('input-field resize-none', className)}
        {...props}
      />
      {error && <p id={id + '-error'} role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

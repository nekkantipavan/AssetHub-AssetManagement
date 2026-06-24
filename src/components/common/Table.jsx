import clsx from 'clsx'

export function Table({ children, className, tableClassName }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className={clsx('w-full', tableClassName)}>{children}</table>
    </div>
  )
}

export function Thead({ children }) {
  return (
    <thead>
      <tr className="border-b border-cream-200">{children}</tr>
    </thead>
  )
}

export function Th({ children, className }) {
  return (
    <th className={clsx('px-4 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap', className)}>
      {children}
    </th>
  )
}

export function Tbody({ children }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, onClick, className }) {
  return (
    <tr
      onClick={onClick}
      className={clsx('table-row', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className }) {
  return (
    <td className={clsx('px-4 py-2.5 text-sm text-ink-700 whitespace-nowrap', className)}>
      {children}
    </td>
  )
}

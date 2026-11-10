import { useEffect, useRef, useId } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const dialog = useRef()
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()
  useEffect(() => {
    const node = dialog.current
    if (isOpen && !node.open) {
      node.showModal()
      node.querySelector('input:not([type="hidden"]), textarea, select')?.focus()
    }
    if (!isOpen && node.open) node.close()
    return () => { if (node.open) node.close() }
  }, [isOpen])
  const sizes = { sm:'max-w-md', md:'max-w-xl', lg:'max-w-3xl', xl:'max-w-5xl' }
  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); close.current() }}
    onClick={e => { if (e.target === e.currentTarget) close.current() }}
    className={clsx('m-auto w-[calc(100%-2rem)] border-0 p-0 rounded-3xl bg-white dark:bg-gray-800 text-ink-900 dark:text-gray-100 shadow-medium backdrop:bg-black/40 backdrop:backdrop-blur-sm', sizes[size])}>
    <div className="flex flex-col max-h-[90dvh]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 dark:border-gray-700 flex-shrink-0">
        <h2 id={titleId} className="text-base font-bold">{title}</h2>
        <button type="button" aria-label="Close dialog" onClick={() => close.current()} className="w-9 h-9 rounded-xl hover:bg-cream-100 dark:hover:bg-gray-700 flex items-center justify-center"><X size={16}/></button>
      </div>
      <div className="overflow-y-auto flex-1 px-6 py-5">{isOpen && children}</div>
    </div>
  </dialog>
}

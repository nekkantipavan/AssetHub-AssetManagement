import { AlertCircle, Loader2 } from 'lucide-react'
export default function PageState({ error, onRetry, label = 'Loading…' }) {
  return <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 text-center" role={error ? 'alert' : 'status'}>
    {error ? <AlertCircle className="mx-auto mb-3 text-red-500" size={24}/> : <Loader2 className="mx-auto mb-3 animate-spin text-brand-500" size={24}/>}
    <p className="text-sm text-ink-600 dark:text-gray-300">{error || label}</p>
    {error && onRetry && <button className="mt-3 text-sm font-semibold text-brand-600 underline" onClick={onRetry}>Try again</button>}
  </div>
}

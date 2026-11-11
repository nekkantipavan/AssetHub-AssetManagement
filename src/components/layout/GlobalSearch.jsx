import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { getAssets } from '../../data/api'
import { useAuth } from '../../context/AuthContext'
import useDebounced from '../../hooks/useDebounced'

export default function GlobalSearch() {
  const { canAccess } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const container = useRef(null)
  const input = useRef(null)
  const listId = useId()
  const statusId = useId()
  const debounced = useDebounced(query, 250)
  const allowed = canAccess('assets') !== false
  const waiting = loading || query !== debounced
  const showResults = open && !waiting && !error && query.trim()
  const activeId = showResults && activeIndex >= 0 && results[activeIndex]
    ? listId + '-' + activeIndex : undefined

  function close() {
    setOpen(false)
    setActiveIndex(-1)
  }

  function clear() {
    setQuery('')
    setResults([])
    setError('')
    setLoading(false)
    setActiveIndex(-1)
  }

  useEffect(() => {
    close()
    clear()
  }, [pathname])

  useEffect(() => {
    function shortcut(event) {
      if (allowed && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    function outside(event) {
      if (!container.current?.contains(event.target)) close()
    }
    document.addEventListener('keydown', shortcut)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', shortcut)
      document.removeEventListener('pointerdown', outside)
    }
  }, [allowed])

  useEffect(() => {
    if (!allowed || !open || !query.trim() || query !== debounced) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getAssets({ search: debounced.trim(), pageSize: 8 }, controller.signal)
      .then(response => {
        if (!controller.signal.aborted) {
          setResults(response.data.data)
          setActiveIndex(-1)
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setResults([])
          setError(err.response?.data?.error || 'Search is unavailable. Please try again.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [allowed, open, query, debounced])

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  function choose(id) {
    close()
    clear()
    input.current?.blur()
    navigate('/assets/' + id)
  }

  function handleKeys(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (waiting || !results.length || error) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(index => {
        if (index < 0) return direction > 0 ? 0 : results.length - 1
        return (index + direction + results.length) % results.length
      })
    }
    if (event.key === 'Enter' && activeId) {
      event.preventDefault()
      choose(results[activeIndex].id)
    }
  }

  if (!allowed) return null

  const status = !query.trim()
    ? 'Search by asset code, serial number, description or custodian.'
    : waiting ? 'Searching…'
      : error || (results.length ? results.length + ' matching assets' + (results.length === 8 ? ' · showing the first 8' : '')
        : 'No matching assets. Try a shorter code, serial number or name.')

  return (
    <div ref={container} className="relative w-full"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
      <div className="flex h-11 w-full items-center gap-3 rounded-xl border border-cream-200 bg-cream-50 px-4 text-ink-500 transition-colors focus-within:border-brand-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-200 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-300 dark:focus-within:border-brand-500 dark:focus-within:bg-gray-800 dark:focus-within:ring-brand-900">
        <Search size={18} className="shrink-0" aria-hidden="true"/>
        <input ref={input} role="combobox" aria-label="Search assets" aria-autocomplete="list"
          aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={activeId}
          aria-describedby={open ? statusId : undefined} autoComplete="off" spellCheck={false}
          placeholder="Search assets, serial numbers…" value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeys}
          onChange={event => {
            setQuery(event.target.value)
            setResults([])
            setError('')
            setActiveIndex(-1)
            setLoading(!!event.target.value.trim())
            setOpen(true)
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white dark:placeholder:text-gray-400"/>
        {query ? <button type="button" aria-label="Clear search" className="rounded p-1 hover:bg-cream-200 dark:hover:bg-gray-700"
          onClick={() => { clear(); input.current?.focus(); setOpen(true) }}><X size={15}/></button>
          : <kbd className="hidden shrink-0 rounded-md border border-cream-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-ink-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 sm:inline">Ctrl K</kbd>}
      </div>

      {open && <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-medium dark:border-gray-600 dark:bg-gray-800">
        <p id={statusId} role="status" aria-live="polite"
          className="border-b border-cream-100 px-4 py-3 text-xs text-ink-500 dark:border-gray-700 dark:text-gray-400">{status}</p>
        <div id={listId} role="listbox" aria-label="Matching assets" aria-busy={!!query.trim() && waiting}
          className="max-h-[min(55dvh,400px)] overflow-y-auto p-1.5">
          {showResults && results.map((asset, index) => (
            <button key={asset.id} id={listId + '-' + index} type="button" role="option"
              aria-selected={activeIndex === index} tabIndex={-1}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(asset.id)}
              className={'flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors hover:bg-brand-50 dark:hover:bg-gray-700 ' +
                (activeIndex === index ? 'bg-brand-50 dark:bg-gray-700' : '')}>
              <span className="min-w-0">
                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">{asset.asset_code} / {asset.sub_sequence}</span>
                <span className="block truncate text-sm text-ink-900 dark:text-white">{asset.name}</span>
                <span className="block truncate text-xs text-ink-500 dark:text-gray-400">{asset.plant_name} · {asset.assigned_employee || asset.employee_name || 'Unassigned'}</span>
              </span>
              <ArrowUpRight size={16} className="shrink-0 text-ink-400" aria-hidden="true"/>
            </button>
          ))}
        </div>
      </div>}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { Search, Download, ChevronDown, ChevronRight, User, Clock, Globe, Tag, ArrowRight } from 'lucide-react'
import Button from '../components/common/Button'
import { getAuditLogs } from '../data/api'

const MODULES = ['All', 'Assets', 'Transfer', 'Users', 'Masters']

const ACTION_STYLE = {
  'Asset Created':              'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'Asset Modified':             'bg-blue-50 text-blue-700 border border-blue-200',
  'Asset Deleted':              'bg-red-50 text-red-700 border border-red-200',
  'Bulk Upload':                'bg-purple-50 text-purple-700 border border-purple-200',
  'Transfer Created':           'bg-orange-50 text-orange-700 border border-orange-200',
  'Transfer Created & Emailed': 'bg-orange-50 text-orange-700 border border-orange-200',
  'Transfer Created (Email Failed)': 'bg-orange-50 text-orange-700 border border-orange-200',
  'Transfer Approved':          'bg-teal-50 text-teal-700 border border-teal-200',
  'Transfer Rejected':          'bg-red-50 text-red-700 border border-red-200',
  'Transfer Completed':         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'Return Initiated':           'bg-amber-50 text-amber-700 border border-amber-200',
  'Return Approved':            'bg-teal-50 text-teal-700 border border-teal-200',
  'Return Rejected':            'bg-red-50 text-red-700 border border-red-200',
  'User Created':               'bg-indigo-50 text-indigo-700 border border-indigo-200',
  'User Modified':              'bg-blue-50 text-blue-700 border border-blue-200',
  'Password Changed':           'bg-yellow-50 text-yellow-700 border border-yellow-200',
  'Password Reset':             'bg-yellow-50 text-yellow-700 border border-yellow-200',
  'Plant Added':                'bg-indigo-50 text-indigo-700 border border-indigo-200',
  'Department Added':           'bg-indigo-50 text-indigo-700 border border-indigo-200',
  'Master Added':               'bg-indigo-50 text-indigo-700 border border-indigo-200',
  'Master Updated':             'bg-blue-50 text-blue-700 border border-blue-200',
  'Master Removed':             'bg-red-50 text-red-700 border border-red-200',
  'Login':                      'bg-gray-50 text-gray-700 border border-gray-200',
}

const FIELD_LABELS = {
  asset_code:      'Asset Code',
  name:            'Name',
  serial_number:   'Serial Number',
  acquisition_value: 'Value (₹)',
  plant_id:        'Plant',
  dept_id:         'Department',
  assigned_user_id:'Assigned User',
  status:          'Status',
  employee_id:     'Employee ID',
  username:        'Username',
  email:           'Email',
  role:            'Role',
  value:           'Value',
  sort_order:      'Sort Order',
  is_active:       'Active',
}

function formatFieldValue(val) {
  if (val === null || val === undefined || val === '') return <span className="italic text-gray-400">—</span>
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

function DiffWizard({ meta, details }) {
  if (meta?.old && meta?.new) {
    const fields = Object.keys(meta.old)
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-widest mb-2">Changes</p>
        <div className="rounded-2xl overflow-hidden border border-cream-200">
          <div className="grid grid-cols-2 divide-x divide-cream-200">
            <div className="bg-red-50 px-4 py-2.5">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Before</p>
              <dl className="space-y-1.5">
                {fields.map(k => (
                  <div key={k} className="flex items-start gap-2">
                    <dt className="text-xs text-red-400 font-medium w-28 shrink-0">{FIELD_LABELS[k] || k}</dt>
                    <dd className="text-xs text-red-700 font-semibold">{formatFieldValue(meta.old[k])}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="bg-emerald-50 px-4 py-2.5">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">After</p>
              <dl className="space-y-1.5">
                {fields.map(k => (
                  <div key={k} className="flex items-start gap-2">
                    <dt className="text-xs text-emerald-400 font-medium w-28 shrink-0">{FIELD_LABELS[k] || k}</dt>
                    <dd className="text-xs text-emerald-700 font-semibold">{formatFieldValue(meta.new[k])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (details) {
    return (
      <p className="mt-2 text-sm text-ink-500">{details}</p>
    )
  }
  return null
}

function AvatarInitials({ name }) {
  const initials = (name || 'S')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <div className="w-8 h-8 rounded-xl bg-orange-gradient flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials}
    </div>
  )
}

function LogRow({ log }) {
  const [open, setOpen] = useState(false)
  const hasDiff = log.meta?.old && log.meta?.new
  const actionStyle = ACTION_STYLE[log.action] || 'bg-gray-50 text-gray-600 border border-gray-200'

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        className={`border-b border-cream-100 cursor-pointer transition-colors ${open ? 'bg-cream-50' : 'hover:bg-cream-50/60'}`}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {open
              ? <ChevronDown size={13} className="text-brand-500" />
              : <ChevronRight size={13} className="text-ink-300" />
            }
            <span className="text-brand-600 font-bold text-xs font-mono">LOG-{log.id}</span>
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold ${actionStyle}`}>
            {hasDiff && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
            {log.action}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs bg-cream-100 dark:bg-gray-700 text-ink-600 px-2.5 py-1 rounded-lg font-medium">
            {log.module || '—'}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <AvatarInitials name={log.user_name} />
            <span className="text-sm font-medium text-ink-700">{log.user_name || 'System'}</span>
          </div>
        </td>
        <td className="px-4 py-3 max-w-xs">
          <span className="text-ink-400 text-sm truncate block">{log.details || '—'}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="font-mono text-xs text-ink-400">
            {new Date(log.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="font-mono text-xs text-ink-300">{log.ip_address || '—'}</span>
        </td>
      </tr>

      {open && (
        <tr className="bg-cream-50/80 border-b border-cream-200">
          <td colSpan={7} className="px-6 pb-5 pt-1">
            <div className="flex gap-4 items-start">
              <AvatarInitials name={log.user_name} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <span className="font-semibold text-sm text-ink-700">{log.user_name || 'System'}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${actionStyle}`}>{log.action}</span>
                  <span className="text-xs bg-cream-200 text-ink-500 px-2 py-0.5 rounded-lg">{log.module}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-300">
                    <Clock size={11} />
                    {new Date(log.created_at).toLocaleString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </span>
                  {log.ip_address && (
                    <span className="flex items-center gap-1 text-xs text-ink-300 font-mono">
                      <Globe size={11} />
                      {log.ip_address}
                    </span>
                  )}
                </div>
                <DiffWizard meta={log.meta} details={log.details} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function countToday(logs) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return logs.filter(l => new Date(l.created_at) >= today).length
}

function countThisWeek(logs) {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)
  return logs.filter(l => new Date(l.created_at) >= weekAgo).length
}

function countActiveUsers(logs) {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const names = new Set(logs.filter(l => l.user_name && new Date(l.created_at) >= weekAgo).map(l => l.user_name))
  return names.size
}

export default function AuditLogs() {
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [module, setModule]       = useState('All')
  const [dateFrom, setDateFrom]   = useState('')

  useEffect(() => {
    getAuditLogs()
      .then(res => { setAuditLogs(res.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return auditLogs.filter(l => {
      const matchModule = module === 'All' || l.module === module
      const matchSearch = !q ||
        l.action?.toLowerCase().includes(q) ||
        l.details?.toLowerCase().includes(q) ||
        l.user_name?.toLowerCase().includes(q)
      const matchDate = !dateFrom || new Date(l.created_at) >= new Date(dateFrom)
      return matchModule && matchSearch && matchDate
    })
  }, [auditLogs, search, module, dateFrom])

  function handleExport() {
    const csv = [
      ['Log ID', 'Action', 'Module', 'User', 'Details', 'Timestamp', 'IP Address'].join(','),
      ...filtered.map(l => [
        `LOG-${l.id}`, l.action, l.module, l.user_name || 'System',
        `"${(l.details || '').replace(/"/g, '""')}"`,
        new Date(l.created_at).toLocaleString(), l.ip_address || ''
      ].join(','))
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `audit-logs-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  if (loading) {
    return <div className="py-20 text-center text-ink-400 text-sm">Loading audit logs...</div>
  }

  const todayCount    = countToday(auditLogs)
  const weekCount     = countThisWeek(auditLogs)
  const activeUsers   = countActiveUsers(auditLogs)

  return (
    <div className="space-y-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Events',  value: auditLogs.length, color: 'bg-orange-gradient text-white' },
          { label: 'Today',         value: todayCount,        color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
          { label: 'This Week',     value: weekCount,         color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
          { label: 'Active Users',  value: activeUsers,       color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-3xl p-5 shadow-card ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by action, user, details..."
              className="pl-9 pr-4 py-2.5 bg-cream-100 dark:bg-gray-700 rounded-2xl text-sm placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 w-full"
            />
          </div>
          <div className="flex gap-1 bg-cream-100 dark:bg-gray-700 rounded-2xl p-1">
            {MODULES.map(m => (
              <button
                key={m}
                onClick={() => setModule(m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${module === m ? 'bg-orange-gradient text-white shadow-soft' : 'text-ink-400 hover:text-ink-700'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="input-field w-auto"
          />
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download size={13} /> Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold">Audit Trail</h3>
            <p className="text-xs text-ink-300 mt-0.5">{filtered.length} events — click a row to see details</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-200">
                {['Log ID', 'Action', 'Module', 'User', 'Details', 'Timestamp', 'IP Address'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => <LogRow key={l.id} log={l} />)}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-ink-300 text-sm">No logs match your filters</div>
        )}
      </div>
    </div>
  )
}

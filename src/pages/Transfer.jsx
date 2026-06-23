import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Filter, ArrowRight, Clock, CheckCircle,
  XCircle, AlertCircle, Truck, RotateCcw, Eye
} from 'lucide-react'
import Button from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { useAuth } from '../context/AuthContext'
import { getTransfers, deleteTransfer } from '../data/api'

const STATUS_COLORS = {
  'Pending Approval':  'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  'Approved':          'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  'In Transit':        'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  'Completed':         'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  'Partially Returned':'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  'Returned':          'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400',
  'Rejected':          'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
}

const STATUS_ICONS = {
  'Pending Approval':   Clock,
  'In Transit':         Truck,
  'Completed':          CheckCircle,
  'Partially Returned': RotateCcw,
  'Returned':           RotateCcw,
  'Rejected':           XCircle,
}

function StatusBadge({ status }) {
  const Icon = STATUS_ICONS[status] || AlertCircle
  const cls  = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      <Icon size={11}/>
      {status}
    </span>
  )
}

export default function Transfer() {
  const navigate = useNavigate()
  const { canEdit } = useAuth()
  const editable = canEdit('transfer')

  const [data,    setData]    = useState({ transfers:[], stats:{} })
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('All')
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    getTransfers()
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const statuses = ['All','Pending Approval','In Transit','Completed','Partially Returned','Returned','Rejected']

  const filtered = (data.transfers || []).filter(t => {
    const q = search.toLowerCase()
    const matchQ = !q ||
      t.transfer_code?.toLowerCase().includes(q) ||
      t.from_plant_name?.toLowerCase().includes(q) ||
      t.to_plant_name?.toLowerCase().includes(q) ||
      t.initiated_by_name?.toLowerCase().includes(q)
    const matchF = filter === 'All' || t.status === filter
    return matchQ && matchF
  })

  async function handleDelete(id, code) {
    if (!window.confirm(`Delete transfer ${code}? This will restore all assets.`)) return
    setDeleting(id)
    try {
      await deleteTransfer(id)
      setData(prev => ({ ...prev, transfers: prev.transfers.filter(t => t.id !== id) }))
    } catch(e) {
      alert(e.response?.data?.error || 'Delete failed')
    } finally { setDeleting(null) }
  }

  const stats = data.stats || {}

  return (
    <div className="space-y-5">

      {/* Stat tiles */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label:'Total',             value: stats.total             || 0, color:'bg-orange-gradient text-white', icon:ArrowRight },
          { label:'Pending Approval',  value: stats.pending_approval  || 0, color:'bg-yellow-50 dark:bg-yellow-900/20', icon:Clock,        text:'text-yellow-700 dark:text-yellow-400' },
          { label:'In Transit',        value: stats.in_transit        || 0, color:'bg-blue-50 dark:bg-blue-900/20',   icon:Truck,        text:'text-blue-700 dark:text-blue-400' },
          { label:'Partially Returned',value: stats.partially_returned|| 0, color:'bg-orange-50 dark:bg-orange-900/20',icon:RotateCcw,   text:'text-orange-700 dark:text-orange-400' },
          { label:'Completed',         value: stats.completed         || 0, color:'bg-green-50 dark:bg-green-900/20', icon:CheckCircle,  text:'text-green-700 dark:text-green-400' },
        ].map((s,i) => {
          const Icon = s.icon
          return (
            <div key={i} className={`rounded-3xl p-4 shadow-card ${s.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={i===0 ? 'text-white' : s.text}/>
              </div>
              <p className={`text-2xl font-bold ${i===0 ? 'text-white' : 'text-ink-900 dark:text-gray-100'}`}>{s.value}</p>
              <p className={`text-xs mt-0.5 ${i===0 ? 'text-white/70' : 'text-ink-400 dark:text-gray-400'}`}>{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search transfers…"
              className="pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-2xl shadow-soft text-sm
                         text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-brand-300 w-56"/>
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft px-3 py-2.5 text-sm
                       text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300">
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {editable && (
          <Button onClick={() => navigate('/transfer/new')}>
            <Plus size={15}/> New Transfer
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Transfer List</h3>
          <p className="text-xs text-ink-300 dark:text-gray-400">{filtered.length} transfers</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-ink-400 dark:text-gray-400">Loading transfers…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-cream-200 dark:border-gray-700">
                  {['Transfer ID','From Plant','To Plant','Type','Assets','Status','Date','Initiated By','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-750 transition-colors cursor-pointer"
                    onClick={() => navigate(`/transfer/${t.id}`)}>
                    <td className="px-4 py-3">
                      <span className="text-brand-600 font-semibold text-xs">{t.transfer_code}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-700 dark:text-gray-200">{t.from_plant_name}</td>
                    <td className="px-4 py-3 text-sm text-ink-700 dark:text-gray-200">{t.to_plant_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${t.transfer_type === 'Returnable'
                          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                          : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'}`}>
                        {t.transfer_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-ink-900 dark:text-gray-100">{t.asset_count}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status}/></td>
                    <td className="px-4 py-3 text-xs text-ink-400 dark:text-gray-400">
                      {new Date(t.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{t.initiated_by_name}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/transfer/${t.id}`)}
                          className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 text-ink-400 dark:text-gray-400 transition-colors">
                          <Eye size={14}/>
                        </button>
                        {editable && t.status === 'Pending Approval' && (
                          <button onClick={() => handleDelete(t.id, t.transfer_code)}
                            disabled={deleting === t.id}
                            className="p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 text-ink-400 dark:text-gray-400 transition-colors">
                            <XCircle size={14}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-16 text-center text-ink-300 dark:text-gray-500">
                <ArrowRight size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{data.transfers.length === 0 ? 'No transfers yet. Create one!' : 'No transfers match your filters.'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

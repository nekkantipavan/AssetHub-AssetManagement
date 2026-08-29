import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Clock, CheckCircle, XCircle, AlertCircle,
  ClipboardList, Hash, UserCheck, Eye
} from 'lucide-react'
import Button from '../components/common/Button'
import Pagination from '../components/common/Pagination'
import { useAuth } from '../context/AuthContext'
import { getAssetRequests, deleteAssetRequest } from '../data/api'

const STATUSES = ['All', 'Pending Dept Head', 'Waiting Asset Code', 'Pending Manager', 'Approved', 'Rejected']

const STATUS_COLORS = {
  'Pending Dept Head':  'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  'Waiting Asset Code': 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
  'Pending Manager':    'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  'Approved':           'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  'Rejected':           'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
}

const STATUS_ICONS = {
  'Pending Dept Head':  Clock,
  'Waiting Asset Code': Hash,
  'Pending Manager':    UserCheck,
  'Approved':           CheckCircle,
  'Rejected':           XCircle,
}

// How many of the 3 approval milestones are complete for a given status
const STAGE_PROGRESS = {
  'Pending Dept Head':  0,
  'Waiting Asset Code': 1,
  'Pending Manager':    2,
  'Approved':           3,
  'Rejected':          -1,
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

function StageDots({ status }) {
  const done = STAGE_PROGRESS[status] ?? 0
  if (done === -1) {
    return (
      <div className="flex items-center gap-1">
        {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-red-400"/>)}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1">
      {[0,1,2].map(i => (
        <span key={i} className={`w-2 h-2 rounded-full transition-colors ${
          i < done ? 'bg-green-500'
          : i === done ? 'bg-brand-500'
          : 'bg-cream-300 dark:bg-gray-600'}`}/>
      ))}
    </div>
  )
}

export default function AssetRequests() {
  const navigate = useNavigate()
  const { canAccess, user } = useAuth()
  const canCreate = canAccess('asset-requests') !== false

  const [data,     setData]     = useState({ requests: [], stats: {} })
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('All')
  const [deleting, setDeleting] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [search, filter])

  function load() {
    setLoading(true)
    getAssetRequests()
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const filtered = (data.requests || []).filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q ||
      r.request_code?.toLowerCase().includes(q) ||
      r.first_item?.toLowerCase().includes(q) ||
      r.requested_by_name?.toLowerCase().includes(q) ||
      r.dept_name?.toLowerCase().includes(q)
    const matchF = filter === 'All' || r.status === filter
    return matchQ && matchF
  })

  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  async function handleDelete(e, id, code) {
    e.stopPropagation()
    if (!window.confirm(`Delete asset request ${code}?`)) return
    setDeleting(id)
    try {
      await deleteAssetRequest(id)
      setData(prev => ({ ...prev, requests: prev.requests.filter(r => r.id !== id) }))
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed')
    } finally { setDeleting(null) }
  }

  const stats = data.stats || {}
  const tiles = [
    { label:'Pending Dept Head',  value: stats.pending_dept_head  || 0, icon:Clock,       color:'bg-amber-50 dark:bg-amber-900/20',   text:'text-amber-700 dark:text-amber-400'  },
    { label:'Waiting Asset Code', value: stats.waiting_asset_code || 0, icon:Hash,        color:'bg-purple-50 dark:bg-purple-900/20', text:'text-purple-700 dark:text-purple-400' },
    { label:'Pending Manager',    value: stats.pending_manager    || 0, icon:UserCheck,   color:'bg-blue-50 dark:bg-blue-900/20',     text:'text-blue-700 dark:text-blue-400'    },
    { label:'Approved',           value: stats.approved           || 0, icon:CheckCircle, color:'bg-green-50 dark:bg-green-900/20',    text:'text-green-700 dark:text-green-400'  },
    { label:'Rejected',           value: stats.rejected           || 0, icon:XCircle,     color:'bg-red-50 dark:bg-red-900/20',       text:'text-red-600 dark:text-red-400'      },
  ]

  return (
    <div className="space-y-5">

      {/* Stat tiles */}
      <div className="grid grid-cols-5 gap-3">
        {tiles.map((s, i) => {
          const Icon = s.icon
          return (
            <div key={i} className={`rounded-3xl p-4 shadow-card ${s.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={s.text}/>
              </div>
              <p className="text-2xl font-bold text-ink-900 dark:text-gray-100">{s.value}</p>
              <p className="text-xs mt-0.5 text-ink-400 dark:text-gray-400">{s.label}</p>
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
              placeholder="Search requests…"
              className="pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-2xl shadow-soft text-sm
                         text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-brand-300 w-56"/>
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft px-3 py-2.5 text-sm
                       text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300">
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/asset-requests/new')}>
            <Plus size={15}/> Request New Asset
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Asset Requests</h3>
          <p className="text-xs text-ink-300 dark:text-gray-400">{filtered.length} requests</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-ink-400 dark:text-gray-400">Loading requests…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-cream-200 dark:border-gray-700">
                  {['Request ID','Requested By','Items','Department','Status','Current Stage','Request Date','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => (
                  <tr key={r.id} className="border-b border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-750 transition-colors cursor-pointer"
                    onClick={() => navigate(`/asset-requests/${r.id}`)}>
                    <td className="px-4 py-3"><span className="text-brand-600 font-semibold text-xs">{r.request_code}</span></td>
                    <td className="px-4 py-3 text-sm text-ink-700 dark:text-gray-200">{r.requested_by_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-ink-700 dark:text-gray-200 max-w-[240px]">
                      <span className="truncate block">{r.first_item || '—'}</span>
                      {r.item_count > 1 && <span className="text-xs text-ink-300 dark:text-gray-500">+{r.item_count - 1} more</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{r.dept_name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status}/></td>
                    <td className="px-4 py-3"><StageDots status={r.status}/></td>
                    <td className="px-4 py-3 text-xs text-ink-400 dark:text-gray-400">{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/asset-requests/${r.id}`)}
                          className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 text-ink-400 dark:text-gray-400 transition-colors">
                          <Eye size={14}/>
                        </button>
                        {user?.role === 'Admin' && r.status !== 'Approved' && (
                          <button onClick={e => handleDelete(e, r.id, r.request_code)}
                            disabled={deleting === r.id}
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
                <ClipboardList size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{data.requests.length === 0 ? 'No asset requests yet. Create one!' : 'No requests match your filters.'}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Pagination
        totalItems={filtered.length}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1) }}
      />
    </div>
  )
}

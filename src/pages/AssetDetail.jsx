import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Box, Edit2, Trash2,
  Package, RotateCcw, Clock, CheckCircle, AlertTriangle, Shield
} from 'lucide-react'
import Button from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { useAuth } from '../context/AuthContext'
import { getAsset, deleteAsset } from '../data/api'

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const fmtDate = v => v ? new Date(v).toLocaleDateString('en-IN') : '—'
const fmtDT   = v => v ? new Date(v).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
}) : '—'

const TRANSFER_STATUS_COLOR = {
  'Completed':          'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  'In Transit':         'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  'Pending Approval':   'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  'Partially Returned': 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  'Returned':           'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400',
  'Rejected':           'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
}

const LOG_COLOR = {
  'Asset Created': 'bg-emerald-500',
  'Bulk Upload':   'bg-purple-500',
  'Asset Modified':'bg-blue-400',
}

function InfoRow({ label, value }) {
  if (!value || value === '—') return null
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-cream-100 dark:border-gray-700/60 last:border-0">
      <dt className="text-xs text-ink-400 dark:text-gray-400 flex-shrink-0 w-36">{label}</dt>
      <dd className="text-xs font-medium text-ink-800 dark:text-gray-200 text-right break-words">{value}</dd>
    </div>
  )
}

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canEdit, user } = useAuth()
  const editable = canEdit('assets')

  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    getAsset(id)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!window.confirm(
      `Delete "${data.asset.name}" (${data.asset.asset_code})? This cannot be undone.`
    )) return
    setDeleting(true)
    try {
      await deleteAsset(id)
      navigate('/assets')
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed')
      setDeleting(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading asset…</div>
  if (!data)   return <div className="py-20 text-center text-sm text-red-500">Asset not found.</div>

  const { asset, transfers, logs } = data

  // Build unified timeline sorted oldest-first
  const timeline = [
    ...transfers.map(t => ({ type: 'transfer', date: t.created_at, data: t })),
    ...logs.map(l      => ({ type: 'log',      date: l.created_at, data: l })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  // Warranty calc
  const today        = new Date()
  const warrantyEnd  = asset.warranty_date ? new Date(asset.warranty_date) : null
  const warrantyDays = warrantyEnd ? Math.ceil((warrantyEnd - today) / 86400000) : null
  const warrantyOk   = warrantyDays !== null && warrantyDays >= 0

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/assets')}
            className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400 dark:text-gray-400 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18}/>
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-ink-300 dark:text-gray-500 mb-1">
              <span>Assets</span>
              <ArrowRight size={10}/>
              <span>Asset Detail</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold text-ink-900 dark:text-gray-100">{asset.name}</h2>
              <span className="text-sm text-ink-400 dark:text-gray-400 font-mono">({asset.asset_code})</span>
              <Badge label={asset.status}/>
              {asset.asset_status && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 font-medium">
                  {asset.asset_status}
                </span>
              )}
            </div>
          </div>
        </div>
        {editable && (
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="secondary"
              onClick={() => navigate('/assets', { state: { editId: Number(id) } })}>
              <Edit2 size={14}/> Edit Asset
            </Button>
            {user?.role === 'Admin' && (
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14}/> {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Body: 3-column grid */}
      <div className="grid grid-cols-3 gap-5 items-start">

        {/* ── Left: Asset Information ─────────────────────────── */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
            {/* Icon + identity */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-cream-100 dark:border-gray-700">
              <div className="w-12 h-12 rounded-2xl bg-orange-gradient flex items-center justify-center shadow-soft flex-shrink-0">
                <Box size={22} className="text-white"/>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-ink-900 dark:text-gray-100 text-sm truncate">{asset.name}</p>
                <p className="text-xs text-ink-400 dark:text-gray-400 font-mono">{asset.sub_asset_code}</p>
              </div>
            </div>

            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-widest mb-2">
              Asset Information
            </p>
            <dl>
              <InfoRow label="Category"         value={asset.category} />
              <InfoRow label="Asset Class"       value={asset.asset_class} />
              <InfoRow label="Company Code"      value={asset.company_code} />
              <InfoRow label="Cost Center"       value={
                asset.cost_center
                  ? asset.cost_center + (asset.cost_center_description ? ` — ${asset.cost_center_description}` : '')
                  : null
              } />
              <InfoRow label="Serial Number"     value={asset.serial_number} />
              <InfoRow label="Manufacturer"      value={asset.make} />
              <InfoRow label="Supplier"          value={asset.supplier_name} />
              <InfoRow label="Ref. / Invoice No" value={asset.reference_invoice_no} />
              <InfoRow label="Fiscal Year"       value={asset.fiscal_year} />
              <InfoRow label="Acq. Value"        value={formatINR(asset.acquisition_value)} />
            </dl>

            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-widest mt-4 mb-2">
              Location & Assignment
            </p>
            <dl>
              <InfoRow label="Plant"         value={asset.plant_name} />
              <InfoRow label="Department"    value={asset.dept_name} />
              <InfoRow label="Assigned To"   value={asset.assigned_employee || asset.employee_name} />
            </dl>

            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-widest mt-4 mb-2">
              Dates
            </p>
            <dl>
              <InfoRow label="Capitalized On" value={fmtDate(asset.date_of_purchase)} />
              <InfoRow label="Warranty Until" value={fmtDate(asset.warranty_date)} />
              <InfoRow label="Created"        value={fmtDate(asset.created_at)} />
              <InfoRow label="Last Modified"  value={fmtDate(asset.updated_at)} />
            </dl>

            {asset.notes && (
              <div className="mt-4 pt-4 border-t border-cream-100 dark:border-gray-700">
                <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Notes</p>
                <p className="text-xs text-ink-600 dark:text-gray-300 leading-relaxed">{asset.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right 2/3: Summary + Timeline ───────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Quick Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card px-4 py-3">
              <p className="text-xs text-ink-300 dark:text-gray-400 mb-0.5">Total Transfers</p>
              <p className="text-2xl font-bold text-ink-900 dark:text-gray-100">{transfers.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card px-4 py-3">
              <p className="text-xs text-ink-300 dark:text-gray-400 mb-0.5">Acquisition Value</p>
              <p className="text-xl font-bold text-ink-900 dark:text-gray-100">{formatINR(asset.acquisition_value)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Shield size={12} className={warrantyOk ? 'text-green-500' : warrantyDays === null ? 'text-ink-300' : 'text-red-500'}/>
                <p className="text-xs text-ink-300 dark:text-gray-400">Warranty</p>
              </div>
              {warrantyEnd ? (
                <p className={`text-xl font-bold ${warrantyOk ? 'text-green-600' : 'text-red-500'}`}>
                  {warrantyOk ? `${warrantyDays}d left` : 'Expired'}
                </p>
              ) : (
                <p className="text-xl font-bold text-ink-300 dark:text-gray-500">—</p>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-widest mb-6">
              Asset Timeline
            </p>

            {timeline.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-300 dark:text-gray-500">
                <Clock size={28} className="mx-auto mb-2 opacity-30"/>
                No history recorded yet
              </div>
            ) : (
              <div>
                {timeline.map((event, i) => {
                  const isLast = i === timeline.length - 1

                  if (event.type === 'log') {
                    const log = event.data
                    const dotColor = LOG_COLOR[log.action] || 'bg-blue-400'
                    return (
                      <div key={`log-${log.id}`} className="flex gap-4">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${dotColor}`}/>
                          {!isLast && <div className="w-px flex-1 bg-cream-200 dark:bg-gray-700 my-1 min-h-[28px]"/>}
                        </div>
                        <div className="pb-5 flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-ink-900 dark:text-gray-100">{log.action}</p>
                              <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">
                                {log.user_name || 'System'}
                                {log.details && log.details !== `Asset ${asset.asset_code} updated` && log.details !== `${asset.asset_code} – ${asset.name}` && (
                                  <span className="ml-1 text-ink-300">· {log.details}</span>
                                )}
                              </p>
                            </div>
                            <span className="text-xs text-ink-300 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                              {fmtDT(log.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // Transfer event
                  const t = event.data
                  const statusCls = TRANSFER_STATUS_COLOR[t.status] || 'bg-gray-50 text-gray-600'
                  return (
                    <div key={`transfer-${t.id}`} className="flex gap-4">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 bg-orange-400"/>
                        {!isLast && <div className="w-px flex-1 bg-cream-200 dark:bg-gray-700 my-1 min-h-[28px]"/>}
                      </div>
                      <div className="pb-5 flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-ink-900 dark:text-gray-100">
                                Transfer — {t.from_plant_name || '?'} → {t.to_plant_name || '?'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <button
                                onClick={() => navigate(`/transfer/${t.id}`)}
                                className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                {t.transfer_code}
                              </button>
                              <span className="text-xs text-ink-400 dark:text-gray-400">{t.transfer_type}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>
                                {t.status}
                              </span>
                              {t.initiated_by_name && (
                                <span className="text-xs text-ink-400 dark:text-gray-400">
                                  by {t.initiated_by_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-ink-300 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                            {fmtDT(t.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

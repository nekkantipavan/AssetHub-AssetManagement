import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Hash, UserCheck,
  Package, Mail, Upload, Send
} from 'lucide-react'
import Button from '../components/common/Button'
import { useAuth } from '../context/AuthContext'
import { getAssetRequest, assignAssetCodes, resendAssetRequestApproval } from '../data/api'

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:2 })

const STATUS_COLORS = {
  'Pending Dept Head':  'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'Waiting Asset Code': 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  'Pending Manager':    'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  'Approved':           'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  'Rejected':           'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
}

function Timeline({ request }) {
  const s = request.status
  if (s === 'Rejected') {
    return (
      <div className="flex items-center gap-3 py-4 px-5 bg-red-50 dark:bg-red-900/20 rounded-2xl">
        <XCircle size={20} className="text-red-500 flex-shrink-0"/>
        <div>
          <p className="text-sm font-bold text-red-700 dark:text-red-400">
            Request Rejected{request.rejected_stage ? ` by ${request.rejected_stage}` : ''}
          </p>
          {request.rejected_reason && <p className="text-xs text-red-500 mt-0.5">{request.rejected_reason}</p>}
        </div>
      </div>
    )
  }
  const steps = [
    { label:'Submitted',            date:request.created_at,            done:true,                                                            icon:Package },
    { label:'Dept Head Approved',   date:request.dept_head_approved_at, done:['Waiting Asset Code','Pending Manager','Approved'].includes(s), icon:CheckCircle },
    { label:'Asset Codes Assigned', date:null,                          done:['Pending Manager','Approved'].includes(s),                      icon:Hash },
    { label:'Final Approval',       date:request.manager_approved_at,   done:s === 'Approved',                                                icon:UserCheck },
  ]
  return (
    <div className="flex items-start gap-0">
      {steps.map((st, i) => {
        const Icon = st.icon
        return (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {i > 0 && <div className={`flex-1 h-0.5 ${steps[i-1].done && st.done ? 'bg-green-400' : 'bg-cream-200 dark:bg-gray-600'}`}/>}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2
                ${st.done ? 'bg-green-500 border-green-500 text-white' : 'bg-white dark:bg-gray-800 border-cream-300 dark:border-gray-600 text-ink-300 dark:text-gray-500'}`}>
                <Icon size={14}/>
              </div>
              {i < steps.length-1 && <div className={`flex-1 h-0.5 ${st.done && steps[i+1]?.done ? 'bg-green-400' : 'bg-cream-200 dark:bg-gray-600'}`}/>}
            </div>
            <p className={`text-xs mt-1.5 text-center font-medium ${st.done ? 'text-ink-700 dark:text-gray-200' : 'text-ink-300 dark:text-gray-500'}`}>{st.label}</p>
            {st.date && st.done && (
              <p className="text-xs text-ink-300 dark:text-gray-500 text-center">{new Date(st.date).toLocaleDateString('en-IN')}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AssignCodesPanel({ request, onDone }) {
  const items = request.items || []
  const [codes,  setCodes]  = useState(() => items.map(() => ''))
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  function setCode(i, val) { setCodes(prev => prev.map((c, idx) => idx === i ? val : c)) }

  function handleExcel(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type:'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, blankrows:false })
        const vals = rows.map(r => String(r[0] ?? '').trim()).filter(v => v && !/^asset\s*code$/i.test(v))
        setCodes(items.map((_, i) => vals[i] ?? ''))
      } catch {
        setErr('Could not read that Excel file.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function handleSubmit() {
    setErr('')
    const clean = codes.map(c => c.trim())
    if (clean.some(c => !c)) { setErr('Please assign a code to every line item.'); return }
    const dupes = clean.filter((c, i) => clean.indexOf(c) !== i)
    if (dupes.length) { setErr(`Duplicate code(s): ${[...new Set(dupes)].join(', ')}`); return }
    setSaving(true)
    try {
      const r = await assignAssetCodes(request.id, clean)
      if (r.data.email_warning) alert(`Codes saved, but email: ${r.data.email_warning}`)
      onDone()
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to save asset codes')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5 space-y-4 border-2 border-purple-200 dark:border-purple-900/40">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Hash size={16} className="text-purple-500"/>
          <p className="text-sm font-bold text-ink-900 dark:text-gray-100">Assign Asset Codes — one per item ({items.length})</p>
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 bg-cream-100 dark:bg-gray-700 hover:bg-cream-200 dark:hover:bg-gray-600 rounded-xl text-xs font-semibold text-ink-600 dark:text-gray-300 cursor-pointer transition-colors">
          <Upload size={12}/> Upload Excel
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel}/>
        </label>
      </div>

      {err && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <XCircle size={13}/>{err}
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-3">
            <span className="text-xs text-ink-300 dark:text-gray-500 w-5 text-right flex-shrink-0">{it.seq}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-ink-700 dark:text-gray-200 truncate">{it.material_description}</p>
              <p className="text-xs text-ink-300 dark:text-gray-500">Qty {it.quantity}</p>
            </div>
            <input value={codes[i]} onChange={e => setCode(i, e.target.value)}
              placeholder="Asset code"
              className="w-40 bg-cream-100 dark:bg-gray-700 border-0 rounded-lg px-2.5 py-1.5 text-xs font-mono
                         text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-brand-300"/>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : <><Send size={14}/> Submit for Final Approval</>}
        </Button>
      </div>
    </div>
  )
}

export default function AssetRequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAssetTeam = user?.role === 'Admin' || user?.role === 'Manager'

  const [request,   setRequest]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [resending, setResending] = useState(false)

  useEffect(() => { load() }, [id])

  function load() {
    setLoading(true)
    getAssetRequest(id)
      .then(r => { setRequest(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function handleResend() {
    const email = request.status === 'Pending Manager' ? request.manager_email : request.dept_head_email
    if (!window.confirm(`Resend approval email to ${email}?`)) return
    setResending(true)
    try {
      const r = await resendAssetRequestApproval(id)
      if (r.data.email_warning) alert(`Email warning: ${r.data.email_warning}`)
      else alert('Approval email resent successfully.')
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to resend approval email')
    } finally { setResending(false) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading request…</div>
  if (!request) return <div className="py-20 text-center text-sm text-red-500">Request not found</div>

  const statusCls = STATUS_COLORS[request.status] || 'bg-gray-100 text-gray-600 border-gray-200'
  const isDeptHeadStage = request.status === 'Pending Dept Head'
  const isManagerStage  = request.status === 'Pending Manager'
  const currentApprover = isManagerStage ? request.manager_email : request.dept_head_email
  const stageLabel      = isManagerStage ? 'Awaiting final Manager approval' : 'Awaiting Department Head approval'

  const items = request.items || []
  const hasCodes = items.some(it => it.asset_code)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/asset-requests')}
            className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400 dark:text-gray-400 transition-colors">
            <ArrowLeft size={18}/>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-ink-900 dark:text-gray-100">{request.request_code}</h2>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${statusCls}`}>
                {request.status}
              </span>
            </div>
            <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">
              Requested {new Date(request.created_at).toLocaleString('en-IN')} by {request.requested_by_name || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Rejection notice */}
      {request.status === 'Rejected' && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-5 py-4 flex items-start gap-3">
          <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              Request Rejected{request.rejected_stage ? ` by ${request.rejected_stage}` : ''}
            </p>
            {request.rejected_reason && <p className="text-xs text-red-500 mt-0.5">{request.rejected_reason}</p>}
          </div>
        </div>
      )}

      {/* Pending approval banner */}
      {(isDeptHeadStage || isManagerStage) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-amber-500 flex-shrink-0 mt-0.5"/>
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{stageLabel}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Approval email sent to <strong>{currentApprover}</strong>. Awaiting their decision via email.
              </p>
            </div>
          </div>
          {isAssetTeam && (
            <button onClick={handleResend} disabled={resending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50">
              <Mail size={12}/> {resending ? 'Sending…' : 'Resend Email'}
            </button>
          )}
        </div>
      )}

      {/* Waiting for asset code — info for non-asset-team viewers */}
      {request.status === 'Waiting Asset Code' && !isAssetTeam && (
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl px-5 py-4 flex items-start gap-3">
          <Hash size={18} className="text-purple-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-purple-700 dark:text-purple-400">Awaiting Asset Code Assignment</p>
            <p className="text-xs text-purple-600 dark:text-purple-500 mt-0.5">
              Approved by the Department Head. The asset team will assign asset codes, then send it to the Manager for final approval.
            </p>
          </div>
        </div>
      )}

      {/* Top info cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'Requested By', value: request.requested_by_name || '—' },
          { label:'Department',   value: request.dept_name || '—' },
          { label:'Items',        value: items.length },
          { label:'Total Amount', value: formatINR(request.total_amount) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl shadow-card px-4 py-3">
            <p className="text-xs text-ink-300 dark:text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-bold text-ink-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
        <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide mb-4">Approval Progress</p>
        <Timeline request={request}/>
      </div>

      {/* Assign codes panel (asset team, waiting stage) */}
      {request.status === 'Waiting Asset Code' && isAssetTeam && (
        <AssignCodesPanel request={request} onDone={load}/>
      )}

      {/* Line items table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-cream-200 dark:border-gray-700">
          <p className="text-sm font-bold text-ink-900 dark:text-gray-100">Requested Items ({items.length})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-cream-200 dark:border-gray-700">
                {['#','Material Description','Qty','Unit Price','Total','Company','Cost Center','Location','Life','Asset Code'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b border-cream-200 dark:border-gray-700">
                  <td className="px-3 py-2.5 text-ink-400 dark:text-gray-500">{it.seq}</td>
                  <td className="px-3 py-2.5 font-medium text-ink-900 dark:text-gray-100">{it.material_description}</td>
                  <td className="px-3 py-2.5 text-ink-700 dark:text-gray-200">{it.quantity}</td>
                  <td className="px-3 py-2.5 text-ink-600 dark:text-gray-300">{formatINR(it.unit_price)}</td>
                  <td className="px-3 py-2.5 font-semibold text-ink-700 dark:text-gray-200">{formatINR(it.total_amount)}</td>
                  <td className="px-3 py-2.5 text-ink-600 dark:text-gray-300">{it.company_code || '—'}</td>
                  <td className="px-3 py-2.5 text-ink-600 dark:text-gray-300">{it.cost_center || '—'}</td>
                  <td className="px-3 py-2.5 text-ink-600 dark:text-gray-300">{it.plant_name || '—'}</td>
                  <td className="px-3 py-2.5 text-ink-600 dark:text-gray-300">{it.asset_life ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    {it.asset_code
                      ? <span className="font-mono text-xs bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded font-bold">{it.asset_code}</span>
                      : <span className="text-xs text-ink-300 dark:text-gray-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {hasCodes && (
              <tfoot>
                <tr className="bg-cream-50 dark:bg-gray-750">
                  <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-bold text-ink-900 dark:text-gray-100">Total Value</td>
                  <td colSpan={6} className="px-3 py-2.5 font-bold text-brand-600">{formatINR(request.total_amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

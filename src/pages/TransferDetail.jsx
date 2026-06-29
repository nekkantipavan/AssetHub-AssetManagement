import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle, XCircle, Clock,
  Truck, RotateCcw, Printer, AlertTriangle, Package, Mail
} from 'lucide-react'
import Button from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { useAuth } from '../context/AuthContext'
import { getTransfer, completeTransfer, resendTransferApproval, resendReturnApproval, cancelReturn } from '../data/api'

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })

const STATUS_COLORS = {
  'Pending Approval':  'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  'In Transit':        'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  'Completed':         'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  'Partially Returned':'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  'Returned':          'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  'Rejected':          'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
}

const RETURN_APPROVAL_COLORS = {
  'Pending Approval': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  'Approved':          'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  'Rejected':           'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

function Timeline({ transfer }) {
  const steps = [
    { label: 'Transfer Created',   date: transfer.created_at,  done: true,  icon: Package },
    { label: 'Approval Sent',      date: transfer.created_at,  done: !!transfer.manager_email, icon: Clock },
    { label: 'Approved',           date: transfer.approved_at, done: ['In Transit','Completed','Partially Returned','Returned'].includes(transfer.status), icon: CheckCircle },
    { label: 'In Transit',         date: transfer.approved_at, done: ['Completed','Partially Returned','Returned'].includes(transfer.status), icon: Truck },
    { label: 'Completed',          date: null,                 done: ['Completed','Partially Returned','Returned'].includes(transfer.status), icon: CheckCircle },
  ]
  if (transfer.transfer_type === 'Returnable') {
    steps.push({ label: 'Returned', date: null, done: transfer.status === 'Returned', icon: RotateCcw })
  }
  if (transfer.status === 'Rejected') {
    return (
      <div className="flex items-center gap-3 py-4 px-5 bg-red-50 dark:bg-red-900/20 rounded-2xl">
        <XCircle size={20} className="text-red-500 flex-shrink-0"/>
        <div>
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Transfer Rejected</p>
          {transfer.rejected_reason && <p className="text-xs text-red-500 mt-0.5">{transfer.rejected_reason}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-0">
      {steps.map((s, i) => {
        const Icon = s.icon
        return (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {i > 0 && <div className={`flex-1 h-0.5 ${steps[i-1].done && s.done ? 'bg-green-400' : 'bg-cream-200 dark:bg-gray-600'}`}/>}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2
                ${s.done ? 'bg-green-500 border-green-500 text-white' : 'bg-white dark:bg-gray-800 border-cream-300 dark:border-gray-600 text-ink-300 dark:text-gray-500'}`}>
                <Icon size={14}/>
              </div>
              {i < steps.length-1 && <div className={`flex-1 h-0.5 ${s.done && steps[i+1]?.done ? 'bg-green-400' : 'bg-cream-200 dark:bg-gray-600'}`}/>}
            </div>
            <p className={`text-xs mt-1.5 text-center font-medium ${s.done ? 'text-ink-700 dark:text-gray-200' : 'text-ink-300 dark:text-gray-500'}`}>{s.label}</p>
            {s.date && s.done && (
              <p className="text-xs text-ink-300 dark:text-gray-500 text-center">{new Date(s.date).toLocaleDateString('en-IN')}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Print a delivery challan — works for both the original transfer
// and for an individual return (flips bill-from/bill-to direction) ──
function printChallan({ challanNo, date, fromName, fromLoc, toName, toLoc, transferType, items, approvedDate, label }) {
  const fmt = v => Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const totalVal = items.reduce((s, a) => s + Number(a.acquisition_value||0), 0)
  const rows = items.map((a, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${a.asset_code}</td>
      <td>${a.name}</td>
      <td>1</td>
      <td>EA</td>
      <td>${fmt(a.acquisition_value)}</td>
      <td>${fmt(a.acquisition_value)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${label} - ${challanNo}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:14px;color:#111}
  h1{text-align:center;font-size:22px;font-weight:700;padding:10px;border-bottom:2px solid #333;margin:0}
  .challan{border:2px solid #333;max-width:900px;margin:0 auto}
  .grid{display:grid;grid-template-columns:1fr 1fr}
  .box{padding:10px;border-bottom:1px solid #333;min-height:100px}
  .box:nth-child(odd){border-right:1px solid #333}
  .box-title{font-weight:700;font-size:13px;margin-bottom:6px}
  .box p{margin:2px 0;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:0}
  th,td{border:1px solid #333;padding:7px 8px;font-size:12px;text-align:left}
  th{background:#f0f0f0;font-weight:700}
  .total-row td{font-weight:700}
  .note{padding:8px;font-size:11px;border-top:1px solid #333}
  .sign{text-align:right;padding:16px 10px;font-weight:700;font-size:13px}
  @media print{.noprint{display:none}}
</style></head>
<body>
<div class="noprint" style="margin-bottom:10px">
  <button onclick="window.print()">🖨 Print</button>
  <button onclick="window.close()">Close</button>
</div>
<div class="challan">
  <h1>${label}</h1>
  <div class="grid">
    <div class="box">
      <div class="box-title">Bill From</div>
      <p>Location: ${fromName||'—'}</p>
      <p>Address: ${fromLoc||'—'}</p>
    </div>
    <div class="box">
      <div class="box-title">Original for Consignee</div>
      <p>Challan No: ${challanNo}</p>
      <p>Date of Challan: ${date}</p>
      <p>Transfer Type: ${transferType}</p>
      <p>Approval Date: ${approvedDate||'—'}</p>
    </div>
    <div class="box">
      <div class="box-title">Details of Buyer (Bill To)</div>
      <p>Location: ${toName||'—'}</p>
      <p>Address: ${toLoc||'—'}</p>
    </div>
    <div class="box">
      <div class="box-title">Details of Consignee (Ship To)</div>
      <p>Location: ${toName||'—'}</p>
      <p>Address: ${toLoc||'—'}</p>
    </div>
    <div class="box">
      <div class="box-title">Transport Vehicle NO:</div>
      <p>&nbsp;</p>
    </div>
    <div class="box">
      <div class="box-title">Place of Supply:</div>
      <p>&nbsp;</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>S.No</th><th>Asset No</th><th>Description</th>
        <th>Qty</th><th>UOM</th><th>Rate (INR)</th><th>Amount (INR)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tbody>
      <tr class="total-row">
        <td colspan="6" style="text-align:right">Total</td>
        <td>${fmt(totalVal)}</td>
      </tr>
    </tbody>
  </table>
  <div class="note">Material transferred internally for business use only. Not intended for sale.</div>
  <div class="sign">AUTHORISED SIGNATORY</div>
</div>
</body></html>`

  const w = window.open('', '_blank', 'width=1000,height=780')
  if (!w) { alert('Please allow popups for this site to print the challan.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}

function TransferChallanButton({ transfer }) {
  function handlePrint() {
    printChallan({
      challanNo: transfer.transfer_code,
      date: new Date(transfer.created_at).toLocaleDateString('en-IN'),
      fromName: transfer.from_plant_name, fromLoc: transfer.from_plant_location,
      toName: transfer.to_plant_name,     toLoc: transfer.to_plant_location,
      transferType: transfer.transfer_type,
      items: transfer.items || [],
      approvedDate: transfer.approved_at ? new Date(transfer.approved_at).toLocaleDateString('en-IN') : null,
      label: 'Delivery Challan',
    })
  }
  return (
    <Button variant="secondary" onClick={handlePrint}>
      <Printer size={15}/> Print Delivery Challan
    </Button>
  )
}

function ReturnChallanButton({ transfer, ret }) {
  function handlePrint() {
    // For returns, direction flips: bill FROM destination plant, bill TO source plant
    const items = (transfer.items || []).filter(i => ret.items.some(ri => ri.asset_id === i.asset_id))
    printChallan({
      challanNo: ret.return_code,
      date: new Date(ret.return_date).toLocaleDateString('en-IN'),
      fromName: transfer.to_plant_name,   fromLoc: transfer.to_plant_location,
      toName: transfer.from_plant_name,   toLoc: transfer.from_plant_location,
      transferType: ret.status === 'Completed' ? 'Full Return' : 'Partial Return',
      items,
      approvedDate: ret.approved_at ? new Date(ret.approved_at).toLocaleDateString('en-IN') : null,
      label: 'Return Delivery Challan',
    })
  }
  return (
    <button onClick={handlePrint}
      className="text-xs text-brand-600 dark:text-brand-400 font-medium hover:underline flex items-center gap-1">
      <Printer size={12}/> Print Challan
    </button>
  )
}

export default function TransferDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canEdit } = useAuth()
  const editable = canEdit('transfer')

  const [transfer,   setTransfer]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [completing, setCompleting] = useState(false)
  const [resending,  setResending]  = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [activeTab,  setActiveTab]  = useState('overview')

  useEffect(() => { load() }, [id])

  function load() {
    setLoading(true)
    getTransfer(id)
      .then(r => { setTransfer(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function handleComplete() {
    if (!window.confirm('Mark this transfer as Completed? This will update all asset locations to the destination plant.')) return
    setCompleting(true)
    try {
      await completeTransfer(id)
      load()
    } catch(e) {
      alert(e.response?.data?.error || 'Failed to complete transfer')
    } finally { setCompleting(false) }
  }

  async function handleResendTransferApproval() {
    if (!window.confirm(`Resend approval email to ${transfer.manager_email}?`)) return
    setResending(true)
    try {
      const r = await resendTransferApproval(id)
      if (r.data.email_warning) alert(`Email warning: ${r.data.email_warning}`)
      else alert('Approval email resent successfully.')
    } catch(e) {
      alert(e.response?.data?.error || 'Failed to resend approval email')
    } finally { setResending(false) }
  }

  async function handleResendReturnApproval(returnId, managerEmail) {
    if (!window.confirm(`Resend return approval email to ${managerEmail}?`)) return
    setResending(true)
    try {
      const r = await resendReturnApproval(returnId)
      if (r.data.email_warning) alert(`Email warning: ${r.data.email_warning}`)
      else alert('Return approval email resent successfully.')
    } catch(e) {
      alert(e.response?.data?.error || 'Failed to resend return approval email')
    } finally { setResending(false) }
  }

  async function handleCancelReturn(returnId, returnCode) {
    if (!window.confirm(`Cancel return ${returnCode}? Assets will be unlocked and remain at destination plant.`)) return
    setCancelling(returnId)
    try {
      await cancelReturn(returnId)
      load()
    } catch(e) {
      alert(e.response?.data?.error || 'Failed to cancel return')
    } finally { setCancelling(null) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading transfer…</div>
  if (!transfer) return <div className="py-20 text-center text-sm text-red-500">Transfer not found</div>

  const statusCls = STATUS_COLORS[transfer.status] || 'bg-gray-100 text-gray-600 border-gray-200'
  const isApproved = ['In Transit','Completed','Partially Returned','Returned'].includes(transfer.status)
  const canComplete = editable && transfer.status === 'In Transit'
  const canReturn   = editable && transfer.transfer_type === 'Returnable' &&
                      ['Completed','Partially Returned'].includes(transfer.status)

  // Only count APPROVED returns toward the "returned" total
  const approvedReturns = (transfer.returns || []).filter(r => r.approval_status === 'Approved')
  const returnedAssetIds = new Set(approvedReturns.flatMap(r => r.items.map(i => i.asset_id)))
  const totalAssets    = transfer.items?.length || 0
  const returnedCount  = returnedAssetIds.size
  const remainingCount = totalAssets - returnedCount

  const hasPendingReturn = (transfer.returns || []).some(r => r.approval_status === 'Pending Approval')

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/transfer')}
            className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400 dark:text-gray-400 transition-colors">
            <ArrowLeft size={18}/>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-ink-900 dark:text-gray-100">{transfer.transfer_code}</h2>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${statusCls}`}>
                {transfer.status}
              </span>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium
                ${transfer.transfer_type==='Returnable'
                  ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                  : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'}`}>
                {transfer.transfer_type}
              </span>
            </div>
            <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">
              Created {new Date(transfer.created_at).toLocaleString('en-IN')} by {transfer.initiated_by_name}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap justify-end">
          {isApproved && <TransferChallanButton transfer={transfer}/>}
          {canComplete && (
            <Button onClick={handleComplete} disabled={completing}>
              {completing ? 'Completing…' : <><CheckCircle size={15}/> Mark as Completed</>}
            </Button>
          )}
          {canReturn && !hasPendingReturn && (
            <Button onClick={() => navigate(`/transfer/${id}/return`)}>
              <RotateCcw size={15}/> Process Return
            </Button>
          )}
        </div>
      </div>

      {/* Rejection notice */}
      {transfer.status === 'Rejected' && transfer.rejected_reason && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-5 py-4 flex items-start gap-3">
          <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Transfer Rejected</p>
            <p className="text-xs text-red-500 mt-0.5">{transfer.rejected_reason}</p>
          </div>
        </div>
      )}

      {/* Pending approval notice */}
      {transfer.status === 'Pending Approval' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-amber-500 flex-shrink-0 mt-0.5"/>
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Awaiting Email Approval</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Approval email sent to <strong>{transfer.manager_email}</strong>.
                Assets are locked until the manager approves or rejects via email.
              </p>
            </div>
          </div>
          {editable && (
            <button
              onClick={handleResendTransferApproval}
              disabled={resending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Mail size={12}/> {resending ? 'Sending…' : 'Resend Email'}
            </button>
          )}
        </div>
      )}

      {/* Pending return approval notice */}
      {hasPendingReturn && (
        <div className="bg-teal-50 dark:bg-teal-900/20 rounded-2xl px-5 py-4 flex items-start gap-3">
          <Mail size={18} className="text-teal-500 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-teal-700 dark:text-teal-400">Return Awaiting Approval</p>
            <p className="text-xs text-teal-600 dark:text-teal-500 mt-0.5">
              A return for this transfer is pending email approval. New return requests are disabled until it's resolved.
            </p>
          </div>
        </div>
      )}

      {/* Top info cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'From Plant',  value: transfer.from_plant_name },
          { label:'To Plant',    value: transfer.to_plant_name   },
          { label:'Total Assets',value: totalAssets              },
          { label:'Approved By', value: transfer.approved_by_name || (transfer.status==='Pending Approval' ? 'Pending…' : '—') },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl shadow-card px-4 py-3">
            <p className="text-xs text-ink-300 dark:text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-bold text-ink-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Return progress (only for returnable) */}
      {transfer.transfer_type === 'Returnable' && isApproved && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
          <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide mb-3">Return Progress</p>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-cream-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-orange-gradient rounded-full transition-all duration-500"
                style={{ width: totalAssets > 0 ? `${(returnedCount/totalAssets)*100}%` : '0%' }}
              />
            </div>
            <span className="text-sm font-bold text-ink-900 dark:text-gray-100 whitespace-nowrap">
              {returnedCount} / {totalAssets} returned
            </span>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-ink-400 dark:text-gray-400">
            <span>Sent: <strong className="text-ink-700 dark:text-gray-200">{totalAssets}</strong></span>
            <span>Returned: <strong className="text-green-600">{returnedCount}</strong></span>
            <span>Remaining: <strong className="text-orange-600">{remainingCount}</strong></span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
        <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide mb-4">Transfer Timeline</p>
        <Timeline transfer={transfer}/>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="flex border-b border-cream-200 dark:border-gray-700">
          {[
            { key:'overview', label:'Assets' },
            ...(transfer.returns?.length > 0 ? [{ key:'returns', label:`Returns (${transfer.returns.length})` }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-6 py-4 text-sm font-semibold transition-all
                ${activeTab===t.key
                  ? 'border-b-2 border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'text-ink-400 dark:text-gray-400 hover:text-ink-700 dark:hover:text-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Assets tab */}
        {activeTab === 'overview' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-cream-200 dark:border-gray-700">
                  {['Asset Code','Asset Description','Category','Department','Assigned To','Value','Current Status','Returned'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(transfer.items||[]).map(a => {
                  const returned = returnedAssetIds.has(a.asset_id)
                  return (
                    <tr key={a.asset_id} className="border-b border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-3 text-brand-600 font-semibold text-xs">
                        {a.asset_code}
                        {a.sub_sequence > 0 && <span className="text-ink-300 ml-1">· {a.sub_sequence}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ink-900 dark:text-gray-100 max-w-[160px] truncate">{a.name}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 px-2 py-0.5 rounded-lg">{a.category||'—'}</span></td>
                      <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.dept_name||'—'}</td>
                      <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.assigned_employee||'—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-ink-700 dark:text-gray-200">{formatINR(a.acquisition_value)}</td>
                      <td className="px-4 py-3"><Badge label={a.asset_status}/></td>
                      <td className="px-4 py-3">
                        {returned
                          ? <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">✓ Returned</span>
                          : <span className="text-xs text-ink-300 dark:text-gray-500">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Returns tab */}
        {activeTab === 'returns' && (
          <div className="p-5 space-y-4">
            {(transfer.returns||[]).map((ret) => (
              <div key={ret.id} className="bg-cream-50 dark:bg-gray-750 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-ink-900 dark:text-gray-100">{ret.return_code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${ret.status==='Completed'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'}`}>
                      {ret.status === 'Completed' ? 'Full Return' : 'Partial Return'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RETURN_APPROVAL_COLORS[ret.approval_status]||'bg-gray-100 text-gray-600'}`}>
                      {ret.approval_status === 'Pending Approval' && <Clock size={10} className="inline mr-1"/>}
                      {ret.approval_status === 'Approved' && <CheckCircle size={10} className="inline mr-1"/>}
                      {ret.approval_status === 'Rejected' && <XCircle size={10} className="inline mr-1"/>}
                      {ret.approval_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400 dark:text-gray-400">
                      {new Date(ret.return_date).toLocaleDateString('en-IN')} · by {ret.returned_by}
                    </span>
                    {ret.approval_status === 'Approved' && (
                      <ReturnChallanButton transfer={transfer} ret={ret}/>
                    )}
                  </div>
                </div>

                {ret.approval_status === 'Pending Approval' && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {(() => {
                      const email = ret.manager_email || transfer.manager_email
                      return email
                        ? <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Mail size={11}/> Awaiting approval from <strong>{email}</strong>
                          </p>
                        : <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Clock size={11}/> Awaiting return approval
                          </p>
                    })()}
                    {editable && (
                      <div className="flex items-center gap-2">
                        {(ret.manager_email || transfer.manager_email) && (
                          <button
                            onClick={() => handleResendReturnApproval(ret.id, ret.manager_email || transfer.manager_email)}
                            disabled={resending}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <Mail size={11}/> {resending ? 'Sending…' : 'Resend Email'}
                          </button>
                        )}
                        <button
                          onClick={() => handleCancelReturn(ret.id, ret.return_code)}
                          disabled={cancelling === ret.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <XCircle size={11}/> {cancelling === ret.id ? 'Cancelling…' : 'Cancel Return'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {ret.approval_status === 'Rejected' && ret.rejected_reason && (
                  <p className="text-xs text-red-600 dark:text-red-400">Reason: {ret.rejected_reason}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {ret.items.map(item => (
                    <span key={item.asset_id} className="text-xs bg-white dark:bg-gray-700 text-ink-700 dark:text-gray-200 px-2 py-1 rounded-lg border border-cream-200 dark:border-gray-600">
                      {item.asset_code} — {item.name}
                    </span>
                  ))}
                </div>
                {ret.notes && <p className="text-xs text-ink-400 dark:text-gray-400">{ret.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {transfer.notes && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card px-5 py-4">
          <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-ink-700 dark:text-gray-300">{transfer.notes}</p>
        </div>
      )}
    </div>
  )
}

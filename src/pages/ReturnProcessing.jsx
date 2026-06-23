import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, RotateCcw, X, AlertTriangle, Mail } from 'lucide-react'
import Button from '../components/common/Button'
import { Input, Select } from '../components/common/FormFields'
import { getTransfer, getReturnableAssets, createReturn, getEmailMasters } from '../data/api'

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })

export default function ReturnProcessing() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [transfer,   setTransfer]   = useState(null)
  const [returnable, setReturnable] = useState([])
  const [emailOpts,  setEmailOpts]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState([])
  const [form,       setForm]       = useState({
    returned_by: '',
    return_date: new Date().toISOString().split('T')[0],
    manager_email: '',
    notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [err,        setErr]        = useState('')

  useEffect(() => {
    Promise.all([getTransfer(id), getReturnableAssets(id), getEmailMasters()])
      .then(([t, r, e]) => {
        setTransfer(t.data)
        setReturnable(r.data)
        setEmailOpts(e.data)
        // Pre-fill manager email with the same one used for the original transfer
        setForm(p => ({ ...p, manager_email: t.data.manager_email || '' }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  function toggleAsset(assetId) {
    setSelected(prev =>
      prev.includes(assetId) ? prev.filter(x => x !== assetId) : [...prev, assetId]
    )
  }

  function toggleAll() {
    if (selected.length === returnable.length) setSelected([])
    else setSelected(returnable.map(a => a.asset_id))
  }

  async function handleSubmit() {
    setErr('')
    if (!form.returned_by.trim())  { setErr('Returned by is required'); return }
    if (!form.return_date)         { setErr('Return date is required'); return }
    if (!form.manager_email)       { setErr('Select an approver email for return approval'); return }
    if (selected.length === 0)     { setErr('Select at least one asset to return'); return }

    const isPartial = selected.length < returnable.length
    const msg = isPartial
      ? `Submit return for ${selected.length} of ${returnable.length} assets? An approval email will be sent.`
      : `Submit return for all ${selected.length} assets? An approval email will be sent.`
    if (!window.confirm(msg)) return

    setSubmitting(true)
    try {
      const r = await createReturn(id, {
        asset_ids:     selected,
        returned_by:   form.returned_by.trim(),
        return_date:   form.return_date,
        manager_email: form.manager_email,
        notes:         form.notes || null,
      })
      if (r.data.email_warning) {
        alert(`Return submitted but: ${r.data.email_warning}`)
      }
      setSubmitted(true)
    } catch(e) {
      setErr(e.response?.data?.error || 'Return failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading…</div>
  if (!transfer) return <div className="py-20 text-center text-sm text-red-500">Transfer not found</div>

  const allReturned = (transfer.returns || []).flatMap(r => r.items || [])
  const totalInTransfer = transfer.items?.length || 0

  // Success state — return submitted, awaiting approval
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-teal-600 dark:text-teal-400"/>
          </div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-gray-100 mb-1">Return Submitted for Approval</h2>
          <p className="text-sm text-ink-400 dark:text-gray-400 max-w-sm mx-auto">
            An approval email has been sent to <strong>{form.manager_email}</strong>.
            The {selected.length} selected asset(s) will move back to {transfer.from_plant_name} once approved.
          </p>
          <div className="mt-6">
            <Button onClick={() => navigate(`/transfer/${id}`)}>Back to Transfer</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/transfer/${id}`)}
          className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400 dark:text-gray-400 transition-colors">
          <ArrowLeft size={18}/>
        </button>
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-gray-100">Process Return</h2>
          <p className="text-xs text-ink-400 dark:text-gray-400">
            {transfer.transfer_code} · {transfer.from_plant_name} ← {transfer.to_plant_name}
          </p>
        </div>
      </div>

      {/* Transfer info card */}
      <div className="bg-orange-soft dark:bg-gray-800 rounded-3xl p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-ink-900 dark:text-gray-100">{totalInTransfer}</p>
            <p className="text-xs text-ink-400 dark:text-gray-400">Total Sent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{allReturned.length}</p>
            <p className="text-xs text-ink-400 dark:text-gray-400">Already Returned</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-brand-600">{returnable.length}</p>
            <p className="text-xs text-ink-400 dark:text-gray-400">Awaiting Return</p>
          </div>
        </div>
      </div>

      {returnable.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-12 text-center">
          <CheckCircle size={36} className="mx-auto mb-3 text-green-500"/>
          <p className="font-bold text-ink-900 dark:text-gray-100">All assets have been returned</p>
          <p className="text-sm text-ink-400 dark:text-gray-400 mt-1">There are no more assets to return for this transfer.</p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate(`/transfer/${id}`)}>Back to Transfer</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Return details form */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Return Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Returned By *"
                value={form.returned_by}
                onChange={e => setForm(p => ({ ...p, returned_by: e.target.value }))}
                placeholder="Name of person returning"
              />
              <Input
                label="Return Date *"
                type="date"
                value={form.return_date}
                onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))}
              />
              <div className="col-span-2">
                <Select label="Send Approval Email To *" value={form.manager_email}
                        onChange={e => setForm(p => ({ ...p, manager_email: e.target.value }))}>
                  <option value="">— Select Approver —</option>
                  {emailOpts.map(em => (
                    <option key={em.id} value={em.email}>
                      {em.name} — {em.email}{em.department ? ` (${em.department})` : ''}
                    </option>
                  ))}
                </Select>
                {emailOpts.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠ No approvers configured. Go to Email Masters to add one.
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any notes about this return…"
                  className="w-full bg-cream-100 dark:bg-gray-700 border-0 rounded-2xl px-4 py-2.5 text-sm
                             text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Asset selection */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Select Assets to Return</h3>
                <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">
                  {selected.length} of {returnable.length} selected
                </p>
              </div>
              <button onClick={toggleAll}
                className="text-xs text-brand-600 dark:text-brand-400 font-medium hover:underline">
                {selected.length === returnable.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cream-200 dark:border-gray-700">
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Asset ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Asset Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {returnable.map(a => {
                    const checked = selected.includes(a.asset_id)
                    return (
                      <tr key={a.asset_id}
                        onClick={() => toggleAsset(a.asset_id)}
                        className={`border-b border-cream-200 dark:border-gray-700 cursor-pointer transition-colors
                          ${checked ? 'bg-teal-50 dark:bg-teal-900/10' : 'hover:bg-cream-50 dark:hover:bg-gray-750'}`}>
                        <td className="px-4 py-3">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                            ${checked ? 'bg-teal-500 border-teal-500' : 'border-ink-300 dark:border-gray-500'}`}>
                            {checked && <CheckCircle size={10} className="text-white"/>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-brand-600 font-semibold text-xs">{a.asset_tag}</td>
                        <td className="px-4 py-3 text-sm font-medium text-ink-900 dark:text-gray-100">{a.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 px-2 py-0.5 rounded-lg">
                            {a.category||'—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.dept_name||'—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-ink-700 dark:text-gray-200">{formatINR(a.value)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selected.length > 0 && selected.length < returnable.length && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
              <span>
                You are returning <strong>{selected.length}</strong> of <strong>{returnable.length}</strong> remaining assets.
                This will be a <strong>Partial Return</strong>, pending approval.
              </span>
            </div>
          )}
          {selected.length > 0 && selected.length === returnable.length && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl px-4 py-3 flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle size={16} className="flex-shrink-0 mt-0.5"/>
              <span>
                You are returning <strong>all {selected.length}</strong> remaining assets.
                Once approved, the transfer will be marked <strong>Returned (Closed)</strong>.
              </span>
            </div>
          )}

          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-2xl px-4 py-3 flex items-start gap-2 text-sm text-teal-700 dark:text-teal-400">
            <Mail size={16} className="flex-shrink-0 mt-0.5"/>
            <span>
              Submitting will send an approval email. Assets stay locked at the current plant until the manager approves or rejects.
            </span>
          </div>

          {err && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <X size={14}/>{err}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => navigate(`/transfer/${id}`)}>
              <ArrowLeft size={15}/> Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || selected.length === 0}>
              {submitting
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Sending…</>
                : <><RotateCcw size={15}/> Submit Return for Approval</>
              }
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

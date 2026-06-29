import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, CheckCircle, X, AlertTriangle, Search } from 'lucide-react'
import Button from '../components/common/Button'
import { Input, Select } from '../components/common/FormFields'
import { Badge } from '../components/common/Badge'
import { getPlants, getAssets, getEmailMasters, createTransfer } from '../data/api'

const STEPS = ['Transfer Details', 'Select Assets', 'Review & Submit']

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })

export default function NewTransfer() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // Data
  const [plants,   setPlants]   = useState([])
  const [assets,   setAssets]   = useState([])
  const [emailOpts,setEmailOpts]= useState([])
  const [loading,  setLoading]  = useState(true)

  // Step 1 form
  const [form, setForm] = useState({
    from_plant_id: '', to_plant_id: '',
    transfer_type: 'Returnable',
    manager_email: '',
    expected_return_date: '',
    notes: ''
  })
  const [step1Err, setStep1Err] = useState('')

  // Step 2
  const [selectedIds, setSelectedIds] = useState([])
  const [assetSearch, setAssetSearch] = useState('')
  const [deptFilter,  setDeptFilter]  = useState('All')

  // Step 3
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState('')

  useEffect(() => {
    Promise.all([getPlants(), getAssets(), getEmailMasters()])
      .then(([p, a, e]) => {
        setPlants(p.data)
        setAssets(a.data)
        setEmailOpts(e.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Assets for step 2 — filtered by source plant, not already in transfer
  const sourceAssets = assets.filter(a => {
    if (form.from_plant_id && a.plant_id !== parseInt(form.from_plant_id)) return false
    // Block assets already in a pending/active transfer
    if (['Pending Transfer','In Transit'].includes(a.status)) return false
    return true
  })

  const deptOptions = ['All', ...new Set(sourceAssets.map(a => a.dept_name).filter(Boolean))]

  const filteredAssets = sourceAssets.filter(a => {
    const q = assetSearch.toLowerCase()
    const matchQ = !q ||
      a.name?.toLowerCase().includes(q) ||
      a.asset_code?.toLowerCase().includes(q) ||
      a.serial_number?.toLowerCase().includes(q) ||
      a.assigned_employee?.toLowerCase().includes(q)
    const matchD = deptFilter === 'All' || a.dept_name === deptFilter
    return matchQ && matchD
  })

  // Assets blocked (in transfer queue)
  const blockedAssets = form.from_plant_id
    ? assets.filter(a =>
        a.plant_id === parseInt(form.from_plant_id) &&
        ['Pending Transfer','In Transit'].includes(a.status))
    : []

  const selectedAssets = assets.filter(a => selectedIds.includes(a.id))
  const totalValue = selectedAssets.reduce((s, a) => s + Number(a.acquisition_value||0), 0)

  function toggleAsset(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    if (name === 'from_plant_id') setSelectedIds([]) // reset selection when source changes
  }

  // Step 1 → 2
  function goToStep2() {
    setStep1Err('')
    if (!form.from_plant_id)   { setStep1Err('Please select a source plant'); return }
    if (!form.to_plant_id)     { setStep1Err('Please select a destination plant'); return }
    if (form.from_plant_id === form.to_plant_id) { setStep1Err('Source and destination cannot be the same'); return }
    if (!form.manager_email)   { setStep1Err('Please select an approval manager email'); return }
    if (form.transfer_type === 'Returnable' && !form.expected_return_date)
      { setStep1Err('Expected return date is required for Returnable transfers'); return }
    setStep(1)
  }

  // Step 2 → 3
  function goToStep3() {
    if (selectedIds.length === 0) {
      alert('Please select at least one asset')
      return
    }
    setStep(2)
  }

  // Submit
  async function handleSubmit() {
    setSubmitErr('')
    setSubmitting(true)
    try {
      const r = await createTransfer({
        from_plant_id: parseInt(form.from_plant_id),
        to_plant_id:   parseInt(form.to_plant_id),
        transfer_type: form.transfer_type,
        manager_email: form.manager_email,
        expected_return_date: form.expected_return_date || null,
        notes: form.notes || null,
        asset_ids: selectedIds,
      })
      const warn = r.data.email_warning
      if (warn) alert(`Transfer created but: ${warn}`)
      navigate(`/transfer/${r.data.id}`)
    } catch(e) {
      setSubmitErr(e.response?.data?.error || 'Failed to create transfer')
    } finally {
      setSubmitting(false)
    }
  }

  const fromPlant = plants.find(p => p.id === parseInt(form.from_plant_id))
  const toPlant   = plants.find(p => p.id === parseInt(form.to_plant_id))

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading…</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Step indicator */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold transition-all
                  ${i < step  ? 'bg-green-500 text-white'
                  : i === step ? 'bg-orange-gradient text-white shadow-soft'
                  :              'bg-cream-200 dark:bg-gray-700 text-ink-300 dark:text-gray-400'}`}>
                  {i < step ? <CheckCircle size={16}/> : i+1}
                </div>
                <p className={`text-xs mt-1.5 font-medium ${i <= step ? 'text-ink-700 dark:text-gray-200' : 'text-ink-300 dark:text-gray-500'}`}>{s}</p>
              </div>
              {i < STEPS.length-1 && (
                <div className={`h-0.5 flex-1 mx-2 rounded-full ${i < step ? 'bg-green-400' : 'bg-cream-200 dark:bg-gray-700'}`}/>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── STEP 1: Transfer Details ─────────────────────────── */}
      {step === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6 space-y-5">
          <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Transfer Details</h3>

          {step1Err && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <X size={14}/>{step1Err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Source plant */}
            <Select label="Source Plant *" name="from_plant_id" value={form.from_plant_id} onChange={handleChange}>
              <option value="">— Select Source Plant —</option>
              {plants.filter(p => p.status==='Active').map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </Select>

            {/* Destination plant */}
            <Select label="Destination Plant *" name="to_plant_id" value={form.to_plant_id} onChange={handleChange}>
              <option value="">— Select Destination Plant —</option>
              {plants.filter(p => p.status==='Active' && p.id !== parseInt(form.from_plant_id)).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </Select>

            {/* Transfer type */}
            <div>
              <p className="text-xs font-semibold text-ink-700 dark:text-gray-300 mb-2">Transfer Type *</p>
              <div className="flex gap-2">
                {['Returnable','Non-Returnable'].map(t => (
                  <button key={t} type="button"
                    onClick={() => setForm(p => ({ ...p, transfer_type:t }))}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-semibold transition-all
                      ${form.transfer_type===t
                        ? 'bg-orange-gradient text-white shadow-soft'
                        : 'bg-cream-100 dark:bg-gray-700 text-ink-500 dark:text-gray-400 hover:bg-cream-200 dark:hover:bg-gray-600'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Expected return date - only for Returnable */}
            {form.transfer_type === 'Returnable' && (
              <Input label="Expected Return Date *" name="expected_return_date"
                     value={form.expected_return_date} onChange={handleChange} type="date"/>
            )}

            {/* Manager email for approval */}
            <div className="col-span-2">
              <Select label="Send Approval Email To *" name="manager_email" value={form.manager_email} onChange={handleChange}>
                <option value="">— Select Approver —</option>
                {emailOpts.map(e => (
                  <option key={e.id} value={e.email}>
                    {e.name} — {e.email}{e.department ? ` (${e.department})` : ''}
                  </option>
                ))}
              </Select>
              {emailOpts.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  ⚠ No approvers configured. Go to System → Email Masters to add approver emails first.
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">Notes (optional)</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
                placeholder="Reason for transfer, special instructions…"
                className="w-full bg-cream-100 dark:bg-gray-700 border-0 rounded-2xl px-4 py-2.5 text-sm
                           text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                           focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"/>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={() => navigate('/transfer')}>
              <ArrowLeft size={15}/> Cancel
            </Button>
            <Button onClick={goToStep2}>
              Next: Select Assets <ArrowRight size={15}/>
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Select Assets ────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Selected summary card */}
          <div className="bg-orange-soft dark:bg-gray-800 rounded-3xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wide">Transfer Route</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-semibold text-ink-900 dark:text-gray-100">{fromPlant?.name}</span>
                <ArrowRight size={14} className="text-brand-500"/>
                <span className="text-sm font-semibold text-ink-900 dark:text-gray-100">{toPlant?.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-2
                  ${form.transfer_type==='Returnable' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'}`}>
                  {form.transfer_type}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-brand-600">{selectedIds.length}</p>
              <p className="text-xs text-ink-400 dark:text-gray-400">assets selected</p>
            </div>
          </div>

          {/* Blocked assets warning */}
          {blockedAssets.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
              <span>
                <strong>{blockedAssets.length} asset(s)</strong> from this plant are already in an active transfer and cannot be selected:
                {' '}{blockedAssets.map(a => a.asset_code).join(', ')}
              </span>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-cream-200 dark:border-gray-700 flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-500"/>
                <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                  placeholder="Search assets by name, code, serial…"
                  className="w-full pl-9 pr-4 py-2 bg-cream-100 dark:bg-gray-700 rounded-2xl text-sm
                             text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-brand-300"/>
              </div>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2 text-sm text-ink-700 dark:text-gray-200
                           focus:outline-none focus:ring-2 focus:ring-brand-300">
                {deptOptions.map(d => <option key={d}>{d}</option>)}
              </select>
              {selectedIds.length > 0 && (
                <button onClick={() => setSelectedIds([])}
                  className="text-xs text-ink-400 dark:text-gray-400 hover:text-red-500 transition-colors whitespace-nowrap">
                  Clear all
                </button>
              )}
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full min-w-[700px]">
                <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <tr className="border-b border-cream-200 dark:border-gray-700">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox"
                        checked={filteredAssets.length > 0 && filteredAssets.every(a => selectedIds.includes(a.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(prev => [...new Set([...prev, ...filteredAssets.map(a=>a.id)])])
                          else setSelectedIds(prev => prev.filter(id => !filteredAssets.map(a=>a.id).includes(id)))
                        }}
                        className="rounded"/>
                    </th>
                    {['Asset Code','Asset Description','Category','Department','Assigned To','Value','Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map(a => {
                    const checked = selectedIds.includes(a.id)
                    return (
                      <tr key={a.id}
                        onClick={() => toggleAsset(a.id)}
                        className={`border-b border-cream-200 dark:border-gray-700 cursor-pointer transition-colors
                          ${checked ? 'bg-brand-50 dark:bg-brand-900/10' : 'hover:bg-cream-50 dark:hover:bg-gray-750'}`}>
                        <td className="px-4 py-3">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                            ${checked ? 'bg-brand-500 border-brand-500' : 'border-ink-300 dark:border-gray-500'}`}>
                            {checked && <CheckCircle size={10} className="text-white"/>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-brand-600 font-semibold text-xs">{a.asset_code}</span>
                          {a.sub_sequence > 0 && <span className="text-ink-300 text-xs ml-1">· {a.sub_sequence}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-ink-900 dark:text-gray-100 max-w-[160px] truncate">{a.name}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 px-2 py-0.5 rounded-lg">{a.category||'—'}</span></td>
                        <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.dept_name||'—'}</td>
                        <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.assigned_employee||'—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-ink-700 dark:text-gray-200">{formatINR(a.acquisition_value)}</td>
                        <td className="px-4 py-3"><Badge label={a.status}/></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredAssets.length === 0 && (
                <div className="py-10 text-center text-sm text-ink-300 dark:text-gray-500">
                  {form.from_plant_id ? 'No available assets in this plant' : 'Select a source plant to see assets'}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(0)}>
              <ArrowLeft size={15}/> Back
            </Button>
            <Button onClick={goToStep3} disabled={selectedIds.length === 0}>
              Next: Review ({selectedIds.length} assets) <ArrowRight size={15}/>
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Review & Submit ──────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6 space-y-4">
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Transfer Summary</h3>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['From Plant',      fromPlant?.name || '—'],
                ['To Plant',        toPlant?.name   || '—'],
                ['Transfer Type',   form.transfer_type],
                ['Total Assets',    `${selectedIds.length} asset(s)`],
                ['Total Value',     formatINR(totalValue)],
                ['Approval Email',  form.manager_email],
                ...(form.transfer_type==='Returnable' ? [['Expected Return', form.expected_return_date ? new Date(form.expected_return_date).toLocaleDateString('en-IN') : '—']] : []),
                ...(form.notes ? [['Notes', form.notes]] : []),
              ].map(([k,v]) => (
                <div key={k} className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
                  <p className="text-xs text-ink-300 dark:text-gray-400 mb-0.5">{k}</p>
                  <p className="text-sm font-semibold text-ink-900 dark:text-gray-100">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Assets list */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-cream-200 dark:border-gray-700">
              <p className="text-sm font-bold text-ink-900 dark:text-gray-100">
                Assets to Transfer ({selectedAssets.length})
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 dark:border-gray-700">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Asset Code</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Asset Description</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Category</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Department</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAssets.map(a => (
                    <tr key={a.id} className="border-b border-cream-200 dark:border-gray-700">
                      <td className="px-4 py-2.5 text-brand-600 font-semibold text-xs">
                        {a.asset_code}
                        {a.sub_sequence > 0 && <span className="text-ink-300 ml-1">· {a.sub_sequence}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink-900 dark:text-gray-100">{a.name}</td>
                      <td className="px-4 py-2.5 text-ink-500 dark:text-gray-400">{a.category||'—'}</td>
                      <td className="px-4 py-2.5 text-ink-500 dark:text-gray-400">{a.dept_name||'—'}</td>
                      <td className="px-4 py-2.5 font-semibold text-ink-700 dark:text-gray-200">{formatINR(a.acquisition_value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-cream-50 dark:bg-gray-750">
                    <td colSpan={4} className="px-4 py-2.5 text-right text-sm font-bold text-ink-900 dark:text-gray-100">Total Value</td>
                    <td className="px-4 py-2.5 font-bold text-brand-600">{formatINR(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Email info */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
            <span>
              After submitting, an approval email will be sent to <strong>{form.manager_email}</strong>.
              Assets will be marked as <strong>"Pending Transfer"</strong> until the email is approved.
              The transfer status will automatically update when they click Approve or Reject in the email.
            </span>
          </div>

          {submitErr && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <X size={14}/>{submitErr}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={15}/> Back
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Submitting…</>
                : <>Submit & Send Approval Email <ArrowRight size={15}/></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

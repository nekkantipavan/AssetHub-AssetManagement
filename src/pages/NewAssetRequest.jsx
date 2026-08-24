import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X, ClipboardList, Send, Plus, Trash2 } from 'lucide-react'
import Button from '../components/common/Button'
import { Input, Select } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getMastersLookup, getEmailMasters, createAssetRequest } from '../data/api'

const formatINR = v =>
  v == null || v === '' || isNaN(v) ? '—'
  : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:2 })

const EMPTY_ITEM = {
  material_description: '', quantity: '', unit_price: '',
  company_code: '', cost_center: '', project_name: '', plant_id: '', asset_life: '', remarks: '',
}

export default function NewAssetRequest() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [masters,   setMasters]   = useState({ plants:[], departments:[], company_codes:[], cost_centers:[] })
  const [emailOpts, setEmailOpts] = useState([])
  const [loading,   setLoading]   = useState(true)

  // Shared request fields
  const [shared, setShared] = useState({ dept_id:'', asset_owner:'', dept_head_email:'', manager_email:'' })
  // Line items
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  const [err,        setErr]        = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([getMastersLookup(), getEmailMasters()])
      .then(([m, e]) => { setMasters(m.data); setEmailOpts(e.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleShared = e => setShared(p => ({ ...p, [e.target.name]: e.target.value }))

  function setItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  function addItem()    { setItems(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(idx) { setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)) }

  const itemTotal = it => {
    const q = parseFloat(it.quantity), p = parseFloat(String(it.unit_price).replace(/[,₹$]/g, ''))
    return !isNaN(q) && !isNaN(p) ? q * p : null
  }
  const requestTotal = items.reduce((s, it) => s + (itemTotal(it) || 0), 0)

  const deptHeadOpts = emailOpts.filter(e => e.role === 'Department Head')
  const managerOpts  = emailOpts.filter(e => e.role !== 'Department Head')

  async function handleSubmit() {
    setErr('')
    if (!shared.dept_id)            return setErr('Please select a Department')
    if (!shared.asset_owner.trim()) return setErr('Asset Owner is required')
    for (let i = 0; i < items.length; i++) {
      const it = items[i], n = i + 1
      if (!it.material_description.trim()) return setErr(`Item ${n}: Material Description is required`)
      if (!it.quantity || parseInt(it.quantity) < 1) return setErr(`Item ${n}: Quantity must be at least 1`)
      if (!it.unit_price || isNaN(parseFloat(it.unit_price))) return setErr(`Item ${n}: Unit Price is required`)
      if (!it.company_code) return setErr(`Item ${n}: Company Code is required`)
      if (!it.cost_center)  return setErr(`Item ${n}: Cost Center is required`)
      if (!it.plant_id)     return setErr(`Item ${n}: Asset Location is required`)
    }
    if (!shared.dept_head_email) return setErr('Please select a Department Head approver')
    if (!shared.manager_email)   return setErr('Please select a Manager approver')

    setSubmitting(true)
    try {
      const r = await createAssetRequest({
        asset_owner: shared.asset_owner,
        dept_id: parseInt(shared.dept_id),
        dept_head_email: shared.dept_head_email,
        manager_email: shared.manager_email,
        items: items.map(it => ({
          ...it,
          quantity: parseInt(it.quantity),
          plant_id: parseInt(it.plant_id),
        })),
      })
      if (r.data.email_warning) alert(`Request created, but: ${r.data.email_warning}`)
      navigate(`/asset-requests/${r.data.id}`)
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to create request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/asset-requests')}
          className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400 dark:text-gray-400 transition-colors">
          <ArrowLeft size={18}/>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-orange-gradient flex items-center justify-center shadow-soft">
            <ClipboardList size={18} className="text-white"/>
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-900 dark:text-gray-100 leading-none">New Asset Request</h2>
            <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Request new assets for approval</p>
          </div>
        </div>
      </div>

      {err && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <X size={14}/>{err}
        </div>
      )}

      {/* Request Information (shared) */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6 space-y-5">
        <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Request Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Request Date" value={new Date().toLocaleDateString('en-IN')} disabled readOnly/>
          <Input label="Requested By" value={user?.name || ''} disabled readOnly/>
          <Select label="Department *" name="dept_id" value={shared.dept_id} onChange={handleShared}>
            <option value="">— Select Department —</option>
            {masters.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input label="Asset Owner *" name="asset_owner" value={shared.asset_owner} onChange={handleShared} placeholder="e.g. Subramani S"/>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Assets ({items.length})</h3>
          <span className="text-sm font-bold text-brand-600">Total: {formatINR(requestTotal)}</span>
        </div>

        <div className="space-y-4">
          {items.map((it, idx) => (
            <div key={idx} className="bg-cream-50 dark:bg-gray-750 rounded-2xl p-4 relative border border-cream-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-ink-500 dark:text-gray-400 uppercase tracking-wide">Asset #{idx + 1}</span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(idx)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-ink-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3">
                  <Input label="Material Description *" name="material_description" value={it.material_description}
                    onChange={e => setItem(idx, 'material_description', e.target.value)} placeholder="e.g. PCB Cleaning Machine"/>
                </div>
                <Input label="Quantity *" type="number" min="1" value={it.quantity}
                  onChange={e => setItem(idx, 'quantity', e.target.value)} placeholder="0"/>
                <Input label="Unit Price (₹) *" type="number" min="0" value={it.unit_price}
                  onChange={e => setItem(idx, 'unit_price', e.target.value)} placeholder="0.00"/>
                <Input label="Item Total (₹)" value={itemTotal(it) != null ? formatINR(itemTotal(it)) : '—'} disabled readOnly/>

                <Select label="Company Code *" value={it.company_code} onChange={e => setItem(idx, 'company_code', e.target.value)}>
                  <option value="">— Select —</option>
                  {masters.company_codes.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select label="Cost Center *" value={it.cost_center} onChange={e => setItem(idx, 'cost_center', e.target.value)}>
                  <option value="">— Select —</option>
                  {masters.cost_centers.map(c => {
                    const val = c.value ?? c, desc = c.description
                    return <option key={val} value={val}>{desc ? `${val} — ${desc}` : val}</option>
                  })}
                </Select>
                <Input label="Project Name" value={it.project_name} onChange={e => setItem(idx, 'project_name', e.target.value)} placeholder="e.g. New PCB Line"/>

                <Select label="Asset Location *" value={it.plant_id} onChange={e => setItem(idx, 'plant_id', e.target.value)}>
                  <option value="">— Select Location —</option>
                  {masters.plants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </Select>
                <Input label="Asset Life (Years)" type="number" min="0" value={it.asset_life}
                  onChange={e => setItem(idx, 'asset_life', e.target.value)} placeholder="e.g. 5"/>
                <Input label="Remarks" value={it.remarks} onChange={e => setItem(idx, 'remarks', e.target.value)} placeholder="Optional"/>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addItem}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed
                     border-cream-300 dark:border-gray-600 text-ink-500 dark:text-gray-400
                     hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-gray-700 transition-all text-sm font-semibold">
          <Plus size={16}/> Add another asset
        </button>
      </div>

      {/* Approval routing */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6 space-y-5">
        <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Approval Routing</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Select label="Department Head Approval *" name="dept_head_email" value={shared.dept_head_email} onChange={handleShared}>
              <option value="">— Select Department Head —</option>
              {deptHeadOpts.map(e => (
                <option key={e.id} value={e.email}>{e.name} — {e.email}{e.department ? ` (${e.department})` : ''}</option>
              ))}
            </Select>
            {deptHeadOpts.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ⚠ No Department Head approvers configured. Go to System → Email Masters to add one first.
              </p>
            )}
          </div>
          <div>
            <Select label="Manager Approval *" name="manager_email" value={shared.manager_email} onChange={handleShared}>
              <option value="">— Select Manager —</option>
              {managerOpts.map(e => (
                <option key={e.id} value={e.email}>{e.name} — {e.email}{e.department ? ` (${e.department})` : ''}</option>
              ))}
            </Select>
            {managerOpts.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ⚠ No Manager approvers configured. Go to System → Email Masters to add one first.
              </p>
            )}
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          On submit, an approval email goes to the <strong>Department Head</strong>. After they approve, the asset team assigns one
          asset code per line item, then a final approval email goes to the <strong>Manager</strong>. If either rejects, the whole request is rejected.
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/asset-requests')}>
          <ArrowLeft size={15}/> Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting
            ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Submitting…</>
            : <><Send size={15}/> Submit Request</>}
        </Button>
      </div>
    </div>
  )
}

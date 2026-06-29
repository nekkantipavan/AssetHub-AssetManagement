import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Plus, Eye, Edit2, Trash2, Box, X } from 'lucide-react'
import { Badge } from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Input, Select } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getAssets, createAsset, updateAsset, deleteAsset, getPlants, getDepartments, getUsers, getAssetMastersAll } from '../data/api'

const EMPTY_FORM = {
  asset_code: '', sub_sequence: '0',
  name: '', company_code: '', cost_center: '',
  asset_class: '', category: '',
  serial_number: '', acquisition_value: '',
  make: '', supplier_name: '',
  reference_invoice_no: '', fiscal_year: '',
  date_of_purchase: '', warranty_date: '',
  plant_id: '', dept_id: '',
  assigned_employee: '', assigned_user_id: '',
  asset_status: '', status: 'Active', notes: '',
}

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })

export default function Assets() {
  const { canEdit } = useAuth()
  const editable = canEdit('assets')
  const navigate  = useNavigate()
  const location  = useLocation()

  const [assets,    setAssets]    = useState([])
  const [plants,    setPlants]    = useState([])
  const [depts,     setDepts]     = useState([])
  const [employees, setEmployees] = useState([])
  const [masters,   setMasters]   = useState({ category:[], asset_class:[], asset_status:[], status:[], company_code:[], cost_center:[] })
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Filters
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterDept,   setFilterDept]   = useState('All')
  const [filterCat,    setFilterCat]    = useState('All')

  // Modals
  const [modalType, setModalType] = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    Promise.all([getAssets(), getPlants(), getDepartments(), getUsers(), getAssetMastersAll()])
      .then(([a, p, d, u, m]) => {
        setAssets(a.data)
        setPlants(p.data)
        setDepts(d.data)
        setEmployees(u.data)
        setMasters(m.data)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Auto-open edit modal when navigated back from AssetDetail with editId in state
  useEffect(() => {
    const editId = location.state?.editId
    if (!editId || !assets.length) return
    const a = assets.find(x => x.id === editId)
    if (a) {
      openEdit(a)
      window.history.replaceState({}, '')
    }
  }, [assets, location.state])

  const statusOptions   = ['All', 'Active', 'Inactive', 'In Transfer']
  const deptOptions     = ['All', ...new Set(assets.map(a => a.dept_name).filter(Boolean))]
  const categoryOptions = ['All', ...new Set(assets.map(a => a.category).filter(Boolean))]

  const filtered = useMemo(() => assets.filter(a => {
    const q = search.toLowerCase()
    const matchQ = !q ||
      a.name?.toLowerCase().includes(q) ||
      a.asset_code?.toLowerCase().includes(q) ||
      a.serial_number?.toLowerCase().includes(q) ||
      a.assigned_employee?.toLowerCase().includes(q) ||
      a.employee_name?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q)
    return matchQ &&
      (filterStatus === 'All' || a.status === filterStatus) &&
      (filterDept   === 'All' || a.dept_name === filterDept) &&
      (filterCat    === 'All' || a.category  === filterCat)
  }), [assets, search, filterStatus, filterDept, filterCat])

  // ── Modal helpers ────────────────────────────────────────────
  function openAdd() { setForm(EMPTY_FORM); setFormError(''); setModalType('add') }
  function openEdit(a) {
    setSelected(a)
    setForm({
      asset_code:          a.asset_code          || '',
      sub_sequence:        a.sub_sequence != null ? String(a.sub_sequence) : '0',
      name:                a.name                || '',
      company_code:        a.company_code        || '',
      cost_center:         a.cost_center         || '',
      asset_class:         a.asset_class         || '',
      category:            a.category            || '',
      serial_number:       a.serial_number       || '',
      acquisition_value:   a.acquisition_value   != null ? String(a.acquisition_value) : '',
      make:                a.make                || '',
      supplier_name:       a.supplier_name       || '',
      reference_invoice_no: a.reference_invoice_no || '',
      fiscal_year:         a.fiscal_year         || '',
      date_of_purchase:    a.date_of_purchase    ? a.date_of_purchase.split('T')[0] : '',
      warranty_date:       a.warranty_date       ? a.warranty_date.split('T')[0]    : '',
      plant_id:            a.plant_id            || '',
      dept_id:             a.dept_id             || '',
      assigned_employee:   a.assigned_employee   || '',
      assigned_user_id:    a.assigned_user_id    || '',
      asset_status:        a.asset_status        || '',
      status:              a.status              || 'Active',
      notes:               a.notes               || '',
    })
    setFormError(''); setModalType('edit')
  }
  function openDelete(a)  { setSelected(a); setFormError(''); setModalType('delete') }
  function closeModal()   { setModalType(null); setSelected(null) }

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    setFormError('')
    const subSeq = parseInt(form.sub_sequence)
    if (!form.asset_code.trim())                               { setFormError('Asset Code is required'); return }
    if (form.sub_sequence === '' || isNaN(subSeq) || subSeq < 0) { setFormError('Sub Asset Number must be 0 or a positive integer'); return }
    if (!form.name.trim())                                     { setFormError('Asset Description is required'); return }
    if (!form.company_code)                                    { setFormError('Company Code is required'); return }
    if (!form.cost_center)                                     { setFormError('Cost Center is required'); return }
    if (!form.asset_class)                                     { setFormError('Asset Class is required'); return }
    if (!form.category)                                        { setFormError('Category is required'); return }
    if (!form.make.trim())                                     { setFormError('Manufacturer of Asset is required'); return }
    if (!form.supplier_name.trim())                            { setFormError('Supplier Name is required'); return }
    if (form.acquisition_value === '')                         { setFormError('Acquisition Value is required'); return }
    if (parseFloat(form.acquisition_value) < 0)               { setFormError('Acquisition Value cannot be negative'); return }
    if (!form.reference_invoice_no.trim())                     { setFormError('Reference / Invoice No is required'); return }
    if (!form.fiscal_year.trim())                              { setFormError('Fiscal Year is required'); return }
    if (!form.date_of_purchase)                                { setFormError('Capitalized On is required'); return }
    if (!form.plant_id)                                        { setFormError('Business Area Code is required'); return }
    if (!form.dept_id)                                         { setFormError('Department is required'); return }
    if (!form.assigned_employee.trim())                        { setFormError('Assigned Employee is required'); return }
    if (!form.asset_status)                                    { setFormError('Asset Status is required'); return }

    setSaving(true)
    try {
      const payload = {
        asset_code:           form.asset_code.trim(),
        sub_sequence:         subSeq,
        name:                 form.name.trim(),
        company_code:         form.company_code,
        cost_center:          form.cost_center,
        asset_class:          form.asset_class,
        category:             form.category,
        serial_number:        form.serial_number || null,
        acquisition_value:    parseFloat(form.acquisition_value),
        make:                 form.make.trim(),
        supplier_name:        form.supplier_name.trim(),
        reference_invoice_no: form.reference_invoice_no.trim(),
        fiscal_year:          form.fiscal_year.trim(),
        date_of_purchase:     form.date_of_purchase || null,
        warranty_date:        form.warranty_date    || null,
        plant_id:             form.plant_id  || null,
        dept_id:              form.dept_id   || null,
        assigned_employee:    form.assigned_employee.trim(),
        assigned_user_id:     form.assigned_user_id || null,
        asset_status:         form.asset_status,
        status:               form.status,
        notes:                form.notes || null,
      }
      const plant = plants.find(p => p.id === parseInt(form.plant_id))
      const dept  = depts.find(d  => d.id === parseInt(form.dept_id))

      if (modalType === 'add') {
        const r = await createAsset(payload)
        setAssets(prev => [{ ...r.data, plant_name: plant?.name, dept_name: dept?.name }, ...prev])
      } else {
        const r = await updateAsset(selected.id, payload)
        setAssets(prev => prev.map(a => a.id === selected.id
          ? { ...r.data, plant_name: plant?.name, dept_name: dept?.name } : a))
      }
      closeModal()
    } catch (err) {
      setFormError(err.response?.data?.error || 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAsset(selected.id)
      setAssets(prev => prev.filter(a => a.id !== selected.id))
      closeModal()
    } catch (err) {
      setFormError(err.response?.data?.error || 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading assets…</div>
  if (error)   return <div className="py-20 text-center text-sm text-red-500">Error: {error}</div>

  const assetClasses  = masters.asset_class?.map(m => m.value)  || []
  const categories    = masters.category?.map(m => m.value)      || []
  const assetStatuses = masters.asset_status?.map(m => m.value)  || []
  const companyCodes  = masters.company_code?.map(m => m.value)  || []
  const costCenters   = masters.cost_center  || []

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-2xl shadow-soft text-sm
                         text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-brand-300 w-56"/>
          </div>

          {[
            { value: filterStatus, onChange: setFilterStatus, options: statusOptions,   placeholder:'Status'     },
            { value: filterDept,   onChange: setFilterDept,   options: deptOptions,     placeholder:'Department' },
            { value: filterCat,    onChange: setFilterCat,    options: categoryOptions, placeholder:'Category'   },
          ].map((f, i) => (
            <select key={i} value={f.value} onChange={e => f.onChange(e.target.value)}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft px-3 py-2.5 text-sm
                         text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300
                         border-0">
              {f.options.map(o => <option key={o}>{o}</option>)}
            </select>
          ))}

          {(filterStatus !== 'All' || filterDept !== 'All' || filterCat !== 'All' || search) && (
            <button onClick={() => { setSearch(''); setFilterStatus('All'); setFilterDept('All'); setFilterCat('All') }}
              className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              <X size={12}/> Clear
            </button>
          )}
        </div>
        {editable && <Button onClick={openAdd}><Plus size={15}/> Add Asset</Button>}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">All Assets</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">{filtered.length} of {assets.length} records</p>
          </div>
          <Button variant="secondary" size="sm">Export CSV</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-cream-200 dark:border-gray-700">
                {['Asset Code','Asset Description','Category','Serial Number','Acq. Value','Plant','Department','Assigned To','Created','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-750 transition-colors cursor-pointer"
                  onClick={() => navigate(`/assets/${a.id}`)}>
                  <td className="px-4 py-3"><span className="text-brand-600 font-semibold text-xs">{a.asset_code}</span></td>
                  <td className="px-4 py-3 max-w-[180px]"><span className="block truncate font-medium text-sm text-ink-900 dark:text-gray-100">{a.name}</span></td>
                  <td className="px-4 py-3"><span className="text-xs bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 px-2 py-1 rounded-lg">{a.category || '—'}</span></td>
                  <td className="px-4 py-3"><span className="font-mono text-xs text-ink-400 dark:text-gray-400">{a.serial_number || '—'}</span></td>
                  <td className="px-4 py-3 text-sm font-semibold text-ink-700 dark:text-gray-200">{formatINR(a.acquisition_value)}</td>
                  <td className="px-4 py-3 text-xs text-ink-500 dark:text-gray-400">{a.plant_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.dept_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{a.assigned_employee || a.employee_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-400 dark:text-gray-400">{new Date(a.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3"><Badge label={a.status}/></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/assets/${a.id}`)} className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 text-ink-400 dark:text-gray-400 transition-colors"><Eye size={14}/></button>
                      {editable && <>
                        <button onClick={() => openEdit(a)}   className="p-1.5 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 text-ink-400 dark:text-gray-400 transition-colors"><Edit2  size={14}/></button>
                        <button onClick={() => openDelete(a)} className="p-1.5 rounded-xl hover:bg-red-50   dark:hover:bg-red-900/20   hover:text-red-500   text-ink-400 dark:text-gray-400 transition-colors"><Trash2 size={14}/></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-ink-300 dark:text-gray-500">
            <Box size={32} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm">{assets.length === 0 ? 'No assets yet. Add one or use Bulk Upload.' : 'No assets match your filters.'}</p>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ───────────────────────────────────── */}
      <Modal isOpen={modalType==='add'||modalType==='edit'} onClose={closeModal}
             title={modalType==='add' ? 'Add New Asset' : 'Edit Asset'} size="lg">
        <div className="space-y-5">
          {formError && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <X size={14}/>{formError}
            </div>
          )}

          {/* Section: Asset Identity & Classification */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Asset Identity & Classification</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Asset Code *"       name="asset_code"   value={form.asset_code}   onChange={handleChange} placeholder="e.g. AST-001"/>
              <Input label="Sub Asset Number *" name="sub_sequence" value={form.sub_sequence} onChange={handleChange} type="number" placeholder="0"/>

              <Input label="Asset Description *" name="name" value={form.name} onChange={handleChange}
                     placeholder="e.g. Dell Laptop XPS 15" className="col-span-2"/>

              <Select label="Company Code *" name="company_code" value={form.company_code} onChange={handleChange}>
                <option value="">— Select Company Code —</option>
                {companyCodes.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>

              <Select label="Cost Center *" name="cost_center" value={form.cost_center} onChange={handleChange}>
                <option value="">— Select Cost Center —</option>
                {costCenters.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.value}{c.description ? ` — ${c.description}` : ''}
                  </option>
                ))}
              </Select>

              <Select label="Asset Class *" name="asset_class" value={form.asset_class} onChange={handleChange}>
                <option value="">— Select Asset Class —</option>
                {assetClasses.map(c => <option key={c}>{c}</option>)}
              </Select>

              <Select label="Category *" name="category" value={form.category} onChange={handleChange}>
                <option value="">— Select Category —</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </Select>

              <Input label="Manufacturer of Asset *" name="make"          value={form.make}          onChange={handleChange} placeholder="e.g. Dell"/>
              <Input label="Supplier Name *"          name="supplier_name" value={form.supplier_name} onChange={handleChange} placeholder="e.g. Tech Supplies Ltd."/>

              <Input label="Serial Number" name="serial_number" value={form.serial_number} onChange={handleChange} placeholder="Manufacturer serial no."/>
              <Input label="Acquisition Value (₹) *" name="acquisition_value" value={form.acquisition_value}
                     onChange={handleChange} type="number" placeholder="0"/>

              <Input label="Reference / Invoice No *" name="reference_invoice_no" value={form.reference_invoice_no}
                     onChange={handleChange} placeholder="e.g. INV-2024-001"/>
              <Input label="Fiscal Year *" name="fiscal_year" value={form.fiscal_year}
                     onChange={handleChange} placeholder="e.g. 2025"/>
            </div>
          </div>

          {/* Section: Dates */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Dates</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Capitalized On *" name="date_of_purchase" value={form.date_of_purchase} onChange={handleChange} type="date"/>
              <Input label="Warranty Date"    name="warranty_date"    value={form.warranty_date}    onChange={handleChange} type="date"/>
            </div>
          </div>

          {/* Section: Location & Assignment */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Location & Assignment</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Business Area Code *" name="plant_id" value={form.plant_id} onChange={handleChange}>
                <option value="">— Select Plant —</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </Select>

              <Select label="Department *" name="dept_id" value={form.dept_id} onChange={handleChange}>
                <option value="">— Select Department —</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>

              <Input label="Assigned Employee *" name="assigned_employee" value={form.assigned_employee}
                     onChange={handleChange} placeholder="Employee name" className="col-span-2"/>

              <Select label="System User (optional)" name="assigned_user_id" value={form.assigned_user_id} onChange={handleChange}>
                <option value="">— Link to a system user —</option>
                {employees.map(u => <option key={u.id} value={u.id}>{u.name} ({u.employee_id})</option>)}
              </Select>

              <Select label="Asset Status *" name="asset_status" value={form.asset_status} onChange={handleChange}>
                <option value="">— Select Asset Status —</option>
                {assetStatuses.map(s => <option key={s}>{s}</option>)}
              </Select>
            </div>
          </div>

          {/* Section: Record */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Record</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Record Status" name="status" value={form.status} onChange={handleChange}>
                <option>Active</option><option>Inactive</option>
              </Select>
              <Input label="Notes" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes"/>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Saving…</>
                : modalType==='add' ? 'Add Asset' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ───────────────────────────────────────── */}
      <Modal isOpen={modalType==='delete'} onClose={closeModal} title="Delete Asset" size="sm">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600 dark:text-gray-300">
              Delete <strong>{selected.name}</strong> ({selected.asset_code})? This cannot be undone.
            </p>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete Asset'}</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}

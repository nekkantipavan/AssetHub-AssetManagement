import assetFields from '../../shared/assetFields.json'
import AssetRegisterTable from '../components/common/AssetRegisterTable'
import PageState from '../components/common/PageState'
import { optionalAssetColumns, readAssetPreferences, defaultAssetPreferences } from '../data/assetPreferences'
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Plus, Box, X, ScanLine, Printer, CheckSquare } from 'lucide-react'
import { Badge } from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import { Input, Select } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getAssets, createAsset, updateAsset, deleteAsset, getPlants, getDepartments, getUsers, getAssetMastersAll, getAssetFilterOptions } from '../data/api'
const ScanAssetModal = lazy(() => import('../components/scanner/ScanAssetModal'))
const PrintLabelsModal = lazy(() => import('../components/labels/PrintLabelsModal'))

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

export default function Assets() {
  const { canEdit, canAccess, user } = useAuth()
  const editable = canEdit('assets')
  const navigate  = useNavigate()
  const location  = useLocation()

  const preferenceKey = 'ams_asset_views_v1_' + user.id
  const cachedPreferences = useMemo(() => readAssetPreferences(preferenceKey), [preferenceKey])
  const [views, setViews] = useState(cachedPreferences.views)
  const [columns,setColumns] = useState(cachedPreferences.last.columns)
  const [compact,setCompact] = useState(cachedPreferences.last.compact)
  const [sort,setSort] = useState(cachedPreferences.last.sort)
  const [filterPlant,setFilterPlant] = useState(cachedPreferences.last.plant)
  const [preferencesOpen,setPreferencesOpen] = useState(false)
  const [viewOpen,setViewOpen] = useState(false)
  const [viewName,setViewName] = useState('')
  const [preferenceError,setPreferenceError] = useState('')
  const requestRef=useRef()
  const formBaseline=useRef('')
  useEffect(()=>()=>requestRef.current?.abort(),[])

  // State
  const [allClientAssets, setAllClientAssets] = useState(null) // Non-null if backend returned bare array
  const [serverAssets,    setServerAssets]    = useState([])
  const [serverTotal,     setServerTotal]     = useState(0)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)

  // Lookup data (loaded once)
  const [plants,    setPlants]    = useState([])
  const [depts,     setDepts]     = useState([])
  const [employees, setEmployees] = useState([])
  const [masters,   setMasters]   = useState({ category:[], asset_class:[], asset_status:[], status:[], company_code:[], cost_center:[] })
  const [filterOptions, setFilterOptions] = useState({ departments: [], categories: [] })

  // Filters & pagination
  const [search,          setSearch]          = useState(cachedPreferences.last.search)
  const [debouncedSearch, setDebouncedSearch] = useState(cachedPreferences.last.search)
  const [filterStatus,    setFilterStatus]    = useState(cachedPreferences.last.status)
  const [filterDept,      setFilterDept]      = useState(cachedPreferences.last.department)
  const [filterCat,       setFilterCat]       = useState(cachedPreferences.last.category)
  const [currentPage,     setCurrentPage]     = useState(1)
  const [pageSize,        setPageSize]        = useState(cachedPreferences.last.pageSize)

  // Modals
  const [modalType, setModalType] = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')
  const [formAttempted,setFormAttempted] = useState(false)
  const fieldErrors={}
  for(const field of assetFields)if(field.required && String(form[field.db]??'').trim()==='')fieldErrors[field.db]=field.label+' is required'
  if(form.sub_sequence!==''&&!/^\d+$/.test(String(form.sub_sequence)))fieldErrors.sub_sequence='Use 0 or a positive whole number'
  if(form.acquisition_value!==''&&(!Number.isFinite(Number(form.acquisition_value))||Number(form.acquisition_value)<0))fieldErrors.acquisition_value='Use a non-negative number'
  if(form.fiscal_year&&!/^\d{4}$/.test(form.fiscal_year))fieldErrors.fiscal_year='Use a four-digit fiscal year'

  // Scan & Print Label State
  const [isScanModalOpen, setIsScanModalOpen] = useState(false)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [selectedForPrint, setSelectedForPrint] = useState([])
  const [selectedAssetIds, setSelectedAssetIds] = useState(new Set())


  const currentPreferences={search,status:filterStatus,department:filterDept,category:filterCat,plant:filterPlant,sort,pageSize,columns,compact}
  useEffect(()=>{
    try {localStorage.setItem(preferenceKey,JSON.stringify({last:currentPreferences,views}))}
    catch {setPreferenceError('Your browser could not save these preferences.')}
  },[preferenceKey,search,filterStatus,filterDept,filterCat,filterPlant,sort,pageSize,columns,compact,views])
  useEffect(()=>{if(modalType==='add'||modalType==='edit')formBaseline.current=JSON.stringify(form)},[modalType])
  function loadView(v) {
    setSearch(v.search);setDebouncedSearch(v.search);setFilterStatus(v.status);setFilterDept(v.department);setFilterCat(v.category);setFilterPlant(v.plant);setSort(v.sort);setPageSize(v.pageSize);setColumns(v.columns);setCompact(v.compact);setCurrentPage(1);setSelectedAssetIds(new Set())
  }
  function saveView() {
    const name=viewName.trim().slice(0,50)
    if(!name){setPreferenceError('Give this view a name.');return}
    if(views.length>=10&&!views.some(v=>v.name===name)){setPreferenceError('Keep up to 10 views. Remove one before adding another.');return}
    setViews(v=>[...v.filter(x=>x.name!==name),{name,settings:currentPreferences}]);setViewOpen(false);setViewName('');setPreferenceError('')
  }
  function moveColumn(key,delta) {setColumns(cols=>{const next=[...cols],at=next.indexOf(key),to=at+delta;if(to>=0&&to<next.length)[next[at],next[to]]=[next[to],next[at]];return next})}

  // Debounce search input (300ms)
  const debounceRef = useRef(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [filterStatus, filterDept, filterCat, filterPlant, sort])

  // Load lookup data once on mount
  useEffect(() => {
    Promise.all([
      getPlants().catch(() => ({ data: [] })),
      getDepartments().catch(() => ({ data: [] })),
      getUsers().catch(() => ({ data: [] })),
      getAssetMastersAll().catch(() => ({ data: {} })),
      getAssetFilterOptions().catch(() => ({ data: { departments: [], categories: [] } }))
    ])
      .then(([p, d, u, m, fo]) => {
        setPlants(Array.isArray(p.data) ? p.data : [])
        setDepts(Array.isArray(d.data) ? d.data : [])
        setEmployees(Array.isArray(u.data) ? u.data : [])
        setMasters(m.data && typeof m.data === 'object' ? m.data : {})
        const foData = fo?.data || {}
        setFilterOptions({
          departments: Array.isArray(foData.departments) ? foData.departments : (Array.isArray(d.data) ? d.data : []),
          categories: Array.isArray(foData.categories) ? foData.categories : (Array.isArray(m.data?.category) ? m.data.category.map(c => c.value || c) : [])
        })
      })
      .catch(console.error)
  }, [])

  // Fetch assets
  const fetchAssets = useCallback(async () => {
    requestRef.current?.abort()
    const controller=new AbortController();requestRef.current=controller
    setLoading(true)
    try {
      const params = { page: currentPage, pageSize }
      if (debouncedSearch) params.search = debouncedSearch
      if (filterStatus !== 'All') params.status = filterStatus
      if (filterDept !== 'All') params.dept_id = filterDept
      if (filterCat !== 'All') params.category = filterCat

      params.sort=sort
      if(filterPlant!=='All')params.plant_id=filterPlant
      const res = await getAssets(params,controller.signal)
      if(controller.signal.aborted)return
      const raw = res?.data

      if (Array.isArray(raw)) {
        // Old un-paginated backend: store all assets for smooth client slicing
        setAllClientAssets(raw)
        setServerAssets([])
      } else if (raw && Array.isArray(raw.data)) {
        // New server-paginated backend
        setAllClientAssets(null)
        setServerAssets(raw.data)
        setServerTotal(raw.total ?? raw.data.length)
        if(raw.page!==currentPage)setCurrentPage(raw.page)
      } else {
        setAllClientAssets(null)
        setServerAssets([])
        setServerTotal(0)
      }
      setError(null)
    } catch (e) {
      if(controller.signal.aborted)return
      setError(e.response?.data?.error || e.message || 'Failed to load assets')
      setServerAssets([])
      setServerTotal(0)
    } finally {
      if(!controller.signal.aborted)setLoading(false)
    }
  }, [currentPage, pageSize, debouncedSearch, filterStatus, filterDept, filterCat, filterPlant, sort])

  useEffect(() => { fetchAssets() }, [fetchAssets])

  // Compute displayed assets: handles both server-paginated mode and client-fallback mode
  const { displayAssets, totalRecords } = useMemo(() => {
    if (allClientAssets !== null) {
      // Client-side fallback: filter and slice to strictly pageSize (NEVER render 42K items in DOM)
      const q = debouncedSearch.toLowerCase().trim()
      const filtered = allClientAssets.filter(a => {
        const matchQ = !q ||
          a.name?.toLowerCase().includes(q) ||
          a.asset_code?.toLowerCase().includes(q) ||
          a.serial_number?.toLowerCase().includes(q) ||
          a.assigned_employee?.toLowerCase().includes(q) ||
          a.employee_name?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q)
        return matchQ &&
          (filterStatus === 'All' || a.status === filterStatus) &&
          (filterDept   === 'All' || String(a.dept_id) === String(filterDept) || a.dept_name === filterDept) &&
          (filterCat    === 'All' || a.category === filterCat)
      })

      const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      return { displayAssets: paginated, totalRecords: filtered.length }
    } else {
      return { displayAssets: serverAssets, totalRecords: serverTotal }
    }
  }, [allClientAssets, serverAssets, serverTotal, debouncedSearch, filterStatus, filterDept, filterCat, currentPage, pageSize])

  useEffect(()=>{setSelectedAssetIds(new Set())},[currentPage,pageSize,debouncedSearch,filterStatus,filterDept,filterCat,filterPlant,sort])

  // Auto-open edit modal when navigated back from AssetDetail with editId in state
  useEffect(() => {
    const editId = location.state?.editId
    if (!editId || !displayAssets.length) return
    const a = displayAssets.find(x => x.id === editId)
    if (a) {
      openEdit(a)
      window.history.replaceState({}, '')
    }
  }, [displayAssets, location.state])

  const safeDepts = Array.isArray(filterOptions?.departments) ? filterOptions.departments : (Array.isArray(depts) ? depts : [])
  const safeCats = Array.isArray(filterOptions?.categories) ? filterOptions.categories : []

  const statusOptions   = ['All', 'Active', 'Inactive', 'Pending Transfer', 'In Transfer', 'In Transit']
  const deptOptions     = [{ id: 'All', name: 'All' }, ...safeDepts]
  const categoryOptions = ['All', ...safeCats]

  // ── Modal helpers ────────────────────────────────────────────
  function openAdd() { setFormAttempted(false); setForm(EMPTY_FORM); setFormError(''); setModalType('add') }
  function openEdit(a) {
    if (!a) return
    setFormAttempted(false)
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
  function closeModal() { if(!saving && (modalType==='add'||modalType==='edit') && formBaseline.current!==JSON.stringify(form) && !window.confirm('Discard your unsaved asset changes?'))return; setModalType(null); setSelected(null) }

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value, ...(e.target.name==='plant_id'?{dept_id:''}:{}) }))

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    setFormAttempted(true)
    if(Object.keys(fieldErrors).length){setFormError('Please correct the highlighted fields.');setTimeout(()=>document.querySelector('dialog[open] [aria-invalid="true"]')?.focus(),0);return}
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

      if (modalType === 'add') {
        await createAsset(payload)
      } else {
        await updateAsset(selected.id, payload)
      }
      closeModal()
      fetchAssets()
      getAssetFilterOptions().then(r => setFilterOptions(r?.data || {})).catch(() => {})
    } catch (err) {
      setFormError(err.response?.data?.error || 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Selection helpers
  const allPageSelected = displayAssets.length > 0 && displayAssets.every(a => selectedAssetIds.has(a.id))

  function toggleSelectAllPage() {
    if (allPageSelected) {
      const next = new Set(selectedAssetIds)
      displayAssets.forEach(a => next.delete(a.id))
      setSelectedAssetIds(next)
    } else {
      const next = new Set(selectedAssetIds)
      displayAssets.forEach(a => next.add(a.id))
      setSelectedAssetIds(next)
    }
  }

  function toggleSelectAsset(id, e) {
    if (e) e.stopPropagation()
    const next = new Set(selectedAssetIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedAssetIds(next)
  }

  function handleOpenPrintSelected() {
    const list = (allClientAssets || serverAssets || displayAssets).filter(a => selectedAssetIds.has(a.id))
    setSelectedForPrint(list.length > 0 ? list : displayAssets.slice(0, 5))
    setIsPrintModalOpen(true)
  }

  function handlePrintSingle(asset, e) {
    if (e) e.stopPropagation()
    setSelectedForPrint([asset])
    setIsPrintModalOpen(true)
  }

  function handleOpenCreateFromScan(code) {
    setForm({ ...EMPTY_FORM, asset_code: code || '' })
    setFormError('')
    setModalType('add')
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAsset(selected.id)
      closeModal()
      fetchAssets()
    } catch (err) {
      setFormError(err.response?.data?.error || 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  const assetClasses  = Array.isArray(masters?.asset_class)  ? masters.asset_class.map(m => m.value || m)  : []
  const categories    = Array.isArray(masters?.category)     ? masters.category.map(m => m.value || m)     : []
  const assetStatuses = Array.isArray(masters?.asset_status) ? masters.asset_status.map(m => m.value || m) : []
  const companyCodes  = Array.isArray(masters?.company_code) ? masters.company_code.map(m => m.value || m) : []
  const costCenters   = Array.isArray(masters?.cost_center)  ? masters.cost_center : []

  return (
    <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Load saved asset view" value="" onChange={e=>{const v=views.find(v=>v.name===e.target.value);if(v)loadView(v.settings)}} className="input-field !w-auto"><option value="">Load a saved view…</option>{views.map(v=><option key={v.name} value={v.name}>{v.name}</option>)}</select>
        <Button variant="secondary" size="sm" onClick={()=>setViewOpen(true)}>Save view</Button>
        <Button variant="secondary" size="sm" onClick={()=>setPreferencesOpen(true)}>Columns & density</Button>
        <select aria-label="Sort assets" value={sort} onChange={e=>setSort(e.target.value)} className="input-field !w-auto"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="code">Asset code</option><option value="name">Description</option></select>
        <button onClick={()=>loadView(defaultAssetPreferences)} className="text-xs text-brand-600 underline">Reset view</button>
      </div>
      {preferenceError&&<p role="alert" className="text-sm text-red-600">{preferenceError}</p>}
      {error&&<PageState error={error} onRetry={fetchAssets}/>}


      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              aria-label="Search asset register" placeholder="Code, serial, description, custodian…"
              className="pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-2xl shadow-soft text-sm
                         text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-brand-300 w-56"/>
          </div>

          <select aria-label="Filter asset plant" value={filterPlant} onChange={e=>setFilterPlant(e.target.value)} className="input-field !w-auto max-w-64"><option value="All">All plants</option>{plants.map(p=><option key={p.id} value={String(p.id)}>{p.name} ({p.code})</option>)}</select>
          <select aria-label="Filter asset status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft px-3 py-2.5 text-sm
                       text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300
                       border-0">
            {statusOptions.map(o => <option key={o} value={o}>{o === 'All' ? 'All statuses' : o}</option>)}
          </select>

          <select aria-label="Filter asset department" value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft px-3 py-2.5 text-sm
                       text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300
                       border-0">
            <option value="All">All departments</option>
            {safeDepts.map(d => <option key={d.id || d.name} value={d.id || d.name}>{d.name}</option>)}
          </select>

          <select aria-label="Filter asset category" value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft px-3 py-2.5 text-sm
                       text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300
                       border-0">
            {categoryOptions.map(o => <option key={o} value={o}>{o === 'All' ? 'All categories' : o}</option>)}
          </select>

          {(filterStatus !== 'All' || filterDept !== 'All' || filterCat !== 'All' || filterPlant !== 'All' || search) && (
            <button onClick={() => { setSearch(''); setFilterStatus('All'); setFilterDept('All'); setFilterCat('All'); setFilterPlant('All') }}
              className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              <X size={12}/> Clear
            </button>
          )}
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setIsScanModalOpen(true)}>
            <ScanLine size={15}/> Scan Asset
          </Button>

          <Button variant="secondary" onClick={() => {
            const list = displayAssets.filter(a => selectedAssetIds.has(a.id))
            setSelectedForPrint(list)
            setIsPrintModalOpen(true)
          }}>
            <Printer size={15}/> Print Labels
          </Button>

          {editable && <Button onClick={openAdd}><Plus size={15}/> Add Asset</Button>}
        </div>
      </div>

      {/* Floating Batch Selection Bar */}
      {selectedAssetIds.size > 0 && (
        <div className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-2xl px-5 py-3 flex items-center justify-between flex-wrap gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-900 dark:text-brand-200">
            <CheckSquare size={16} className="text-brand-600" />
            <span>{selectedAssetIds.size} {selectedAssetIds.size === 1 ? 'asset' : 'assets'} selected on this page</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedAssetIds(new Set())}
              className="px-3 py-1.5 rounded-xl border border-brand-200 dark:border-brand-700 bg-white dark:bg-gray-800 text-xs font-semibold text-ink-600 dark:text-gray-300 hover:bg-cream-50"
            >
              Clear Selection
            </button>
            <Button size="sm" onClick={handleOpenPrintSelected}>
              <Printer size={13} /> Print Selected Labels ({selectedAssetIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">All Assets</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">{totalRecords} records{loading ? ' · Loading…' : ''}</p>
          </div>
          {canAccess('reports') !== false && <Button variant="secondary" size="sm" onClick={()=>navigate('/reports/assets')}>Asset report & export</Button>}
        </div>

        <div className="overflow-x-auto">
          <AssetRegisterTable assets={displayAssets} columns={columns} compact={compact} loading={loading} selected={selectedAssetIds} onSelect={toggleSelectAsset} onSelectAll={e=>{
            const all=displayAssets.every(a=>selectedAssetIds.has(a.id));setSelectedAssetIds(all?new Set():new Set(displayAssets.map(a=>a.id)))
          }} onOpen={id=>navigate('/assets/'+id)} onEdit={openEdit} onDelete={openDelete} onPrint={handlePrintSingle} editable={editable}/>

        </div>


        {!loading && displayAssets.length === 0 && (
          <div className="py-16 text-center text-ink-300 dark:text-gray-500">
            <Box size={32} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm">{totalRecords === 0 && !search && filterStatus === 'All' && filterDept === 'All' && filterCat === 'All'
              ? 'No assets yet. Add one or use Bulk Upload.'
              : 'No assets match your filters.'}</p>
          </div>
        )}
      </div>

      <Pagination
        totalItems={totalRecords}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1) }}
      />

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Asset Code *"       name="asset_code"   value={form.asset_code}   onChange={handleChange} placeholder="e.g. AST-001" error={formAttempted ? fieldErrors.asset_code : undefined}/>
              <Input label="Sub Asset Number *" name="sub_sequence" value={form.sub_sequence} onChange={handleChange} type="number" placeholder="0" error={formAttempted ? fieldErrors.sub_sequence : undefined}/>

              <Input label="Asset Description *" name="name" value={form.name} onChange={handleChange}
                     placeholder="e.g. Dell Laptop XPS 15" className="col-span-2" error={formAttempted ? fieldErrors.name : undefined}/>

              <Select label="Company Code *" name="company_code" value={form.company_code} onChange={handleChange} error={formAttempted ? fieldErrors.company_code : undefined}>
                <option value="">— Select Company Code —</option>
                {companyCodes.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>

              <Select label="Cost Center *" name="cost_center" value={form.cost_center} onChange={handleChange} error={formAttempted ? fieldErrors.cost_center : undefined}>
                <option value="">— Select Cost Center —</option>
                {costCenters.map(c => (
                  <option key={c.value || c} value={c.value || c}>
                    {c.value || c}{c.description ? ` — ${c.description}` : ''}
                  </option>
                ))}
              </Select>

              <Select label="Asset Class *" name="asset_class" value={form.asset_class} onChange={handleChange} error={formAttempted ? fieldErrors.asset_class : undefined}>
                <option value="">— Select Asset Class —</option>
                {assetClasses.map(c => <option key={c}>{c}</option>)}
              </Select>

              <Select label="Category *" name="category" value={form.category} onChange={handleChange} error={formAttempted ? fieldErrors.category : undefined}>
                <option value="">— Select Category —</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </Select>

              <Input label="Manufacturer of Asset *" name="make"          value={form.make}          onChange={handleChange} placeholder="e.g. Dell" error={formAttempted ? fieldErrors.make : undefined}/>
              <Input label="Supplier Name *"          name="supplier_name" value={form.supplier_name} onChange={handleChange} placeholder="e.g. Tech Supplies Ltd." error={formAttempted ? fieldErrors.supplier_name : undefined}/>

              <Input label="Serial Number" name="serial_number" value={form.serial_number} onChange={handleChange} placeholder="Manufacturer serial no." error={formAttempted ? fieldErrors.serial_number : undefined}/>
              <Input label="Acquisition Value (₹) *" name="acquisition_value" value={form.acquisition_value}
                     onChange={handleChange} type="number" placeholder="0" error={formAttempted ? fieldErrors.acquisition_value : undefined}/>

              <Input label="Reference / Invoice No *" name="reference_invoice_no" value={form.reference_invoice_no}
                     onChange={handleChange} placeholder="e.g. INV-2024-001" error={formAttempted ? fieldErrors.reference_invoice_no : undefined}/>
              <Input label="Fiscal Year *" name="fiscal_year" value={form.fiscal_year}
                     onChange={handleChange} placeholder="e.g. 2025" error={formAttempted ? fieldErrors.fiscal_year : undefined}/>
            </div>
          </div>

          {/* Section: Dates */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Dates</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Capitalized On *" name="date_of_purchase" value={form.date_of_purchase} onChange={handleChange} type="date" error={formAttempted ? fieldErrors.date_of_purchase : undefined}/>
              <Input label="Warranty Date"    name="warranty_date"    value={form.warranty_date}    onChange={handleChange} type="date" error={formAttempted ? fieldErrors.warranty_date : undefined}/>
            </div>
          </div>

          {/* Section: Location & Assignment */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Location & Assignment</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Business Area Code *" name="plant_id" value={form.plant_id} onChange={handleChange} error={formAttempted ? fieldErrors.plant_id : undefined}>
                <option value="">— Select Plant —</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </Select>

              <Select label="Department *" name="dept_id" value={form.dept_id} onChange={handleChange} error={formAttempted ? fieldErrors.dept_id : undefined}>
                <option value="">— Select Department —</option>
                {depts.filter(d=>!form.plant_id||!d.plant_id||String(d.plant_id)===String(form.plant_id)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>

              <Input label="Assigned Employee *" name="assigned_employee" value={form.assigned_employee}
                     onChange={handleChange} placeholder="Employee name" className="col-span-2" error={formAttempted ? fieldErrors.assigned_employee : undefined}/>

              <Select label="System User (optional)" name="assigned_user_id" value={form.assigned_user_id} onChange={handleChange} error={formAttempted ? fieldErrors.assigned_user_id : undefined}>
                <option value="">— Link to a system user —</option>
                {employees.map(u => <option key={u.id} value={u.id}>{u.name} ({u.employee_id})</option>)}
              </Select>

              <Select label="Asset Status *" name="asset_status" value={form.asset_status} onChange={handleChange} error={formAttempted ? fieldErrors.asset_status : undefined}>
                <option value="">— Select Asset Status —</option>
                {assetStatuses.map(s => <option key={s}>{s}</option>)}
              </Select>
            </div>
          </div>

          {/* Section: Record */}
          <div>
            <p className="text-xs font-bold text-ink-400 dark:text-gray-500 uppercase tracking-wide mb-3">Record</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Record Status" name="status" value={form.status} onChange={handleChange} error={formAttempted ? fieldErrors.status : undefined}>
                <option>Active</option><option>Inactive</option>
              </Select>
              <Input label="Notes" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes" error={formAttempted ? fieldErrors.notes : undefined}/>
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

      <Modal isOpen={preferencesOpen} onClose={()=>setPreferencesOpen(false)} title="Columns & density">
        <label className="flex items-center gap-2 text-sm mb-4"><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/> Compact rows</label>
        <p className="text-xs text-ink-500 dark:text-gray-400 mb-3">Asset identity and actions stay visible. Choose other columns and their order.</p>
        {[...columns,...optionalAssetColumns.map(c=>c[0]).filter(k=>!columns.includes(k))].map(key=><div key={key} className="flex items-center justify-between gap-3 py-2 border-b border-cream-200 dark:border-gray-700"><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={columns.includes(key)} onChange={e=>setColumns(c=>e.target.checked?[...c,key]:c.filter(k=>k!==key))}/>{optionalAssetColumns.find(c=>c[0]===key)?.[1]}</label>{columns.includes(key)&&<div className="flex gap-2"><button aria-label={'Move '+key+' up'} disabled={columns.indexOf(key)===0} onClick={()=>moveColumn(key,-1)} className="p-2 disabled:opacity-30">↑</button><button aria-label={'Move '+key+' down'} disabled={columns.indexOf(key)===columns.length-1} onClick={()=>moveColumn(key,1)} className="p-2 disabled:opacity-30">↓</button></div>}</div>)}
      </Modal>
      <Modal isOpen={viewOpen} onClose={()=>setViewOpen(false)} title="Save asset view">
        <label htmlFor="asset-view-name" className="text-sm">View name</label><input id="asset-view-name" autoFocus maxLength={50} className="input-field mt-2" value={viewName} onChange={e=>setViewName(e.target.value)} placeholder="e.g. Hyderabad laptops"/>
        <p className="text-xs text-ink-500 dark:text-gray-400 my-3">Saved in this browser for your account. Saving an existing name replaces that view.</p>
        <Button onClick={saveView}>Save view</Button>
        {views.map(v=><div key={v.name} className="flex justify-between items-center py-2 text-sm"><span>{v.name}</span><button aria-label={'Remove saved view '+v.name} onClick={()=>setViews(list=>list.filter(x=>x.name!==v.name))} className="text-red-500 p-2">Remove</button></div>)}
      </Modal>
      {/* ── Scan Asset Modal ───────────────────────────────────── */}
      {isScanModalOpen && <Suspense fallback={<PageState label="Loading scanner…"/>}><ScanAssetModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onOpenPrintLabel={assets => {
          setSelectedForPrint(assets)
          setIsPrintModalOpen(true)
        }}
        onOpenCreateAsset={handleOpenCreateFromScan}
      /></Suspense>}

      {/* ── Print Labels Modal ──────────────────────────────────── */}
      {isPrintModalOpen && <Suspense fallback={<PageState label="Loading labels…"/>}><PrintLabelsModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        initialAssets={selectedForPrint}
      /></Suspense>}

    </div>
  )
}


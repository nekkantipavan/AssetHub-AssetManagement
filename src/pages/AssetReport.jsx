import { useState, useEffect, useMemo } from 'react'
import { Search, Download, X, FileSpreadsheet, Box } from 'lucide-react'
import useReport from '../hooks/useReport'
import useDebounced from '../hooks/useDebounced'
import PageState from '../components/common/PageState'
import { getAssetReport, getPlants, getDepartments, getAssetFilterOptions } from '../data/api'
import Pagination from '../components/common/Pagination'

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const fmtDate = v => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN')
}

const STATUS_STYLE = {
  Active:        'bg-emerald-50 text-emerald-700',
  Inactive:      'bg-gray-100 text-gray-500',
  'In Transfer': 'bg-orange-50 text-orange-700',
  'In Transit':  'bg-blue-50 text-blue-700',
}

export default function AssetReport() {
  const [plants,  setPlants]  = useState([])
  const [depts,   setDepts]   = useState([])
  const [categoryOptions, setCategories] = useState(['All'])

  const [search,      setSearch]      = useState('')
  const [filterPlant, setFilterPlant] = useState('All')
  const [filterCat,   setFilterCat]   = useState('All')
  const [filterDept,  setFilterDept]  = useState('All')
  const [filterStatus,setFilterStatus]= useState('All')

  const debouncedSearch=useDebounced(search)
  const filters={search:debouncedSearch,plant:filterPlant==='All'?'':filterPlant,category:filterCat==='All'?'':filterCat,department:filterDept==='All'?'':filterDept,status:filterStatus==='All'?'':filterStatus}
  const report=useReport(getAssetReport,filters,'assets')
  const {data:assets,total:totalRecords,loading,error,currentPage:validCurrentPage,pageSize,setCurrentPage,setPageSize,summary}=report
  const displayedAssets=assets
  const totalPages=Math.max(1,Math.ceil(totalRecords/pageSize))
  useEffect(()=>{Promise.all([getPlants(),getDepartments(),getAssetFilterOptions()]).then(([p,d,f])=>{
    setPlants(p.data);setDepts(d.data);setCategories(['All',...f.data.categories])
  }).catch(()=>{})},[])
  const plantOptions=['All',...new Set(plants.map(p=>p.name))]
  const deptOptions=['All',...new Set(depts.map(d=>d.name))]
  const statusOptions=['All','Active','Inactive','Pending Transfer','In Transfer','In Transit']

  const hasFilter = search || filterPlant !== 'All' || filterCat !== 'All' || filterDept !== 'All' || filterStatus !== 'All'

  function clearFilters() {
    setSearch(''); setFilterPlant('All'); setFilterCat('All'); setFilterDept('All'); setFilterStatus('All')
  }

  const {exportExcel}=report
  const total=summary.total||0,active=summary.active||0,inTransfer=summary.in_transfer||0,inactive=summary.inactive||0

  return (
    <div className="space-y-5" aria-busy={loading}>
      {error && <PageState error={error} onRetry={report.retry}/>}
      {loading && <p role="status" className="text-sm text-brand-600">Loading report…</p>}
      {report.exportError && <p role="alert" className="text-red-600">{report.exportError}</p>}
      {report.exporting && <div role="status" className="text-sm">Preparing Excel for the selected filters… <button onClick={report.cancelExport} className="text-brand-600 underline">Cancel export</button></div>}
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900 dark:text-gray-100">Asset Log Report</h2>
          <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Complete asset inventory with filters and Excel export</p>
        </div>
        <button
          onClick={exportExcel}
          disabled={loading || report.exporting || !totalRecords}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-soft transition-colors"
        >
          <FileSpreadsheet size={16} />
          {report.exporting ? 'Preparing Excel…' : `Export Excel (${totalRecords})`}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Assets',  value: total,      color: 'bg-orange-gradient text-white' },
          { label: 'Active',        value: active,     color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
          { label: 'In Transfer',   value: inTransfer, color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
          { label: 'Inactive',      value: inactive,   color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-3xl p-5 shadow-card ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters with Explicit Headings */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
        <div className="flex flex-wrap items-end gap-3.5">
          
          {/* Search Input with Heading */}
          <div className="flex-1 min-w-[220px] flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-gray-400 flex items-center gap-1">
              <Search size={12} className="text-brand-500"/> Search Records
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, asset code, serial, employee…"
                className="pl-9 pr-4 py-2.5 bg-cream-100 dark:bg-gray-700 rounded-2xl text-xs placeholder-ink-300 dark:placeholder-gray-500 text-ink-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 border border-cream-200 dark:border-gray-650 w-full"
              />
            </div>
          </div>

          {/* Plant Dropdown with Heading */}
          <div className="flex flex-col gap-1.5 min-w-[160px] max-w-[240px] flex-1 sm:flex-initial">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-gray-400">
              Plant / Business Area
            </label>
            <select
              value={filterPlant}
              onChange={e => setFilterPlant(e.target.value)}
              className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-xs text-ink-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 border border-cream-200 dark:border-gray-650 truncate"
            >
              <option value="All">All Plants</option>
              {plantOptions.filter(o => o !== 'All').map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Category Dropdown with Heading */}
          <div className="flex flex-col gap-1.5 min-w-[140px] flex-1 sm:flex-initial">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-gray-400">
              Category
            </label>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-xs text-ink-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 border border-cream-200 dark:border-gray-650 truncate"
            >
              <option value="All">All Categories</option>
              {categoryOptions.filter(o => o !== 'All').map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Department Dropdown with Heading */}
          <div className="flex flex-col gap-1.5 min-w-[150px] flex-1 sm:flex-initial">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-gray-400">
              Department
            </label>
            <select
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-xs text-ink-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 border border-cream-200 dark:border-gray-650 truncate"
            >
              <option value="All">All Departments</option>
              {deptOptions.filter(o => o !== 'All').map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Status Dropdown with Heading */}
          <div className="flex flex-col gap-1.5 min-w-[130px] flex-1 sm:flex-initial">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-gray-400">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-xs text-ink-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 border border-cream-200 dark:border-gray-650"
            >
              <option value="All">All Statuses</option>
              {statusOptions.filter(o => o !== 'All').map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasFilter && (
            <div className="flex flex-col justify-end pb-1">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline px-2.5 py-2 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
              >
                <X size={13} /> Clear
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Asset Inventory</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">
              {totalRecords > 0
                ? `Showing ${((validCurrentPage - 1) * pageSize) + 1}–${Math.min(validCurrentPage * pageSize, totalRecords)} of ${totalRecords} matching records (Page ${validCurrentPage} of ${totalPages})`
                : '0 records'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[2800px]">
            <thead>
              <tr className="border-b border-cream-200 dark:border-gray-700 bg-cream-50 dark:bg-gray-750">
                {[
                  'Asset Code', 'Sub Asset Code', 'Asset Description', 'Category', 'Asset Class',
                  'Company Code', 'Cost Center', 'Cost Center Desc.', 'Serial No.',
                  'Manufacturer', 'Acq. Value', 'Plant', 'Department', 'Assigned To',
                  'Asset Status', 'Record Status', 'Capitalized On', 'Warranty Date',
                  'Supplier', 'Notes', 'Created', 'Last Updated'
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedAssets.map((a, idx) => (
                <tr key={a.id} className={`border-b border-cream-100 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-750 transition-colors ${idx % 2 === 1 ? 'bg-cream-50/40' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-brand-600 font-bold text-xs font-mono">{a.asset_code}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs text-ink-500 dark:text-gray-400">{a.sub_asset_code || `${a.asset_code} ${a.sub_sequence ?? 0}`}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="block truncate font-medium text-sm text-ink-900 dark:text-gray-100">{a.name}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 px-2 py-1 rounded-lg">{a.category || '—'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500 dark:text-gray-400">{a.asset_class || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500 dark:text-gray-400">{a.company_code || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500 dark:text-gray-400">{a.cost_center || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400 dark:text-gray-500 max-w-[160px]">
                    <span className="block truncate">{a.cost_center_description || '—'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs text-ink-400">{a.serial_number || '—'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500 dark:text-gray-400">{a.make || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-ink-700 dark:text-gray-200">
                    {formatINR(a.acquisition_value)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500 dark:text-gray-400">{a.plant_name || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-ink-600 dark:text-gray-300">{a.dept_name || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-ink-600 dark:text-gray-300">
                    {a.assigned_employee || a.employee_name || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs px-2 py-1 rounded-lg font-medium bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300">
                      {a.asset_status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2.5 py-1 rounded-xl font-semibold ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-500'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400">{fmtDate(a.date_of_purchase)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400">{fmtDate(a.warranty_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500 dark:text-gray-400">{a.supplier_name || '—'}</td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="block truncate text-xs text-ink-400 dark:text-gray-500">{a.notes || '—'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400">{fmtDate(a.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400">{fmtDate(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && !error && totalRecords === 0 && (
          <div className="py-16 text-center text-ink-300 dark:text-gray-500">
            <Box size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{assets.length === 0 ? 'No assets found.' : 'No assets match the selected filters.'}</p>
          </div>
        )}
      </div>

      {/* Pagination Controls with 50 Multiplier Options */}
      {totalRecords > 0 && (
        <Pagination
          totalItems={totalRecords}
          currentPage={validCurrentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1) }}
          pageSizeOptions={[50, 100, 150, 200, 250, 500]}
        />
      )}
    </div>
  )
}


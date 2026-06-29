import { useState, useEffect, useMemo } from 'react'
import { Search, Download, X, FileSpreadsheet, Box } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getAssetReport, getPlants, getDepartments } from '../data/api'

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const fmtDate = v => v ? new Date(v).toLocaleDateString('en-IN') : '—'

const STATUS_STYLE = {
  Active:        'bg-emerald-50 text-emerald-700',
  Inactive:      'bg-gray-100 text-gray-500',
  'In Transfer': 'bg-orange-50 text-orange-700',
  'In Transit':  'bg-blue-50 text-blue-700',
}

export default function AssetReport() {
  const [assets,  setAssets]  = useState([])
  const [plants,  setPlants]  = useState([])
  const [depts,   setDepts]   = useState([])
  const [loading, setLoading] = useState(true)

  const [search,      setSearch]      = useState('')
  const [filterPlant, setFilterPlant] = useState('All')
  const [filterCat,   setFilterCat]   = useState('All')
  const [filterDept,  setFilterDept]  = useState('All')
  const [filterStatus,setFilterStatus]= useState('All')

  useEffect(() => {
    Promise.all([getAssetReport(), getPlants(), getDepartments()])
      .then(([a, p, d]) => {
        setAssets(a.data)
        setPlants(p.data)
        setDepts(d.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const plantOptions    = ['All', ...plants.map(p => p.name)]
  const categoryOptions = ['All', ...new Set(assets.map(a => a.category).filter(Boolean))]
  const deptOptions     = ['All', ...depts.map(d => d.name)]
  const statusOptions   = ['All', 'Active', 'Inactive', 'In Transfer', 'In Transit']

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return assets.filter(a => {
      const matchSearch = !q ||
        a.name?.toLowerCase().includes(q) ||
        a.asset_code?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.assigned_employee?.toLowerCase().includes(q) ||
        a.employee_name?.toLowerCase().includes(q)
      return matchSearch &&
        (filterPlant  === 'All' || a.plant_name === filterPlant) &&
        (filterCat    === 'All' || a.category   === filterCat) &&
        (filterDept   === 'All' || a.dept_name  === filterDept) &&
        (filterStatus === 'All' || a.status     === filterStatus)
    })
  }, [assets, search, filterPlant, filterCat, filterDept, filterStatus])

  const hasFilter = search || filterPlant !== 'All' || filterCat !== 'All' || filterDept !== 'All' || filterStatus !== 'All'

  function clearFilters() {
    setSearch(''); setFilterPlant('All'); setFilterCat('All'); setFilterDept('All'); setFilterStatus('All')
  }

  function exportExcel() {
    const rows = filtered.map(a => ({
      'Asset Code':              a.asset_code || '',
      'Sub Asset Code':          `${a.asset_code || ''} ${a.sub_sequence ?? 0}`,
      'Asset Description':       a.name || '',
      'Category':                a.category || '',
      'Asset Class':             a.asset_class || '',
      'Company Code':            a.company_code || '',
      'Cost Center':             a.cost_center || '',
      'Cost Center Desc.':       a.cost_center_description || '',
      'Serial Number':           a.serial_number || '',
      'Manufacturer':            a.make || '',
      'Acquisition Value':       a.acquisition_value != null ? Number(a.acquisition_value) : '',
      'Plant':                   a.plant_name || '',
      'Department':              a.dept_name || '',
      'Assigned Employee':       a.assigned_employee || a.employee_name || '',
      'Asset Status':            a.asset_status || '',
      'Record Status':           a.status || '',
      'Capitalized On':          fmtDate(a.date_of_purchase),
      'Warranty Date':           fmtDate(a.warranty_date),
      'Supplier':                a.supplier_name || '',
      'Notes':                   a.notes || '',
      'Created Date':            fmtDate(a.created_at),
      'Last Updated':            fmtDate(a.updated_at),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 22 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 24 },
      { wch: 14 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Asset Report')
    XLSX.writeFile(wb, `asset-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Summary counts
  const total      = assets.length
  const active     = assets.filter(a => a.status === 'Active').length
  const inTransfer = assets.filter(a => a.status === 'In Transfer' || a.status === 'In Transit').length
  const inactive   = assets.filter(a => a.status === 'Inactive').length

  if (loading) return <div className="py-20 text-center text-sm text-ink-400">Loading asset report…</div>

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900 dark:text-gray-100">Asset Log Report</h2>
          <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Complete asset inventory with filters and Excel export</p>
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-soft transition-colors"
        >
          <FileSpreadsheet size={16} />
          Export Excel ({filtered.length})
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-4">
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

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, asset code, serial, employee…"
              className="pl-9 pr-4 py-2.5 bg-cream-100 dark:bg-gray-700 rounded-2xl text-sm placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 w-full"
            />
          </div>

          {[
            { label: 'Plant',      value: filterPlant,  onChange: setFilterPlant,  options: plantOptions    },
            { label: 'Category',   value: filterCat,    onChange: setFilterCat,    options: categoryOptions },
            { label: 'Department', value: filterDept,   onChange: setFilterDept,   options: deptOptions     },
            { label: 'Status',     value: filterStatus, onChange: setFilterStatus, options: statusOptions   },
          ].map(f => (
            <select
              key={f.label}
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
              className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-sm text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 border-0"
            >
              {f.options.map(o => <option key={o}>{o}</option>)}
            </select>
          ))}

          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Asset Inventory</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">{filtered.length} of {assets.length} records</p>
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
              {filtered.map((a, idx) => (
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

        {filtered.length === 0 && (
          <div className="py-16 text-center text-ink-300 dark:text-gray-500">
            <Box size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{assets.length === 0 ? 'No assets found.' : 'No assets match the selected filters.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { Search, Download, X, FileSpreadsheet, ArrowLeftRight, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getTransferReport } from '../data/api'

const fmtDate  = v => v ? new Date(v).toLocaleDateString('en-IN') : '—'
const fmtDT    = v => v ? new Date(v).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
const formatINR = v => v == null || v === '' ? '—' : Number(v).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })

const STATUS_STYLE = {
  'Pending Approval':    'bg-amber-50 text-amber-700 border border-amber-200',
  'In Transit':          'bg-blue-50 text-blue-700 border border-blue-200',
  'Partially Returned':  'bg-purple-50 text-purple-700 border border-purple-200',
  'Completed':           'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'Rejected':            'bg-red-50 text-red-700 border border-red-200',
}

const TYPE_STYLE = {
  'Returnable':     'bg-teal-50 text-teal-700 border border-teal-200',
  'Non-Returnable': 'bg-orange-50 text-orange-700 border border-orange-200',
}

const RETURN_STATUS_STYLE = {
  'Pending': 'bg-amber-50 text-amber-700',
  'Approved':'bg-emerald-50 text-emerald-700',
  'Rejected':'bg-red-50 text-red-700',
}

function TransferRow({ t }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        className={`border-b border-cream-100 dark:border-gray-700 cursor-pointer transition-colors ${open ? 'bg-cream-50' : 'hover:bg-cream-50/60 dark:hover:bg-gray-750'}`}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown size={13} className="text-brand-500" /> : <ChevronRight size={13} className="text-ink-300" />}
            <span className="text-brand-600 font-bold text-xs font-mono">{t.transfer_code}</span>
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold ${TYPE_STYLE[t.transfer_type] || 'bg-gray-100 text-gray-600'}`}>
            {t.transfer_type}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-ink-600 dark:text-gray-300">
          {t.from_plant_name || '—'} <span className="text-ink-300 mx-1">→</span> {t.to_plant_name || '—'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <span className="text-sm font-bold text-ink-700 dark:text-gray-200">{t.asset_count}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold ${STATUS_STYLE[t.status] || 'bg-gray-100 text-gray-600'}`}>
            {t.status}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-ink-600 dark:text-gray-300">{t.initiated_by_name || '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400 dark:text-gray-400">{fmtDate(t.created_at)}</td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-400 dark:text-gray-400">{fmtDate(t.expected_return_date)}</td>
        <td className="px-4 py-3 whitespace-nowrap text-center">
          {t.return_count > 0
            ? <span className="flex items-center gap-1 text-xs font-semibold text-teal-600"><RotateCcw size={11}/>{t.return_count}</span>
            : <span className="text-xs text-ink-300">—</span>
          }
        </td>
      </tr>

      {open && (
        <tr className="bg-cream-50/80 dark:bg-gray-750 border-b border-cream-200 dark:border-gray-700">
          <td colSpan={9} className="px-6 pb-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              {/* Assets in transfer */}
              <div>
                <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2">Assets in Transfer ({t.items.length})</p>
                <div className="rounded-2xl border border-cream-200 dark:border-gray-600 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-cream-100 dark:bg-gray-700">
                        <th className="px-3 py-2 text-left font-semibold text-ink-400 uppercase tracking-wide">Asset ID</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-400 uppercase tracking-wide">Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-400 uppercase tracking-wide">Category</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-400 uppercase tracking-wide">Value</th>
                        <th className="px-3 py-2 text-left font-semibold text-ink-400 uppercase tracking-wide">Dept</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.items.map((item, i) => (
                        <tr key={i} className="border-t border-cream-100 dark:border-gray-600">
                          <td className="px-3 py-1.5 font-mono text-brand-600 font-semibold">{item.asset_tag}</td>
                          <td className="px-3 py-1.5 text-ink-700 dark:text-gray-200">{item.name}</td>
                          <td className="px-3 py-1.5 text-ink-500">{item.category || '—'}</td>
                          <td className="px-3 py-1.5 text-ink-700 font-semibold">{formatINR(item.value)}</td>
                          <td className="px-3 py-1.5 text-ink-500">{item.dept_name || '—'}</td>
                        </tr>
                      ))}
                      {t.items.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-3 text-center text-ink-300">No assets</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Return history */}
              <div>
                <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2">Return History ({t.returns.length})</p>
                {t.returns.length === 0 ? (
                  <div className="rounded-2xl border border-cream-200 dark:border-gray-600 px-4 py-6 text-center text-xs text-ink-300">No returns yet</div>
                ) : (
                  <div className="space-y-2">
                    {t.returns.map((r, i) => (
                      <div key={i} className="rounded-2xl border border-cream-200 dark:border-gray-600 px-4 py-3 bg-white dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold text-ink-700 dark:text-gray-200">{r.return_code}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${RETURN_STATUS_STYLE[r.approval_status] || 'bg-gray-100 text-gray-500'}`}>
                            {r.approval_status || r.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-xs text-ink-500 dark:text-gray-400">
                          <span>Returned: {fmtDate(r.return_date)}</span>
                          <span>Assets: {r.returned_asset_count}</span>
                          <span>By: {r.returned_by || '—'}</span>
                          {r.approved_at && <span>Approved: {fmtDate(r.approved_at)}</span>}
                        </div>
                        {r.notes && <p className="text-xs text-ink-400 mt-1 italic">{r.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function TransferReport() {
  const [transfers, setTransfers] = useState([])
  const [loading,   setLoading]   = useState(true)

  const [search,      setSearch]      = useState('')
  const [filterType,  setFilterType]  = useState('All')
  const [filterStatus,setFilterStatus]= useState('All')
  const [dateFrom,    setDateFrom]    = useState('')

  useEffect(() => {
    getTransferReport()
      .then(r => { setTransfers(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const typeOptions   = ['All', 'Returnable', 'Non-Returnable']
  const statusOptions = ['All', 'Pending Approval', 'In Transit', 'Partially Returned', 'Completed', 'Rejected']

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return transfers.filter(t => {
      const matchSearch = !q ||
        t.transfer_code?.toLowerCase().includes(q) ||
        t.from_plant_name?.toLowerCase().includes(q) ||
        t.to_plant_name?.toLowerCase().includes(q) ||
        t.initiated_by_name?.toLowerCase().includes(q)
      const matchDate = !dateFrom || new Date(t.created_at) >= new Date(dateFrom)
      return matchSearch &&
        (filterType   === 'All' || t.transfer_type === filterType) &&
        (filterStatus === 'All' || t.status        === filterStatus) &&
        matchDate
    })
  }, [transfers, search, filterType, filterStatus, dateFrom])

  const hasFilter = search || filterType !== 'All' || filterStatus !== 'All' || dateFrom

  function clearFilters() {
    setSearch(''); setFilterType('All'); setFilterStatus('All'); setDateFrom('')
  }

  function exportExcel() {
    // Sheet 1: Transfers
    const transferRows = filtered.map(t => ({
      'Transfer Code':       t.transfer_code,
      'Type':                t.transfer_type,
      'From Plant':          t.from_plant_name || '',
      'To Plant':            t.to_plant_name || '',
      'Asset Count':         t.asset_count,
      'Status':              t.status,
      'Initiated By':        t.initiated_by_name || '',
      'Created Date':        fmtDate(t.created_at),
      'Expected Return':     fmtDate(t.expected_return_date),
      'Approved By':         t.approved_by_name || '',
      'Approved At':         fmtDate(t.approved_at),
      'Return Count':        t.return_count,
      'Notes':               t.notes || '',
    }))

    // Sheet 2: Transfer Assets (flat)
    const assetRows = []
    filtered.forEach(t => {
      t.items.forEach(item => {
        assetRows.push({
          'Transfer Code': t.transfer_code,
          'Transfer Type': t.transfer_type,
          'Transfer Status': t.status,
          'From Plant':    t.from_plant_name || '',
          'To Plant':      t.to_plant_name || '',
          'Asset ID':      item.asset_tag,
          'Asset Name':    item.name,
          'Category':      item.category || '',
          'Asset Class':   item.asset_class || '',
          'Serial No.':    item.serial || '',
          'Value (₹)':     item.value != null ? Number(item.value) : '',
          'Department':    item.dept_name || '',
          'Assigned To':   item.assigned_employee || '',
          'Transfer Date': fmtDate(t.created_at),
        })
      })
    })

    // Sheet 3: Returns (flat)
    const returnRows = []
    filtered.forEach(t => {
      t.returns.forEach(r => {
        returnRows.push({
          'Transfer Code':   t.transfer_code,
          'Transfer Type':   t.transfer_type,
          'From Plant':      t.from_plant_name || '',
          'To Plant':        t.to_plant_name || '',
          'Return Code':     r.return_code,
          'Return Date':     fmtDate(r.return_date),
          'Returned By':     r.returned_by || '',
          'Assets Returned': r.returned_asset_count,
          'Approval Status': r.approval_status || r.status || '',
          'Approved By':     r.approved_by_name || '',
          'Approved At':     fmtDate(r.approved_at),
          'Notes':           r.notes || '',
        })
      })
    })

    const wb = XLSX.utils.book_new()

    const ws1 = XLSX.utils.json_to_sheet(transferRows)
    ws1['!cols'] = [{ wch:16 },{ wch:16 },{ wch:18 },{ wch:18 },{ wch:10 },{ wch:18 },{ wch:18 },{ wch:14 },{ wch:16 },{ wch:18 },{ wch:14 },{ wch:12 },{ wch:24 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Transfers')

    if (assetRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(assetRows)
      ws2['!cols'] = [{ wch:16 },{ wch:16 },{ wch:18 },{ wch:18 },{ wch:18 },{ wch:14 },{ wch:28 },{ wch:14 },{ wch:14 },{ wch:18 },{ wch:12 },{ wch:18 },{ wch:22 },{ wch:14 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Transfer Assets')
    }

    if (returnRows.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(returnRows)
      ws3['!cols'] = [{ wch:16 },{ wch:16 },{ wch:18 },{ wch:18 },{ wch:16 },{ wch:14 },{ wch:18 },{ wch:14 },{ wch:16 },{ wch:18 },{ wch:14 },{ wch:24 }]
      XLSX.utils.book_append_sheet(wb, ws3, 'Returns')
    }

    XLSX.writeFile(wb, `transfer-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Summary
  const totalTransfers    = transfers.length
  const returnable        = transfers.filter(t => t.transfer_type === 'Returnable').length
  const nonReturnable     = transfers.filter(t => t.transfer_type === 'Non-Returnable').length
  const totalReturns      = transfers.reduce((s, t) => s + t.return_count, 0)

  if (loading) return <div className="py-20 text-center text-sm text-ink-400">Loading transfer report…</div>

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900 dark:text-gray-100">Transfer Report</h2>
          <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">All transfer records with assets and return details — click any row to expand</p>
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
          { label: 'Total Transfers',   value: totalTransfers, color: 'bg-orange-gradient text-white' },
          { label: 'Returnable',        value: returnable,     color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
          { label: 'Non-Returnable',    value: nonReturnable,  color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
          { label: 'Returns Made',      value: totalReturns,   color: 'bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700' },
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
              placeholder="Search by transfer code, plant, initiated by…"
              className="pl-9 pr-4 py-2.5 bg-cream-100 dark:bg-gray-700 rounded-2xl text-sm placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 w-full"
            />
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-sm text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 border-0"
          >
            {typeOptions.map(o => <option key={o}>{o}</option>)}
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-sm text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 border-0"
          >
            {statusOptions.map(o => <option key={o}>{o}</option>)}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-cream-100 dark:bg-gray-700 rounded-2xl px-3 py-2.5 text-sm text-ink-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300 border-0"
          />

          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Transfer Records</h3>
          <p className="text-xs text-ink-300 dark:text-gray-400 mt-0.5">{filtered.length} of {transfers.length} transfers — click a row to see asset and return details</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-cream-200 dark:border-gray-700 bg-cream-50 dark:bg-gray-750">
                {['Transfer Code','Type','From → To','Assets','Status','Initiated By','Date','Exp. Return','Returns'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => <TransferRow key={t.id} t={t} />)}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-ink-300 dark:text-gray-500">
            <ArrowLeftRight size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{transfers.length === 0 ? 'No transfers found.' : 'No transfers match the selected filters.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, RefreshCw, FileSpreadsheet, CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp, X } from 'lucide-react'
import Button from '../components/common/Button'
import { bulkUpload, getMastersLookup } from '../data/api'
import { fields, reportColumns } from '../data/assetWorkbook'

const panel = 'bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6 space-y-4 text-ink-700 dark:text-gray-200'
const tableClass = 'w-full text-xs text-left [&_th]:px-4 [&_th]:py-3 [&_th]:bg-cream-100 dark:[&_th]:bg-gray-700 [&_th]:text-ink-500 dark:[&_th]:text-gray-300 [&_td]:px-4 [&_td]:py-3'

export default function BulkUpload() {
  const [mode, setMode] = useState('update')
  const [rows, setRows] = useState([])
  const [filename, setFilename] = useState('')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef()
  const helpDialog = useRef()
  const [showHelp, setShowHelp] = useState(false)
  useEffect(() => {
    if (showHelp) helpDialog.current?.showModal()
    else helpDialog.current?.close()
  }, [showHelp])
  const [masters, setMasters] = useState({ plants: [], departments: [] })
  const [showMastersRef, setShowMastersRef] = useState(false)
  useEffect(() => { getMastersLookup().then(r => setMasters(r.data)).catch(() => {}) }, [])

  function reset() {
    setRows([]); setFilename(''); setPreview(null); setResult(null); setError('')
    if (input.current) input.current.value = ''
  }

  function download(data, name, headers) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data, headers ? { header: headers } : {})
    ws['!cols'] = (headers || Object.keys(data[0] || {})).map(h => ({ wch: Math.max(20, h.length + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Assets')
    XLSX.writeFile(wb, name)
  }

  async function validate(data = rows, selectedMode = mode) {
    setBusy(true); setError(''); setResult(null); setPreview(null)
    try {
      const response = await bulkUpload({ rows: data, mode: selectedMode, action: 'preview' })
      setPreview(response.data)
    } catch (err) { setError(err.response?.data?.error || 'Could not validate this file.') }
    finally { setBusy(false) }
  }

  async function processFile(file) {
    if (!file) return
    setPreview(null); setResult(null); setError(''); setRows([]); setFilename('')
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('Choose an .xlsx, .xls or .csv file.'); return }
    setBusy(true)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // Standardize actual Excel date cells before converting to strings.
      for (const [address, cell] of Object.entries(ws)) {
        if (!address.startsWith('!') && cell.t === 'd') {
          const d = cell.v
          cell.t = 's'
          cell.v = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
          delete cell.w
        }
      }
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      const headers = (matrix[0] || []).map(h => String(h).trim())
      const names = headers.map(h => h.toLowerCase()).filter(Boolean)
      if (new Set(names).size !== names.length) throw Error('Duplicate column headers; keep one column per field.')
      const codeIndex = headers.findIndex(h => h.toLowerCase() === 'asset code')
      const data = matrix.slice(1).filter(cells => cells.some(v => String(v).trim())).filter(cells => !['* Required', '(optional)', 'AST-SAMPLE'].includes(String(cells[codeIndex] || '').trim())).map((cells, i) => {
        const row = Object.fromEntries(headers.flatMap((h, j) => h ? [[h, String(cells[j] ?? '').trim()]] : []))
        return row
      })
      if (!data.length || data.length > 5000) throw Error('Choose a file with 1 to 5,000 asset rows on the first worksheet.')
      setFilename(file.name); setRows(data)
      await validate(data)
    } catch (err) { setError(err.message || 'Could not read this spreadsheet.') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }

  async function apply() {
    setBusy(true); setError('')
    try {
      const response = await bulkUpload({ rows, mode, action: 'apply', previewToken: preview.previewToken })
      setResult(response.data); setPreview(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Nothing saved. Validate again before retrying.')
      setPreview(null)
    } finally { setBusy(false) }
  }

  const ignored = rows.length ? Object.keys(rows[0]).filter(h => !fields.some(f => h.toLowerCase() === f.col.toLowerCase() || f.aliases.includes(h.toLowerCase()))) : []
  const step = result ? 2 : filename ? 1 : 0
  const steps = ['Select File', 'Preview & Validate', 'Import']
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
        <div className="flex items-center">
          {steps.map((label, i) => <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-300 ${i < step ? 'bg-green-500 text-white shadow-soft' : i === step ? 'bg-orange-gradient text-white shadow-soft' : 'bg-cream-200 dark:bg-gray-700 text-ink-300 dark:text-gray-400'}`}>
                {i < step ? <CheckCircle size={16}/> : i + 1}
              </div>
              <p className={`text-xs mt-1.5 font-medium ${i <= step ? 'text-ink-700 dark:text-gray-200' : 'text-ink-300 dark:text-gray-500'}`}>{label}</p>
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-2 rounded-full ${i < step ? 'bg-green-400' : 'bg-cream-200 dark:bg-gray-700'}`}/>}
          </div>)}
        </div>
      </div>

      <div className="bg-orange-soft dark:bg-gray-800 rounded-3xl p-5 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-100 flex items-center justify-center"><FileSpreadsheet size={20} className="text-brand-600"/></div>
          <div><p className="text-sm font-bold text-ink-900 dark:text-gray-100">Download Template</p><p className="text-xs text-ink-500 dark:text-gray-400">Excel template with all required columns</p></div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => download([], 'AssetMaster_Import_Template.xlsx', fields.map(f => f.col))}><Download size={14}/> Template.xlsx</Button>
      </div>

      <div className={panel}>
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2"><label className="text-sm font-bold text-ink-900 dark:text-gray-100" htmlFor="bulk-mode">Import mode</label><button type="button" aria-label="How It Works" title="How It Works" aria-haspopup="dialog" aria-controls="bulk-upload-help" onClick={() => setShowHelp(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"><Info size={18}/></button></div><a className="text-xs font-semibold text-brand-600 hover:underline" href="/reports/assets">Export Asset Report</a></div>
        <select id="bulk-mode" className="w-full border border-cream-300 dark:border-gray-600 rounded-2xl px-4 py-3 bg-cream-50 dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setPreview(null); setResult(null); setError('') }}>
          <option value="update">Update existing (default)</option><option value="create">Create new</option><option value="upsert">Create and update</option>
        </select>
        <p className="text-xs text-ink-400 dark:text-gray-400">Match by Asset Code + Sub Asset Number. Review changes before saving.</p>
      </div>

      <input id="bulk-file" ref={input} type="file" accept=".xlsx,.xls,.csv" disabled={busy} className="sr-only" onChange={e => processFile(e.target.files?.[0])}/>
      {!filename && <label htmlFor="bulk-file" role="button" aria-disabled={busy} tabIndex={busy ? -1 : 0} onKeyDown={e => { if (!busy && ['Enter', ' '].includes(e.key)) { e.preventDefault(); input.current?.click() } }} onDrop={e => { e.preventDefault(); if (!busy) processFile(e.dataTransfer.files?.[0]) }} onDragOver={e => e.preventDefault()} className="block bg-white dark:bg-gray-800 rounded-3xl shadow-card p-12 text-center cursor-pointer border-2 border-dashed border-cream-300 dark:border-gray-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-gray-700 transition-all">
        <div className="w-16 h-16 rounded-3xl bg-cream-200 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4"><Upload size={28} className="text-ink-300 dark:text-gray-400"/></div>
        <p className="font-bold text-ink-900 dark:text-gray-100 text-lg">Drop your file here</p><p className="text-sm text-ink-400 dark:text-gray-400 mt-1">or click to browse · .xlsx, .xls, .csv supported</p><p className="text-xs text-ink-300 dark:text-gray-500 mt-2">Your own Excel is fine — columns are detected automatically · Up to 5,000 rows</p>
      </label>}

      {filename && <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-orange-gradient flex items-center justify-center shadow-soft flex-shrink-0"><FileSpreadsheet size={22} className="text-white"/></div>
        <div className="flex-1 min-w-0"><p className="font-bold text-ink-900 dark:text-gray-100 truncate">{filename}</p><p className="text-xs text-ink-400 dark:text-gray-400">{rows.length} data rows detected · First worksheet</p></div>
        <button disabled={busy} onClick={reset} aria-label="Choose different file" className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400"><X size={16}/></button>
      </div>}
      {busy && <div className={panel} role="status"><div className="w-10 h-10 rounded-full border-4 border-cream-200 border-t-brand-500 animate-spin mx-auto"/><p className="text-center text-sm font-semibold">Processing…</p></div>}
      {error && <div role="alert" className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-red-600 dark:text-red-400 text-sm flex gap-2"><AlertCircle size={16} className="flex-shrink-0"/>{error}</div>}
      {filename && !result && <div className="flex justify-between items-center"><button disabled={busy} onClick={reset} className="text-sm text-ink-400 dark:text-gray-400 hover:text-ink-700 flex items-center gap-1.5"><RefreshCw size={14}/> Choose different file</button><Button variant="secondary" disabled={busy} onClick={() => validate()}>Validate again</Button></div>}
      {/* ── Masters reference (collapsed by default) ─────────── */}
      {masters.plants.length > 0 && !filename && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
          <button
            onClick={() => setShowMastersRef(v => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-cream-50 dark:hover:bg-gray-750 transition-colors"
          >
            <Info size={14} className="text-brand-500 flex-shrink-0"/>
            <p className="text-xs font-bold text-ink-700 dark:text-gray-200 uppercase tracking-wide flex-1">Use These Exact Values in Your File</p>
            {showMastersRef ? <ChevronUp size={16} className="text-ink-400"/> : <ChevronDown size={16} className="text-ink-400"/>}
          </button>
          {showMastersRef && (
            <div className="px-5 pb-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-ink-500 dark:text-gray-400 mb-2">
                  Business Area (Plant Codes) <span className="text-ink-300 dark:text-gray-500 font-normal">· {masters.plants.length}</span>
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {masters.plants.map(p => (
                    <span key={p.id}
                      className="inline-flex items-center gap-1.5 text-xs bg-cream-100 dark:bg-gray-700 px-2 py-1 rounded-lg"
                      title={p.name}>
                      <span className="font-mono text-brand-600 font-bold">{p.code}</span>
                      <span className="text-ink-500 dark:text-gray-400 max-w-[160px] truncate">{p.name}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-500 dark:text-gray-400 mb-2">
                  Departments <span className="text-ink-300 dark:text-gray-500 font-normal">· {masters.departments.length}</span>
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {masters.departments.map(d => (
                    <span key={d.id} className="text-xs text-ink-600 dark:text-gray-300 bg-cream-100 dark:bg-gray-700 px-2 py-1 rounded-lg">{d.name}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {preview && <div className={panel}>
        <h2 className="font-bold text-lg text-ink-900 dark:text-gray-100">Preview & Validate</h2><p className="text-xs text-ink-400 dark:text-gray-400">Review the changes below. Nothing is saved until you confirm.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status">{Object.entries(preview.summary).map(([key, value]) => <div key={key} className={key === 'errors' && value > 0 ? 'bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-center' : 'bg-cream-100 dark:bg-gray-700 rounded-2xl p-4 text-center'}><p className={key === 'errors' && value > 0 ? 'text-2xl font-bold text-red-500' : 'text-2xl font-bold text-ink-900 dark:text-gray-100'}>{value}</p><p className="text-xs text-ink-400 dark:text-gray-400 mt-1">{({create:'New Assets', update:'Updates', unchanged:'Unchanged', errors:'Rows with Errors'})[key]}</p></div>)}</div>
        {ignored.length > 0 && <p className="text-sm">Report / unrecognized columns are not imported as asset fields: {ignored.join(', ')}. Record ID and Version are used only for validation.</p>}
        {preview.warnings.length > 0 && <p className="text-amber-700">{preview.warnings.length} rows have no export version. Changes since export cannot be checked; changes after this preview are protected.</p>}
        {preview.errors.length > 0 && <>
          <p className="text-red-600">Nothing can be saved until all errors are fixed.</p>
          <Button variant="secondary" onClick={() => download(preview.errors, 'BulkUpload_Errors.xlsx')}><Download size={16}/> Download Error Report</Button>
          <div className="overflow-auto max-h-80"><table className={tableClass}><thead><tr><th>Row</th><th>Field</th><th>Error</th></tr></thead><tbody>{preview.errors.slice(0, 200).map((e, i) => <tr key={i} className="border-t"><td className="p-2">{e.row}</td><td>{e.field}</td><td>{e.error}</td></tr>)}</tbody></table></div>
          {preview.errors.length > 200 && <p>Showing the first 200 errors. Download the report for all errors.</p>}
        </>}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => download(preview.plans.flatMap(p => p.changes.map(c => ({ Row: p.row, 'Asset Code': p.code, 'Sub Asset Number': p.sub, Action: p.action, Field: c.field, Before: c.before ?? '', After: c.after ?? '' }))), 'BulkUpload_Changes.xlsx')}><Download size={16}/> Download all changes</Button>
          <Button disabled={busy || !preview.previewToken || preview.summary.create + preview.summary.update === 0} onClick={apply}>Confirm: create {preview.summary.create}, update {preview.summary.update}</Button>
        </div>
        <div className="overflow-auto max-h-96"><table className={tableClass}><thead><tr><th>Row / Asset</th><th>Action</th><th>Field</th><th>Current value</th><th>Uploaded value</th></tr></thead><tbody>{preview.plans.slice(0, 100).map(p => p.changes.length ? p.changes.map(c => <tr key={p.row + c.db} className="border-t"><td className="p-2">{p.row}: {p.code} / {p.sub}</td><td>{p.action}</td><td>{c.field}</td><td className="p-2 whitespace-pre-wrap">{String(c.before ?? '—')}</td><td className="p-2 whitespace-pre-wrap">{String(c.after ?? '—')}</td></tr>) : <tr key={p.row} className="border-t"><td className="p-2">{p.row}: {p.code} / {p.sub}</td><td colSpan={4}>Unchanged</td></tr>)}</tbody></table></div>
        {preview.plans.length > 100 && <p>Showing the first 100 rows. Download all changes to review the full batch.</p>}
      </div>}
      <dialog ref={helpDialog} id="bulk-upload-help" aria-labelledby="bulk-upload-help-title" onClose={() => setShowHelp(false)} onClick={e => { if (e.target === e.currentTarget) setShowHelp(false) }} className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-0 p-0 bg-white dark:bg-gray-800 text-ink-700 dark:text-gray-200 shadow-medium backdrop:bg-black/40 backdrop:backdrop-blur-sm">
        <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4"><h2 id="bulk-upload-help-title" className="text-base font-bold text-ink-900 dark:text-gray-100 flex items-center gap-2"><Info size={18} className="text-brand-500"/> How It Works</h2><button type="button" aria-label="Close help" onClick={() => setShowHelp(false)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-cream-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"><X size={18}/></button></div>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>Keep Asset Code and Sub Asset Number unchanged when editing existing assets. Use 0 for the main asset and 1, 2… for its sub-assets.</li>
          <li>For updates, omitted columns and blank cells preserve existing values. Use [CLEAR] to empty an optional field. Required fields cannot be cleared.</li>
          <li>New assets require all required template fields. Dates: DD/MM/YYYY or YYYY-MM-DD. Master values must match configured spelling and case.</li>
          <li>Report-only columns can stay in the file. Keep Asset Record ID and Record Version to detect changes made since export.</li>
          <li>For existing assets, change plant, department or assigned employee through the transfer workflow. Finish active transfers before bulk editing.</li>
          <li>Every error must be fixed before saving. The entire batch succeeds or nothing is saved. Preview expires after 15 minutes.</li>
        </ul>
        <details><summary className="cursor-pointer">Required fields for new assets</summary><p className="mt-2 text-sm">{fields.filter(f => f.required).map(f => f.col).join(', ')}</p><p className="mt-2 text-sm">Optional: {fields.filter(f => !f.required).map(f => f.col).join(', ')}</p></details>
        <p className="text-sm">Report columns: {reportColumns.join(', ')}</p>
        </div>
      </dialog>


      {result && <div className={panel} role="status"><div className="w-12 h-12 rounded-2xl bg-orange-gradient text-white flex items-center justify-center"><CheckCircle size={24}/></div><h2 className="font-bold text-ink-900 dark:text-gray-100">Import complete</h2><p>{result.create} created · {result.update} updated · {result.unchanged} unchanged</p><p className="text-xs text-ink-400">Batch reference: {result.batchId}</p><div className="flex gap-3"><Button variant="secondary" onClick={reset}>Upload another file</Button><Button onClick={() => { window.location.href = '/assets' }}>View Assets</Button></div></div>}
    </div>
  )
}

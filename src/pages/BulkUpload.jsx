import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle,
  AlertCircle, Download, X, Eye, RefreshCw, Info
} from 'lucide-react'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { getMastersLookup, bulkUpload } from '../data/api'

const STEPS = ['Select File', 'Preview & Validate', 'Import']

// Columns we try to find (flexible — handles different header names)
// Format: { canonical: 'Asset ID', aliases: [...], required: true }
const COLUMN_SPEC = [
  { canonical:'Asset ID',           aliases:['asset id','asset_id','assetid'],                            required:true  },
  { canonical:'Asset Name',         aliases:['asset name','asset_name','name','description'],              required:true  },
  { canonical:'Serial Number',      aliases:['serial number','serial_number','serial','sn'],               required:true  },
  { canonical:'Acquisition Value',  aliases:['acquisition value','acquisition_value','value','amount'],    required:true  },
  { canonical:'Business Area',      aliases:['business area','business_area','plant code','plantcode'],    required:true  },
  { canonical:'Plant',              aliases:['plant','plant name','plant_name'],                           required:false },
  { canonical:'Department',         aliases:['department','dept'],                                         required:true  },
  { canonical:'Assigned Employee',  aliases:['assigned employee','assigned_employee','employee'],          required:true  },
  { canonical:'Status',             aliases:['status'],                                                    required:true  },
  { canonical:'Asset Class',        aliases:['asset class','asset_class','asset class description'],       required:false },
  { canonical:'Category',           aliases:['category'],                                                  required:false },
  { canonical:'Make',               aliases:['make','brand','manufacturer'],                               required:false },
  { canonical:'Model',              aliases:['model'],                                                     required:false },
  { canonical:'Asset Status',       aliases:['asset status','asset_status'],                               required:false },
  { canonical:'Date of Purchase',   aliases:['date of purchase','capitalized on','purchase date'],         required:false },
  { canonical:'Warranty Date',      aliases:['warranty date','warranty_date'],                             required:false },
  { canonical:'Supplier Name',      aliases:['supplier name','supplier','vendor'],                         required:false },
  { canonical:'Note',               aliases:['note','notes','remarks'],                                    required:false },
]

// Build a canonical map from actual column headers
function buildColumnMap(actualHeaders) {
  const map = {}           // canonical → actual header
  const missing = []       // required canonicals not found
  const detected = []      // what was successfully mapped
  const unrecognized = []  // actual headers we couldn't map

  const lc = h => String(h || '').toLowerCase().trim()

  actualHeaders.forEach(header => {
    const spec = COLUMN_SPEC.find(s =>
      s.aliases.some(a => a === lc(header)) || lc(header) === lc(s.canonical)
    )
    if (spec) {
      if (!map[spec.canonical]) {
        map[spec.canonical] = header
        detected.push({ canonical: spec.canonical, actual: header, required: spec.required })
      }
    } else {
      unrecognized.push(header)
    }
  })

  COLUMN_SPEC.forEach(spec => {
    if (spec.required && !map[spec.canonical]) missing.push(spec.canonical)
  })

  return { map, missing, detected, unrecognized }
}

export default function BulkUpload() {
  const [step,         setStep]         = useState(0)
  const [file,         setFile]         = useState(null)
  const [rawRows,      setRawRows]      = useState([])
  const [colMap,       setColMap]       = useState({})
  const [colReport,    setColReport]    = useState(null)  // { detected, missing, unrecognized }
  const [clientErrors, setClientErrors] = useState([])
  const [uploading,    setUploading]    = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [showResult,   setShowResult]   = useState(false)
  const [masters,      setMasters]      = useState({ plants:[], departments:[], categories:[], asset_statuses:[] })
  const inputRef = useRef()

  useEffect(() => {
    getMastersLookup().then(r => setMasters(r.data)).catch(() => {})
  }, [])

  // ── Get value from row using canonical column name ───────────
  function get(row, canonical) {
    const actualHeader = colMap[canonical]
    if (!actualHeader) return ''
    return String(row[actualHeader] || '').trim()
  }

  // ── File processing ──────────────────────────────────────────
  function processFile(f) {
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['xlsx','xls','csv'].includes(ext)) {
      alert('Only .xlsx, .xls, and .csv files are supported')
      return
    }
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => {
      const wb      = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true })
      const ws      = wb.Sheets[wb.SheetNames[0]]
      const allRows = XLSX.utils.sheet_to_json(ws, { raw:false, defval:'' })

      if (allRows.length === 0) { alert('File is empty.'); return }

      // Remove template hint rows (row 2 = "* Required", row 3 = sample "AST-SAMPLE")
      const dataRows = allRows.filter(row => {
        const firstVal = String(Object.values(row)[0] || '').trim()
        return (
          firstVal !== '* Required' &&
          firstVal !== '(optional)' &&
          !firstVal.startsWith('AST-SAMPLE') &&
          firstVal !== ''
        )
      })

      if (dataRows.length === 0) { alert('No data rows found. Make sure you deleted the hint and sample rows.'); return }

      // Detect columns from actual headers
      const headers   = Object.keys(dataRows[0])
      const { map, missing, detected, unrecognized } = buildColumnMap(headers)

      setColMap(map)
      setColReport({ detected, missing, unrecognized })
      setRawRows(dataRows)
      runValidation(dataRows, map)
      setStep(1)
    }
    reader.readAsArrayBuffer(f)
  }

  // ── Client-side validation ────────────────────────────────────
  function runValidation(rows, map) {
    const errs = []

    const plantCodesLC = masters.plants.map(p => p.code.toLowerCase())
    const plantNamesLC = masters.plants.map(p => p.name.toLowerCase())
    const deptNamesLC  = masters.departments.map(d => d.name.toLowerCase())

    const getV = (row, canonical) => {
      const h = map[canonical]
      return h ? String(row[h] || '').trim() : ''
    }

    rows.forEach((row, i) => {
      const rowNum = i + 2

      // ── Required field checks ────────────────────────────────
      if (!getV(row,'Asset ID'))          errs.push({ row:rowNum, field:'Asset ID',          error:'Asset ID is required' })
      if (!getV(row,'Asset Name'))        errs.push({ row:rowNum, field:'Asset Name',        error:'Asset Name is required' })
      if (!getV(row,'Serial Number'))     errs.push({ row:rowNum, field:'Serial Number',     error:'Serial Number is required' })
      if (!getV(row,'Assigned Employee')) errs.push({ row:rowNum, field:'Assigned Employee', error:'Assigned Employee is required' })

      // ── Acquisition Value ─────────────────────────────────────
      const val = getV(row,'Acquisition Value').replace(/[,₹$]/g,'')
      if (!val)                     errs.push({ row:rowNum, field:'Acquisition Value', error:'Acquisition Value is required' })
      else if (isNaN(Number(val)))  errs.push({ row:rowNum, field:'Acquisition Value', error:`"${val}" is not a valid number` })

      // ── Plant check — ALWAYS validate, even if masters list is empty ──
      const ba = getV(row,'Business Area').toLowerCase()
      const pn = getV(row,'Plant').toLowerCase()

      if (!ba && !pn) {
        errs.push({ row:rowNum, field:'Business Area', error:'Business Area (plant code) is required' })
      } else if (masters.plants.length === 0) {
        errs.push({
          row:rowNum, field:'Business Area',
          error:`No plants configured in the system yet. Go to Plants page and add a plant with code "${ba || pn}" first.`
        })
      } else {
        const ok = plantCodesLC.includes(ba) || plantNamesLC.includes(pn) ||
                   plantNamesLC.includes(ba) || plantCodesLC.includes(pn)
        if (!ok) {
          errs.push({
            row:rowNum, field:'Business Area',
            error:`"${ba || pn}" not found. Valid codes: ${masters.plants.map(p=>p.code).join(', ')}`
          })
        }
      }

      // ── Department check — ALWAYS validate ────────────────────
      const dn = getV(row,'Department').toLowerCase()

      if (!dn) {
        errs.push({ row:rowNum, field:'Department', error:'Department is required' })
      } else if (masters.departments.length === 0) {
        errs.push({
          row:rowNum, field:'Department',
          error:`No departments configured in the system yet. Go to Departments page and add "${getV(row,'Department')}" first.`
        })
      } else if (!deptNamesLC.includes(dn)) {
        errs.push({
          row:rowNum, field:'Department',
          error:`"${getV(row,'Department')}" not found. Valid: ${masters.departments.map(d=>d.name).join(', ')}`
        })
      }

      // ── Status check ────────────────────────────────────────
      const st = getV(row,'Status').toLowerCase()
      if (!st) {
        errs.push({ row:rowNum, field:'Status', error:'Status is required' })
      } else if (!['active','inactive'].includes(st)) {
        errs.push({ row:rowNum, field:'Status', error:`Must be Active or Inactive (got "${getV(row,'Status')}")` })
      }
    })

    setClientErrors(errs)
  }

  // ── Upload ────────────────────────────────────────────────────
  async function handleUpload() {
    setUploading(true); setStep(2)
    try {
      // Normalize rows to canonical keys before sending to backend
      const normalized = rawRows.map(row => {
        const out = {}
        COLUMN_SPEC.forEach(spec => {
          const h = colMap[spec.canonical]
          if (h) out[spec.canonical] = String(row[h] || '').trim()
        })
        return out
      })
      const res = await bulkUpload(normalized)
      setUploadResult(res.data)
      setShowResult(true)
    } catch (err) {
      setUploadResult({
        total: rawRows.length, valid: 0, errors: rawRows.length,
        errorRows: [{ row:'-', field:'-', error: err.response?.data?.error || 'Upload failed' }]
      })
      setShowResult(true)
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setStep(0); setFile(null); setRawRows([]); setColMap({})
    setColReport(null); setClientErrors([]); setUploadResult(null); setShowResult(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function downloadErrors() {
    if (!uploadResult?.errorRows?.length) return
    const ws = XLSX.utils.json_to_sheet(uploadResult.errorRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Errors')
    XLSX.writeFile(wb, `BulkUpload_Errors_${Date.now()}.xlsx`)
  }

  const errorRowNums = [...new Set(clientErrors.map(e => e.row))]
  const validCount   = rawRows.length - errorRowNums.length
  const previewRows  = rawRows.slice(0, 5)
  const KEY_COLS     = ['Asset ID','Asset Name','Business Area','Department','Assigned Employee','Acquisition Value','Status']

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Step indicator ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-300
                  ${i < step  ? 'bg-green-500 text-white shadow-soft'
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

      {/* ── Template download ────────────────────────────────── */}
      <div className="bg-orange-soft dark:bg-gray-800 rounded-3xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-100 flex items-center justify-center">
            <FileSpreadsheet size={20} className="text-brand-600"/>
          </div>
          <div>
            <p className="text-sm font-bold text-ink-900 dark:text-gray-100">Download Template</p>
            <p className="text-xs text-ink-500 dark:text-gray-400">Excel template with all required columns</p>
          </div>
        </div>
        <a href="/AssetMaster_Import_Template.xlsx" download>
          <Button variant="secondary" size="sm"><Download size={14}/> Template.xlsx</Button>
        </a>
      </div>

      {/* ── Masters reference card ───────────────────────────── */}
      {masters.plants.length > 0 && step === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info size={14} className="text-brand-500"/>
            <p className="text-xs font-bold text-ink-700 dark:text-gray-200 uppercase tracking-wide">Use These Exact Values in Your File</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-ink-500 dark:text-gray-400 mb-2">Business Area (Plant Codes)</p>
              <div className="space-y-1">
                {masters.plants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono bg-cream-100 dark:bg-gray-700 px-2 py-0.5 rounded text-brand-600 font-bold">{p.code}</span>
                    <span className="text-ink-500 dark:text-gray-400">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-500 dark:text-gray-400 mb-2">Departments</p>
              <div className="space-y-1">
                {masters.departments.map(d => (
                  <div key={d.id} className="text-xs text-ink-600 dark:text-gray-300 bg-cream-100 dark:bg-gray-700 px-2 py-1 rounded-lg">{d.name}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Drop zone (step 0) ───────────────────────────────── */}
      {step === 0 && (
        <div
          onDrop={e => { e.preventDefault(); processFile(e.dataTransfer.files?.[0]) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-12 text-center cursor-pointer
                     border-2 border-dashed border-cream-300 dark:border-gray-600
                     hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-gray-700 transition-all"
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => processFile(e.target.files?.[0])}/>
          <div className="w-16 h-16 rounded-3xl bg-cream-200 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
            <Upload size={28} className="text-ink-300 dark:text-gray-400"/>
          </div>
          <p className="font-bold text-ink-900 dark:text-gray-100 text-lg">Drop your file here</p>
          <p className="text-sm text-ink-400 dark:text-gray-400 mt-1">or click to browse · .xlsx, .xls, .csv supported</p>
          <p className="text-xs text-ink-300 dark:text-gray-500 mt-2">Your own Excel is fine — we'll detect the columns automatically</p>
        </div>
      )}

      {/* ── Preview & Validate (step 1) ──────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">

          {/* File info bar */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-gradient flex items-center justify-center shadow-soft flex-shrink-0">
              <FileSpreadsheet size={22} className="text-white"/>
            </div>
            <div className="flex-1">
              <p className="font-bold text-ink-900 dark:text-gray-100">{file?.name}</p>
              <p className="text-xs text-ink-400 dark:text-gray-400">{rawRows.length} data rows detected · {(file?.size/1024).toFixed(1)} KB</p>
            </div>
            <button onClick={reset} className="p-2 rounded-xl hover:bg-cream-200 dark:hover:bg-gray-700 text-ink-400 transition-colors">
              <X size={16}/>
            </button>
          </div>

          {/* Column detection report */}
          {colReport && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5 space-y-3">
              <p className="text-xs font-bold text-ink-700 dark:text-gray-200 uppercase tracking-wide">Column Detection Report</p>

              {/* Missing required columns — BLOCKER */}
              {colReport.missing.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle size={15} className="text-red-500"/>
                    <p className="text-sm font-bold text-red-700 dark:text-red-400">Missing Required Columns — Cannot Import</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colReport.missing.map(m => (
                      <span key={m} className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-1 rounded-lg font-medium">{m}</span>
                    ))}
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">Fix your file to include these columns, then re-upload.</p>
                </div>
              )}

              {/* Detected columns */}
              <div>
                <p className="text-xs font-semibold text-ink-500 dark:text-gray-400 mb-2">
                  <CheckCircle size={12} className="inline text-green-500 mr-1"/>
                  {colReport.detected.length} columns detected
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {colReport.detected.map(d => (
                    <span key={d.canonical}
                      className={`text-xs px-2 py-1 rounded-lg font-medium
                        ${d.required
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-cream-100 dark:bg-gray-700 text-ink-500 dark:text-gray-400'}`}>
                      {d.canonical}
                      {d.actual !== d.canonical && <span className="opacity-60 ml-1">← "{d.actual}"</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* Unrecognized columns */}
              {colReport.unrecognized.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-400 dark:text-gray-500 mb-1">
                    <Info size={11} className="inline mr-1"/>
                    {colReport.unrecognized.length} columns not recognized (will be ignored):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {colReport.unrecognized.map(u => (
                      <span key={u} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">{u}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation summary tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-4 text-center">
              <p className="text-2xl font-bold text-ink-900 dark:text-gray-100">{rawRows.length}</p>
              <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Total Rows</p>
            </div>
            <div className={`rounded-2xl shadow-card p-4 text-center ${validCount > 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-white dark:bg-gray-800'}`}>
              <p className={`text-2xl font-bold ${validCount > 0 ? 'text-green-600' : 'text-ink-900 dark:text-gray-100'}`}>{validCount}</p>
              <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Ready to Import</p>
            </div>
            <div className={`rounded-2xl shadow-card p-4 text-center ${errorRowNums.length > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'}`}>
              <p className={`text-2xl font-bold ${errorRowNums.length > 0 ? 'text-red-500' : 'text-ink-900 dark:text-gray-100'}`}>{errorRowNums.length}</p>
              <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Rows with Errors</p>
            </div>
          </div>

          {/* Row-level errors */}
          {clientErrors.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-cream-200 dark:border-gray-700 flex items-center gap-2">
                <AlertCircle size={15} className="text-red-500"/>
                <p className="text-sm font-bold text-ink-900 dark:text-gray-100">Row Validation Issues</p>
                <span className="text-xs text-red-500 ml-auto">{clientErrors.length} issues in {errorRowNums.length} rows</span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-cream-100 dark:border-gray-700 bg-cream-50 dark:bg-gray-750">
                      <th className="px-4 py-2 text-left text-ink-300 dark:text-gray-400 font-semibold w-20">Row</th>
                      <th className="px-4 py-2 text-left text-ink-300 dark:text-gray-400 font-semibold w-40">Field</th>
                      <th className="px-4 py-2 text-left text-ink-300 dark:text-gray-400 font-semibold">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientErrors.map((e, i) => (
                      <tr key={i} className="border-b border-cream-50 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/10">
                        <td className="px-4 py-2"><span className="font-mono bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">Row {e.row}</span></td>
                        <td className="px-4 py-2 font-medium text-ink-700 dark:text-gray-300">{e.field}</td>
                        <td className="px-4 py-2 text-red-600 dark:text-red-400">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validCount > 0 && (
                <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2 border-t border-amber-100 dark:border-amber-900/30">
                  <AlertCircle size={13}/>
                  {validCount} valid rows will still be imported. {errorRowNums.length} error rows will be skipped.
                </div>
              )}
            </div>
          )}

          {/* Data preview */}
          {previewRows.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-cream-200 dark:border-gray-700 flex items-center gap-2">
                <Eye size={14} className="text-ink-400 dark:text-gray-400"/>
                <p className="text-sm font-bold text-ink-900 dark:text-gray-100">Data Preview</p>
                <span className="text-xs text-ink-400 dark:text-gray-400 ml-auto">First {Math.min(previewRows.length,5)} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-cream-100 dark:border-gray-700">
                      {KEY_COLS.map(h => (
                        <th key={h} className="px-3 py-2 text-left text-ink-300 dark:text-gray-400 font-semibold whitespace-nowrap">
                          {h}
                          {!colMap[h] && <span className="ml-1 text-red-400">(missing)</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const hasError = clientErrors.some(e => e.row === i+2)
                      return (
                        <tr key={i} className={`border-b border-cream-50 dark:border-gray-700 ${hasError ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-cream-50 dark:hover:bg-gray-750'}`}>
                          {KEY_COLS.map(col => (
                            <td key={col} className="px-3 py-2 text-ink-600 dark:text-gray-300 max-w-[150px] truncate">
                              {colMap[col] ? String(row[colMap[col]] || '—') : <span className="text-red-400">—</span>}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action row */}
          <div className="flex justify-between items-center">
            <button onClick={reset} className="text-sm text-ink-400 dark:text-gray-400 hover:text-ink-700 flex items-center gap-1.5 transition-colors">
              <RefreshCw size={14}/> Choose different file
            </button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={reset}>Cancel</Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || validCount === 0 || (colReport?.missing?.length > 0)}
              >
                {uploading
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Processing…</>
                  : <><Upload size={15}/> Import {validCount} Record{validCount !== 1 ? 's' : ''}</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Processing spinner (step 2) ──────────────────────── */}
      {step === 2 && uploading && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-12 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-cream-200 dark:border-gray-600 border-t-brand-500 animate-spin mx-auto mb-4"/>
          <p className="font-bold text-ink-900 dark:text-gray-100">Importing assets…</p>
          <p className="text-sm text-ink-400 dark:text-gray-400 mt-1">Validating against master data and inserting records</p>
        </div>
      )}

      {/* ── Guidelines (step 0 only) ─────────────────────────── */}
      {step === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-6">
          <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100 mb-4">How It Works</h3>
          <div className="space-y-2">
            {[
              'You can use the official template OR your own Excel — columns are detected automatically',
              'Required columns: Asset ID, Asset Name, Serial Number, Acquisition Value, Business Area, Department, Assigned Employee, Status',
              'Business Area = Plant code (e.g. 1100, CHN) — must match a plant in the system',
              'Department name must match exactly (case-insensitive)',
              'Assigned Employee is free text — no exact match needed',
              'Rows with errors are skipped — all valid rows are always imported',
              'Duplicate Asset IDs (already in the system) are automatically skipped',
            ].map((g, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-ink-500 dark:text-gray-400">
                <CheckCircle size={14} className="text-brand-500 mt-0.5 flex-shrink-0"/>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results Modal ─────────────────────────────────────── */}
      <Modal isOpen={showResult} onClose={() => { setShowResult(false); reset() }} title="Import Complete" size="lg">
        {uploadResult && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Total Rows',    value:uploadResult.total,  Icon:FileSpreadsheet, color:'bg-blue-50 text-blue-600'   },
                { label:'Imported',      value:uploadResult.valid,  Icon:CheckCircle,     color:'bg-green-50 text-green-600' },
                { label:'Errors/Skipped',value:uploadResult.errors, Icon:XCircle,         color:'bg-red-50 text-red-500'     },
              ].map(s => (
                <div key={s.label} className={`${s.color} rounded-2xl p-4 text-center`}>
                  <s.Icon size={20} className="mx-auto mb-1.5 opacity-70"/>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {uploadResult.valid > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl px-4 py-3 flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                <CheckCircle size={16}/>
                {uploadResult.valid} asset{uploadResult.valid !== 1 ? 's' : ''} imported — visible in the Assets page now.
              </div>
            )}

            {uploadResult.errorRows?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={15} className="text-red-500"/>
                    <p className="text-sm font-bold text-ink-900 dark:text-gray-100">Error / Skip Details</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={downloadErrors}>
                    <Download size={13}/> Download Error Report
                  </Button>
                </div>
                <div className="rounded-2xl overflow-hidden border border-red-100 dark:border-red-900/30 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
                        <th className="px-4 py-2.5 text-left text-red-700 dark:text-red-400 font-semibold">Row</th>
                        <th className="px-4 py-2.5 text-left text-red-700 dark:text-red-400 font-semibold">Field</th>
                        <th className="px-4 py-2.5 text-left text-red-700 dark:text-red-400 font-semibold">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.errorRows.map((e, i) => (
                        <tr key={i} className="border-b border-red-50 dark:border-red-900/20 hover:bg-red-50 dark:hover:bg-red-900/10">
                          <td className="px-4 py-2"><span className="font-mono bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded">Row {e.row}</span></td>
                          <td className="px-4 py-2 font-medium text-ink-700 dark:text-gray-300">{e.field}</td>
                          <td className="px-4 py-2 text-red-600 dark:text-red-400">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setShowResult(false); reset() }}>Close</Button>
              <Button onClick={() => { window.location.href='/assets' }}>View Assets</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

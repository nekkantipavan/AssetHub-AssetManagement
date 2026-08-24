import { useState, useEffect, useRef, useCallback } from 'react'
import { Save, CheckCircle, AlertCircle, Info, FileText, Truck, Upload, Trash2, Image as ImageIcon } from 'lucide-react'
import { getChallanSettings, updateChallanSettings } from '../data/api'
import { buildChallanHtml, DEFAULT_CHALLAN_DESIGN } from '../utils/challanTemplate'

function fiscalYearShort(date = new Date()) {
  const y = date.getFullYear()
  const startYear = date.getMonth() >= 3 ? y : y - 1
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`
}

const SAMPLE_ITEMS = [
  { asset_tag: 'HOS-0001', name: 'HP LaserJet Pro M404',       value: 24500 },
  { asset_tag: 'HOS-0002', name: 'Lenovo ThinkCentre Desktop', value: 38200 },
]

// Read an image file, downscale to keep the embedded data URI small, return PNG data URI.
function fileToDataUri(file, maxDim = 400) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load the image'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// deep-merge saved template over the defaults so every control has a value
function mergeDesign(t = {}) {
  return {
    ...DEFAULT_CHALLAN_DESIGN, ...t,
    labels:  { ...DEFAULT_CHALLAN_DESIGN.labels,  ...(t.labels  || {}) },
    columns: { ...DEFAULT_CHALLAN_DESIGN.columns, ...(t.columns || {}) },
    show:    { ...DEFAULT_CHALLAN_DESIGN.show,    ...(t.show     || {}) },
  }
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function TextField({ label, value, onChange, ...rest }) {
  return (
    <Field label={label}>
      <input value={value ?? ''} onChange={e => onChange(e.target.value)} className="input-field" {...rest} />
    </Field>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#333333'} onChange={e => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-cream-200 dark:border-gray-600 cursor-pointer bg-transparent"/>
        <input value={value || ''} onChange={e => onChange(e.target.value)} className="input-field flex-1 font-mono text-xs"/>
      </div>
    </Field>
  )
}

function ImageField({ label, hint, value, onChange, maxDim }) {
  const inputRef = useRef(null)
  const [err, setErr] = useState('')
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    try { onChange(await fileToDataUri(file, maxDim)) }
    catch (ex) { setErr(ex.message) }
    finally { if (inputRef.current) inputRef.current.value = '' }
  }
  return (
    <Field label={label}>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden"/>
      {value ? (
        <div className="flex items-center gap-3">
          <div className="w-24 h-16 rounded-lg border border-cream-200 dark:border-gray-600 bg-cream-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
            <img src={value} alt={label} className="max-w-full max-h-full object-contain"/>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">Replace</button>
          <button type="button" onClick={() => onChange(null)}
            className="text-xs font-medium text-red-500 hover:underline flex items-center gap-1">
            <Trash2 size={12}/> Remove
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-cream-300 dark:border-gray-600 text-sm text-ink-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors">
          <Upload size={14}/> Upload image
        </button>
      )}
      {hint && <span className="block text-xs text-ink-300 dark:text-gray-500 mt-1">{hint}</span>}
      {err && <span className="block text-xs text-red-500 mt-1">{err}</span>}
    </Field>
  )
}

export default function ChallanSettings() {
  const [form,    setForm]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [preview, setPreview] = useState('delivery')
  const iframeRef = useRef(null)

  useEffect(() => {
    getChallanSettings()
      .then(r => setForm({ ...r.data, template: mergeDesign(r.data.template) }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set    = (name, value) => setForm(f => ({ ...f, [name]: value }))
  const setTpl = (name, value) => setForm(f => ({ ...f, template: { ...f.template, [name]: value } }))
  const setSub = (group, key, value) =>
    setForm(f => ({ ...f, template: { ...f.template, [group]: { ...f.template[group], [key]: value } } }))

  async function handleSave() {
    setSaving(true); setToast(null)
    try {
      const saved = await updateChallanSettings(form)
      setForm({ ...saved.data, template: mergeDesign(saved.data.template) })
      setToast({ type: 'ok', msg: 'Challan template saved successfully' })
    } catch (err) {
      setToast({ type: 'err', msg: err.response?.data?.error || 'Failed to save' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  const fy      = !loading && form ? fiscalYearShort() : ''
  const padding = !loading && form ? Math.min(6, Math.max(1, parseInt(form.seq_padding) || 3)) : 3
  const D       = form?.template || {}

  const isDelivery = preview === 'delivery'
  const previewHtml = (!loading && form) ? buildChallanHtml({
    challanNo: `NSPL-${(isDelivery ? form.delivery_doc_type : form.return_doc_type || 'RET').toUpperCase()}-${fy}-${'1'.padStart(padding,'0')}`,
    date: new Date().toLocaleDateString('en-IN'),
    fromName: isDelivery ? 'Plant 1200 – Sample Plant' : 'Plant 1103 – Hosur',
    fromLoc:  isDelivery ? 'Sample City, State' : 'Hosur, Tamil Nadu',
    toName:   isDelivery ? 'Plant 1103 – Hosur' : 'Plant 1200 – Sample Plant',
    toLoc:    isDelivery ? 'Hosur, Tamil Nadu' : 'Sample City, State',
    transferType: isDelivery ? 'Returnable' : 'Full Return',
    items: SAMPLE_ITEMS,
    approvedDate: new Date().toLocaleDateString('en-IN'),
    label: isDelivery ? 'Delivery Challan' : 'Return Delivery Challan',
    footerNote: form.footer_note,
    signatoryLabel: form.signatory_label,
    signatureImage: form.signature_image,
    design: D,
  }) : ''

  // Write preview HTML into the iframe in-place so the scroll position is
  // preserved when the user drags a slider (srcDoc alone would reload the
  // entire iframe and scroll back to top on every change).
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !previewHtml) return
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return
      const scrollY = doc.documentElement?.scrollTop || doc.body?.scrollTop || 0
      doc.open()
      doc.write(previewHtml)
      doc.close()
      // Restore scroll after the new content has rendered
      requestAnimationFrame(() => {
        if (doc.documentElement) doc.documentElement.scrollTop = scrollY
        if (doc.body) doc.body.scrollTop = scrollY
      })
    } catch (e) { /* cross-origin guard — srcDoc fallback handles it */ }
  }, [previewHtml])

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-7 h-7 border-2 border-brand-300 border-t-brand-500 rounded-full animate-spin"/>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-gradient flex items-center justify-center shadow-soft">
            <FileText size={15} className="text-white"/>
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-900 dark:text-white leading-none">Challan Template Designer</h2>
            <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Design the printed delivery &amp; return challan — changes preview live on the right</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          <Save size={14}/>
          {saving ? 'Saving…' : 'Update Challan'}
        </button>
      </div>

      {toast && (
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium ${
          toast.type === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {toast.type === 'ok' ? <CheckCircle size={15}/> : <AlertCircle size={15}/>}
          {toast.msg}
        </div>
      )}

      {/* Master switch */}
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
        form.template_enabled
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
          : 'bg-cream-100 dark:bg-gray-800 border-cream-200 dark:border-gray-700'
      }`}>
        <button type="button" role="switch" aria-checked={form.template_enabled}
          onClick={() => set('template_enabled', !form.template_enabled)}
          className={`mt-0.5 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            form.template_enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            form.template_enabled ? 'translate-x-5' : 'translate-x-0.5'}`}/>
        </button>
        <div>
          <p className="text-sm font-semibold text-ink-900 dark:text-white">Set as default template</p>
          <p className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
            {form.template_enabled
              ? 'ON — every real delivery & return challan uses this design.'
              : 'OFF — real challans use the built-in standard template. Turn on to apply your design.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ── Controls ── */}
        <div className="space-y-4">

          {/* Numbering */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5 space-y-4">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide">Numbering</p>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Delivery Doc Type" value={form.delivery_doc_type} onChange={v => set('delivery_doc_type', v)} maxLength={20} placeholder="AST"/>
              <TextField label="Return Doc Type"   value={form.return_doc_type}   onChange={v => set('return_doc_type', v)}   maxLength={20} placeholder="RET"/>
            </div>
            <Field label="Sequence Padding (digits)">
              <input type="number" min={1} max={6} value={form.seq_padding} onChange={e => set('seq_padding', e.target.value)} className="input-field w-32"/>
            </Field>
            <p className="text-xs text-ink-300 dark:text-gray-500 -mt-1">
              Pattern: <span className="font-mono">PREFIX-{(form.delivery_doc_type||'AST').toUpperCase()}-{fy}-{'1'.padStart(padding,'0')}</span> · prefix set per plant on the Plants page.
            </p>
          </div>

          {/* Branding */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5 space-y-4">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><ImageIcon size={12}/> Branding</p>
            <TextField label="Company Name (optional, shown above title)" value={D.companyName} onChange={v => setTpl('companyName', v)} placeholder="e.g. Neolync Solutions Pvt Ltd"/>
            <ImageField label="Logo" value={D.logoImage} onChange={v => setTpl('logoImage', v)} maxDim={240} hint="Shown top-left of the challan. PNG with transparency works best."/>
            <div className="grid grid-cols-2 gap-4">
              <ColorField label="Accent / Border Colour" value={D.accentColor} onChange={v => setTpl('accentColor', v)}/>
              <ColorField label="Table Header Colour" value={D.headerBg} onChange={v => setTpl('headerBg', v)}/>
            </div>
          </div>

          {/* Section labels */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5 space-y-4">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide">Section Labels</p>
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Bill From"  value={D.labels.billFrom}  onChange={v => setSub('labels','billFrom', v)}/>
              <TextField label="Consignee"  value={D.labels.consignee} onChange={v => setSub('labels','consignee', v)}/>
              <TextField label="Bill To"    value={D.labels.billTo}    onChange={v => setSub('labels','billTo', v)}/>
              <TextField label="Ship To"    value={D.labels.shipTo}    onChange={v => setSub('labels','shipTo', v)}/>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
              <input type="checkbox" checked={D.show.transportRow} onChange={e => setSub('show','transportRow', e.target.checked)}
                className="w-4 h-4 rounded border-cream-300 text-brand-500 focus:ring-brand-400"/>
              <span className="text-sm text-ink-700 dark:text-gray-300">Show “Transport Vehicle / Place of Supply” row</span>
            </label>
            {D.show.transportRow && (
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Transport label"      value={D.labels.transport}     onChange={v => setSub('labels','transport', v)}/>
                <TextField label="Place of Supply label" value={D.labels.placeOfSupply} onChange={v => setSub('labels','placeOfSupply', v)}/>
              </div>
            )}
          </div>

          {/* Table columns */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5 space-y-4">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide">Table Column Headers</p>
            <div className="grid grid-cols-3 gap-3">
              <TextField label="S.No"        value={D.columns.sno}         onChange={v => setSub('columns','sno', v)}/>
              <TextField label="Asset No"    value={D.columns.assetNo}     onChange={v => setSub('columns','assetNo', v)}/>
              <TextField label="Description" value={D.columns.description} onChange={v => setSub('columns','description', v)}/>
              <TextField label="Qty"         value={D.columns.qty}         onChange={v => setSub('columns','qty', v)}/>
              <TextField label="UOM"         value={D.columns.uom}         onChange={v => setSub('columns','uom', v)}/>
              <TextField label="Rate"        value={D.columns.rate}        onChange={v => setSub('columns','rate', v)}/>
              <TextField label="Amount"      value={D.columns.amount}      onChange={v => setSub('columns','amount', v)}/>
            </div>
            <p className="text-xs text-ink-300 dark:text-gray-500 -mt-1">Row data (asset code, description, amounts) is filled automatically from each transfer.</p>
          </div>

          {/* Footer & signature */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5 space-y-4">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide">Footer &amp; Signature</p>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={D.show.amountWords} onChange={e => setSub('show','amountWords', e.target.checked)}
                className="w-4 h-4 rounded border-cream-300 text-brand-500 focus:ring-brand-400"/>
              <span className="text-sm text-ink-700 dark:text-gray-300">Show “Rupees in words” line <span className="text-ink-300 dark:text-gray-500">(auto-calculated from the total)</span></span>
            </label>
            {D.show.amountWords && (
              <TextField label="Rupees-in-words Label" value={D.labels.amountWords} onChange={v => setSub('labels','amountWords', v)}/>
            )}
            <Field label="Footer Note">
              <textarea value={form.footer_note ?? ''} onChange={e => set('footer_note', e.target.value)} rows={2} className="input-field resize-none"/>
            </Field>
            <TextField label="Signatory Label" value={form.signatory_label} onChange={v => set('signatory_label', v)} placeholder="AUTHORISED SIGNATORY"/>
            <ImageField label="Digital Signature" value={form.signature_image} onChange={v => set('signature_image', v)} maxDim={800}
              hint="Appears just above the signatory label on every challan."/>
            {form.signature_image && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={`Width (${D.signatureWidth || 200}px)`}>
                  <div className="flex items-center gap-2">
                    <input type="range" min={60} max={400} step={5}
                      value={D.signatureWidth || 200}
                      onChange={e => setTpl('signatureWidth', parseInt(e.target.value))}
                      className="flex-1 accent-brand-500 cursor-pointer"
                    />
                    <input type="number" min={60} max={400}
                      value={D.signatureWidth || 200}
                      onChange={e => setTpl('signatureWidth', Math.min(400, Math.max(60, parseInt(e.target.value) || 200)))}
                      className="input-field w-16 text-center font-mono text-xs py-1 px-1"
                    />
                  </div>
                </Field>
                <Field label={`Height (${D.signatureHeight || 80}px)`}>
                  <div className="flex items-center gap-2">
                    <input type="range" min={30} max={200} step={5}
                      value={D.signatureHeight || 80}
                      onChange={e => setTpl('signatureHeight', parseInt(e.target.value))}
                      className="flex-1 accent-brand-500 cursor-pointer"
                    />
                    <input type="number" min={30} max={200}
                      value={D.signatureHeight || 80}
                      onChange={e => setTpl('signatureHeight', Math.min(200, Math.max(30, parseInt(e.target.value) || 80)))}
                      className="input-field w-16 text-center font-mono text-xs py-1 px-1"
                    />
                  </div>
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-5 space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-ink-400 dark:text-gray-400 uppercase tracking-wide">Live Preview</p>
            <div className="inline-flex rounded-xl border border-cream-200 dark:border-gray-600 overflow-hidden">
              <button type="button" onClick={() => setPreview('delivery')}
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all
                  ${isDelivery ? 'bg-brand-500 text-white' : 'bg-white dark:bg-gray-800 text-ink-400 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-gray-700'}`}>
                <Truck size={12}/> Delivery
              </button>
              <button type="button" onClick={() => setPreview('return')}
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all
                  ${!isDelivery ? 'bg-brand-500 text-white' : 'bg-white dark:bg-gray-800 text-ink-400 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-gray-700'}`}>
                <FileText size={12}/> Return
              </button>
            </div>
          </div>
          <iframe title="Challan preview" ref={iframeRef} srcDoc={previewHtml}
            className="w-full h-[640px] rounded-xl border border-cream-200 dark:border-gray-700 bg-white"/>
          <div className="flex items-start gap-2 text-xs text-ink-300 dark:text-gray-500">
            <Info size={13} className="mt-0.5 flex-shrink-0"/>
            <span>Sample data shown for illustration. This preview is exactly what prints — the design applies to real challans only when “Set as default” is on.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

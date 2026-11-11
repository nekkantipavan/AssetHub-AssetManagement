import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Building2, FileText, Hash, ImagePlus, PenLine, Printer, RotateCcw, Save, Table2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/common/Modal'
import { useAuth } from '../context/AuthContext'
import { getChallanSettings, getPlants, updateChallanSettings } from '../data/api'
import { buildChallanHtml, CHALLAN_TYPES, mergeChallanDesign } from '../utils/challanTemplate'

const SECTIONS = {
  header: { name: 'Header & logo', icon: ImagePlus, hint: 'Set the company branding and printed document titles.' },
  addresses: { name: 'Address blocks', icon: Building2, hint: 'Rename the sections. Plant addresses come from the transfer.' },
  table: { name: 'Asset table', icon: Table2, hint: 'Choose the columns and labels shown on the printed table.' },
  footer: { name: 'Footer & signature', icon: PenLine, hint: 'Set the footer text, amount in words and signatory details.' },
  numbering: { name: 'Numbering settings', icon: Hash, hint: 'Configure document numbers issued after publishing.' },
}
const COLUMNS = {
  sno: 'Row number', assetNo: 'Asset number', description: 'Description',
  qty: 'Quantity', uom: 'Unit of measure', rate: 'Rate', amount: 'Amount',
}
const SAMPLE_ASSETS = [
  { name: 'HP LaserJet Pro M404', value: 24500 },
  { name: 'Lenovo ThinkCentre Desktop', value: 38200 },
  { name: 'Cisco Catalyst Network Switch', value: 53600 },
]
const LONG_SAMPLE = Array.from({ length: 40 }, (_, index) => ({
  ...SAMPLE_ASSETS[index % SAMPLE_ASSETS.length],
  asset_tag: 'SAMPLE-' + String(index + 1).padStart(3, '0'),
}))
const WIDE_SCREEN = '(min-width: 1100px)'

function formatNumber(prefix, code, padding) {
  const now = new Date()
  const startYear = now.getFullYear() - Number(now.getMonth() < 3)
  const fiscalYear = String(startYear).slice(-2) + String(startYear + 1).slice(-2)
  const digits = Math.min(6, Math.max(1, parseInt(padding, 10) || 3))
  return [prefix.toUpperCase(), code.trim().toUpperCase(), fiscalYear, '1'.padStart(digits, '0')].join('-')
}

function normalize(settings) {
  return { ...settings, seq_padding: String(settings.seq_padding), template: mergeChallanDesign(settings.template) }
}

function readDraft(key, published) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    if (value?.template && typeof value.delivery_doc_type === 'string' && typeof value.return_doc_type === 'string') {
      return normalize({ ...published, ...value })
    }
  } catch { /* the editor can still open if browser storage is unavailable */ }
  return published
}

function resizeImage(file, maxDim) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    return Promise.reject(new Error('Choose a PNG, JPG, WebP or GIF image.'))
  }
  if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('Choose an image under 10 MB.'))
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  return image.decode().then(() => {
    const scale = Math.min(1, maxDim / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }).catch(() => { throw new Error('This image could not be prepared.') })
    .finally(() => URL.revokeObjectURL(url))
}

function Field({ label, children }) {
  return <label className="block space-y-1.5">
    <span className="block text-xs font-semibold">{label}</span>
    {children}
  </label>
}

function TextField({ label, value, onChange, ...props }) {
  return <Field label={label}>
    <input className="input-field" value={value ?? ''} onChange={event => onChange(event.target.value)} {...props}/>
  </Field>
}

function Toggle({ label, checked, onChange }) {
  return <label className="flex items-center justify-between gap-2 rounded-xl bg-cream-100 px-3 py-2 text-sm dark:bg-gray-700">
    {label}
    <input className="h-4 w-4 shrink-0 accent-brand-500" type="checkbox" checked={!!checked}
      onChange={event => onChange(event.target.checked)}/>
  </label>
}

function SizeField({ label, value, min, max, onChange }) {
  return <Field label={label + ' · ' + value + ' px'}>
    <input className="block w-full accent-brand-500" type="range" min={min} max={max} value={value}
      onChange={event => onChange(Number(event.target.value))}/>
  </Field>
}

function ImageField({ label, value, maxDim, onChange, onBusy }) {
  const input = useRef()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    onBusy(1)
    try { onChange(await resizeImage(file, maxDim)) }
    catch (err) { setError(err.message) }
    finally { setBusy(false); onBusy(-1) }
  }
  return <div className="space-y-2">
    <p className="text-xs font-semibold">{label}</p>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
      aria-label={label} onChange={upload} className="hidden"/>
    {value && <img src={value} alt={label} className="h-14 w-full rounded-lg border border-cream-200 bg-white object-contain dark:border-gray-600"/>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} className="btn-secondary text-xs" onClick={() => input.current?.click()}>
        <Upload size={13}/>{busy ? 'Preparing…' : value ? 'Replace ' + label.toLowerCase() : 'Upload ' + label.toLowerCase()}
      </button>
      {value && <button type="button" disabled={busy} className="text-xs font-semibold text-red-600 dark:text-red-400"
        onClick={() => { onChange(null); setError('') }}>Remove</button>}
    </div>
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
  </div>
}

function Paper({ html, section, onSelect }) {
  const iframe = useRef()
  const cleanup = useRef(null)
  const activeSection = useRef(section)
  activeSection.current = section

  function highlight(doc) {
    doc?.querySelectorAll('[data-challan-section]').forEach(node =>
      node.toggleAttribute('data-selected', node.dataset.challanSection === activeSection.current))
  }

  useEffect(() => { highlight(iframe.current?.contentDocument) }, [section])
  useEffect(() => () => cleanup.current?.(), [])

  function bindPaper() {
    cleanup.current?.()
    const frame = iframe.current
    const doc = frame?.contentDocument
    if (!doc?.body) return
    function select(event) {
      const id = event.target.closest('[data-challan-section]')?.dataset.challanSection
      if (id) onSelect(id)
    }
    function resize() {
      frame.style.height = Math.ceil(doc.body.getBoundingClientRect().height) + 'px'
    }
    doc.addEventListener('click', select)
    const observer = new ResizeObserver(resize)
    observer.observe(doc.body)
    highlight(doc)
    resize()
    cleanup.current = () => {
      observer.disconnect()
      doc.removeEventListener('click', select)
    }
  }

  return <iframe ref={iframe} title="Editable challan preview" sandbox="allow-same-origin" onLoad={bindPaper}
    srcDoc={html} className="mx-auto block w-full max-w-[794px] bg-white shadow-medium" style={{ minHeight: 360 }}/>
}

export default function ChallanSettings() {
  const { user } = useAuth()
  const draftKey = 'assethub.challan-draft.v1.' + user.id
  const [published, setPublished] = useState(null)
  const [form, setForm] = useState(null)
  const [savedDraft, setSavedDraft] = useState(null)
  const [plants, setPlants] = useState([])
  const [plantsError, setPlantsError] = useState(false)
  const [plantId, setPlantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyImages, setBusyImages] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [type, setType] = useState('returnable')
  const [longSample, setLongSample] = useState(false)
  const [section, setSection] = useState('header')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_SCREEN).matches)
  const outlineLabel = useId()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getChallanSettings()
      const live = normalize(data)
      const draft = readDraft(draftKey, live)
      setPublished(live)
      setSavedDraft(draft)
      setForm(draft)
    } catch {
      setForm(null)
    } finally {
      setLoading(false)
    }
  }, [draftKey])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    getPlants().then(({ data }) => setPlants(data)).catch(() => setPlantsError(true))
    const media = window.matchMedia(WIDE_SCREEN)
    const change = event => { setWide(event.matches); setInspectorOpen(false) }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  const formJson = useMemo(() => JSON.stringify(form), [form])
  const savedJson = useMemo(() => JSON.stringify(savedDraft), [savedDraft])
  const publishedJson = useMemo(() => JSON.stringify(published), [published])
  const unsaved = formJson !== savedJson
  const unpublished = formJson !== publishedJson
  const pending = saving || busyImages > 0

  useEffect(() => {
    if (!unsaved) return
    const warn = event => { event.preventDefault(); event.returnValue = true }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const select = useCallback(id => {
    setSection(id)
    setInspectorOpen(true)
  }, [])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setDesign = (key, value) => setForm(current => ({ ...current, template: { ...current.template, [key]: value } }))
  const setPart = (group, key, value) => setForm(current => ({
    ...current, template: { ...current.template, [group]: { ...current.template[group], [key]: value } },
  }))
  const trackImage = delta => setBusyImages(count => count + delta)

  const selectedPlant = plants.find(plant => String(plant.id) === plantId)
  const prefix = selectedPlant?.challan_prefix || selectedPlant?.code || 'SAMPLE'
  const deliveryNumber = form ? formatNumber(prefix, form.delivery_doc_type || 'AST', form.seq_padding) : ''
  const returnNumber = form ? formatNumber(prefix, form.return_doc_type || 'RET', form.seq_padding) : ''
  const sample = useMemo(() => {
    if (!form) return null
    const date = new Date().toLocaleDateString('en-IN')
    return {
      type, date, approvedDate: date,
      challanNo: type === 'return' ? returnNumber : deliveryNumber,
      fromName: type === 'return' ? 'Sample Plant B' : 'Sample Plant A',
      fromLoc: type === 'return' ? 'Bengaluru, Karnataka' : 'Hosur, Tamil Nadu',
      toName: type === 'return' ? 'Sample Plant A' : 'Sample Plant B',
      toLoc: type === 'return' ? 'Hosur, Tamil Nadu' : 'Bengaluru, Karnataka',
      transferType: CHALLAN_TYPES[type].transferType,
      items: longSample ? LONG_SAMPLE : LONG_SAMPLE.slice(0, 3),
      footerNote: form.footer_note, signatoryLabel: form.signatory_label,
      signatureImage: form.signature_image, design: form.template, sample: true,
    }
  }, [form, type, deliveryNumber, returnNumber, longSample])
  const [previewHtml, setPreviewHtml] = useState('')
  useEffect(() => {
    if (!sample) return
    const timer = setTimeout(() => setPreviewHtml(buildChallanHtml({ ...sample, studio: true })), 120)
    return () => clearTimeout(timer)
  }, [sample])

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, formJson)
      setSavedDraft(form)
      setFeedback({ text: 'Draft saved in this browser.' })
    } catch {
      setFeedback({ error: true, text: 'This browser could not save the draft. You can still publish from this page.' })
    }
  }

  function resetDraft() {
    try {
      localStorage.removeItem(draftKey)
      setForm(published)
      setSavedDraft(published)
      setFeedback({ text: 'Restored the published settings.' })
    } catch {
      setFeedback({ error: true, text: 'This browser could not clear the saved draft.' })
    }
  }

  function reviewPublish() {
    if (!form.delivery_doc_type.trim() || !form.return_doc_type.trim() || !/^[1-6]$/.test(form.seq_padding)) {
      select('numbering')
      setFeedback({ error: true, text: 'Enter both document codes and a sequence length from 1 to 6.' })
      return
    }
    if (!form.signatory_label?.trim()) {
      select('footer')
      setFeedback({ error: true, text: 'Enter the signatory label before publishing.' })
      return
    }
    setFeedback(null)
    setPublishOpen(true)
  }

  async function publish() {
    setSaving(true)
    try {
      const { data } = await updateChallanSettings(form)
      const live = normalize(data)
      setPublished(live)
      setSavedDraft(live)
      setForm(live)
      setPublishOpen(false)
      setFeedback({ text: 'Challan settings published.' })
      try { localStorage.removeItem(draftKey) } catch { /* the publish already succeeded */ }
    } catch (error) {
      setPublishOpen(false)
      setFeedback({ error: true, text: error.response?.data?.error || 'The settings could not be published. Your edits are still here.' })
    } finally {
      setSaving(false)
    }
  }

  function printSample() {
    const preview = window.open('', '_blank', 'width=1000,height=780')
    if (!preview) {
      setFeedback({ error: true, text: 'Allow pop-ups for this site to open the sample print view.' })
      return
    }
    preview.opener = null
    preview.document.open()
    preview.document.write(buildChallanHtml(sample))
    preview.document.close()
  }

  if (loading) return <p role="status" className="py-16 text-center text-sm text-ink-500">Loading Challan Studio…</p>
  if (!form) return <div role="alert" className="card space-y-3 p-5">
    <p>Challan settings could not be loaded.</p>
    <button type="button" className="btn-secondary" onClick={load}>Try again</button>
  </div>

  const design = form.template
  const currentSection = SECTIONS[section]
  const labelField = (key, label) => <TextField key={key} label={label} value={design.labels[key]}
    onChange={value => setPart('labels', key, value)} maxLength={100}/>
  const status = unsaved ? 'Unsaved edits' : unpublished ? 'Draft saved locally' : 'Published settings'
  const inspector = <fieldset disabled={pending} className="min-w-0 space-y-4">
    <p className="text-xs leading-relaxed text-ink-500 dark:text-gray-400">{currentSection.hint}</p>
    {section === 'header' && <>
      <TextField label="Company name" value={design.companyName} onChange={value => setDesign('companyName', value)} maxLength={120}/>
      <ImageField label="Logo" value={design.logoImage} onChange={value => setDesign('logoImage', value)} maxDim={360} onBusy={trackImage}/>
      {design.logoImage && <SizeField label="Logo width" min={40} max={180} value={design.logoWidth} onChange={value => setDesign('logoWidth', value)}/>}
      <TextField label={CHALLAN_TYPES[type].name + ' title'} value={design.titles[type]} placeholder={CHALLAN_TYPES[type].title}
        maxLength={100} onChange={value => setPart('titles', type, value)}/>
      <p className="text-xs text-ink-500 dark:text-gray-400">Switch the preview type to edit its title.</p>
      <Field label="Border colour">
        <input type="color" className="block h-8 w-12 cursor-pointer rounded border border-cream-200"
          value={/^#[0-9a-f]{6}$/i.test(design.accentColor) ? design.accentColor : '#333333'}
          onChange={event => setDesign('accentColor', event.target.value)}/>
      </Field>
    </>}
    {section === 'addresses' && <>
      {labelField('billFrom', 'Sender heading')}
      {labelField('consignee', 'Challan information heading')}
      {labelField('billTo', 'Billing address heading')}
      {labelField('shipTo', 'Shipping address heading')}
      <Toggle label="Show transport and place of supply" checked={design.show.transportRow}
        onChange={value => setPart('show', 'transportRow', value)}/>
      {design.show.transportRow && <>
        {labelField('transport', 'Transport heading')}
        {labelField('placeOfSupply', 'Place of supply heading')}
      </>}
    </>}
    {section === 'table' && <>
      <Toggle label="Show unit of measure" checked={design.show.uom} onChange={value => setPart('show', 'uom', value)}/>
      <Toggle label="Show rate" checked={design.show.rate} onChange={value => setPart('show', 'rate', value)}/>
      {Object.entries(COLUMNS).filter(([key]) => design.show[key] !== false).map(([key, label]) =>
        <TextField key={key} label={label + ' heading'} value={design.columns[key]} maxLength={100}
          onChange={value => setPart('columns', key, value)}/>)}
      {labelField('total', 'Total label')}
      <Field label="Table header colour">
        <input type="color" className="block h-8 w-12 cursor-pointer rounded border border-cream-200"
          value={/^#[0-9a-f]{6}$/i.test(design.headerBg) ? design.headerBg : '#f0f0f0'}
          onChange={event => setDesign('headerBg', event.target.value)}/>
      </Field>
    </>}
    {section === 'footer' && <>
      <Toggle label="Show amount in words" checked={design.show.amountWords} onChange={value => setPart('show', 'amountWords', value)}/>
      {design.show.amountWords && labelField('amountWords', 'Amount in words label')}
      <Field label="Footer note">
        <textarea rows={3} className="input-field" value={form.footer_note ?? ''} onChange={event => set('footer_note', event.target.value)}/>
      </Field>
      <TextField label="Signatory label" value={form.signatory_label} onChange={value => set('signatory_label', value)} maxLength={100}/>
      <ImageField label="Signature" value={form.signature_image} onChange={value => set('signature_image', value)} maxDim={800} onBusy={trackImage}/>
      {form.signature_image && <>
        <SizeField label="Signature width" min={60} max={500} value={design.signatureWidth} onChange={value => setDesign('signatureWidth', value)}/>
        <SizeField label="Signature height" min={30} max={300} value={design.signatureHeight} onChange={value => setDesign('signatureHeight', value)}/>
      </>}
    </>}
    {section === 'numbering' && <>
      <TextField label="Delivery document code" value={form.delivery_doc_type} onChange={value => set('delivery_doc_type', value)} maxLength={20}/>
      <TextField label="Return document code" value={form.return_doc_type} onChange={value => set('return_doc_type', value)} maxLength={20}/>
      <TextField label="Sequence length" value={form.seq_padding} onChange={value => set('seq_padding', value)} type="number" min={1} max={6}/>
      <Field label="Plant for number examples">
        <select className="input-field" value={plantId} onChange={event => setPlantId(event.target.value)}>
          <option value="">Sample prefix</option>
          {plants.map(plant => <option key={plant.id} value={plant.id}>{plant.name}</option>)}
        </select>
      </Field>
      {plantsError && <p className="text-xs text-ink-500 dark:text-gray-400">Plants could not be loaded. Using the sample prefix.</p>}
      <div className="space-y-2 rounded-xl bg-cream-100 p-3 text-xs dark:bg-gray-700">
        <p className="font-semibold">Example numbers</p>
        <p className="break-all font-mono">{deliveryNumber}</p>
        <p className="break-all font-mono">{returnNumber}</p>
      </div>
      <Link to="/plants" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
        Manage plant prefixes <ArrowUpRight size={12}/>
      </Link>
    </>}
  </fieldset>

  return <div className="mx-auto max-w-[1700px] space-y-4">
    <section aria-label="Challan Studio" className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cream-200 p-4 sm:p-5 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-gradient text-white"><FileText size={21}/></div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Challan Studio</h2>
            <p className="text-xs text-ink-500 dark:text-gray-400">Select a section on the document to edit it.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className="rounded-full bg-cream-100 px-2.5 py-1.5 text-xs font-semibold dark:bg-gray-700">{status}</span>
          <button type="button" className="btn-secondary disabled:opacity-50" disabled={pending || !unsaved} onClick={saveDraft}><Save size={14}/> Save draft</button>
          <button type="button" className="btn-primary disabled:opacity-50" disabled={pending || !unpublished} onClick={reviewPublish}>Review &amp; publish <ArrowUpRight size={15}/></button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-200 px-4 py-2.5 text-xs dark:border-gray-700">
        <p className="text-ink-500 dark:text-gray-400">
          Active print template <strong className="text-ink-900 dark:text-white">{published.template_enabled ? 'Custom' : 'Standard'}</strong>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-medium">
            <input className="accent-brand-500" type="checkbox" checked={form.template_enabled} disabled={pending}
              onChange={event => set('template_enabled', event.target.checked)}/>
            Use custom layout when published
          </label>
          {unpublished && <button type="button" disabled={pending} onClick={resetDraft}
            className="inline-flex items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300"><RotateCcw size={13}/> Discard draft</button>}
        </div>
      </div>

      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={'border-b px-4 py-2.5 text-sm ' + (feedback.error
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300')}>{feedback.text}</p>}

      <div className="grid min-w-0 min-[1100px]:grid-cols-[148px_minmax(0,1fr)_248px] min-[1440px]:grid-cols-[176px_minmax(0,1fr)_280px]">
        <nav aria-labelledby={outlineLabel} className="border-b border-cream-200 p-3 dark:border-gray-700 min-[1100px]:border-b-0 min-[1100px]:border-r">
          <p id={outlineLabel} className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-gray-400">Document outline</p>
          <div className="flex flex-wrap gap-1 min-[1100px]:flex-col">
            {Object.entries(SECTIONS).map(([id, { name, icon: Icon }]) => {
              const active = id === section && (wide || inspectorOpen)
              return <button key={id} type="button" aria-pressed={active} onClick={() => select(id)}
                className={'flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold ' + (active
                  ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'text-ink-600 hover:bg-cream-100 dark:text-gray-300 dark:hover:bg-gray-700')}>
                <Icon size={15} className="shrink-0"/>{name}
              </button>
            })}
          </div>
        </nav>

        <div className="min-w-0 bg-[#f0ece5] dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-200 bg-white/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Challan type" className="input-field w-auto max-w-full text-xs" value={type} onChange={event => setType(event.target.value)}>
                {Object.entries(CHALLAN_TYPES).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
              </select>
              <select aria-label="Sample asset list" className="input-field w-auto max-w-full text-xs" value={longSample ? 'long' : 'short'}
                onChange={event => setLongSample(event.target.value === 'long')}>
                <option value="short">3 assets</option><option value="long">40 assets</option>
              </select>
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={printSample}><Printer size={14}/> Print sample</button>
          </div>
          <div className="px-2 py-4 sm:px-5 sm:py-5 min-[1100px]:max-h-[72dvh] min-[1100px]:overflow-auto">
            <div className="mx-auto mb-2 flex max-w-[794px] justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500 dark:text-gray-400">
              <span>Document preview</span><span>A4 print layout</span>
            </div>
            <Paper html={previewHtml} section={section} onSelect={select}/>
          </div>
        </div>

        {wide && <aside aria-label="Section properties" className="max-h-[78dvh] min-w-0 overflow-auto border-l border-cream-200 dark:border-gray-700">
          <div className="sticky top-0 border-b border-cream-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">Section properties</p>
            <h3 className="mt-1 text-sm font-bold">{currentSection.name}</h3>
          </div>
          <div className="p-4">{inspector}</div>
        </aside>}
      </div>
    </section>

    {!wide && <Modal isOpen={inspectorOpen} onClose={() => setInspectorOpen(false)} title={currentSection.name} size="sm" bottom>
      {inspector}
    </Modal>}
    <Modal isOpen={publishOpen} onClose={() => { if (!saving) setPublishOpen(false) }} title="Publish challan settings" size="sm">
      <p className="text-sm text-ink-600 dark:text-gray-300">
        {form.template_enabled ? 'The custom layout will become active for printed delivery and return challans.'
          : 'The standard layout will be active for printed challans. Your custom design will remain saved.'}
        {' '}Numbering changes apply to newly issued challan numbers.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} className="btn-secondary" onClick={() => setPublishOpen(false)}>Keep editing</button>
        <button type="button" disabled={saving} className="btn-primary" onClick={publish}>{saving ? 'Publishing…' : 'Publish settings'}</button>
      </div>
    </Modal>
  </div>
}

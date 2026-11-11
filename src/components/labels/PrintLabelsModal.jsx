import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Barcode, Check, ChevronLeft, ChevronRight, Eye, Layers, LayoutGrid, ListPlus, Minus, Plus, Printer, Search, Settings2, SlidersHorizontal, Tag, Trash2, X } from 'lucide-react'
import AssetLabel from './AssetLabel'
import LabelPrintView from './LabelPrintView'
import { DEFAULT_LABEL_OPTIONS, LABEL_FIELDS, LABEL_TEMPLATES, getLabelPage, labelCode, sheetLayout } from './labelLayout'
import { getAssets } from '../../data/api'

const EMPTY_ASSETS = []
const TABS = [
  { id: 'queue', name: 'Print queue', icon: ListPlus },
  { id: 'design', name: 'Label design', icon: SlidersHorizontal },
  { id: 'layout', name: 'Paper setup', icon: Settings2 },
]
const boundedQty = value => Math.min(99, Math.max(1, Math.floor(Number(value)) || 1))

function NumberField({ label, value, min, max, onChange, unit }) {
  return <label className="block space-y-1.5">
    <span className="text-xs font-semibold">{label}</span>
    <div className="flex items-center gap-2">
      <input type="number" min={min} max={max} step={1} value={value} onChange={event => onChange(event.target.value)}
        onBlur={event => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))}
        className="input-field min-w-0" />
      {unit && <span className="text-xs text-ink-500 dark:text-gray-400">{unit}</span>}
    </div>
  </label>
}

function SheetPreview({ queue, template, margin, gap, skip, page, selectedId, onSelect, options, qrValueType }) {
  const holder = useRef(null)
  const [width, setWidth] = useState(360)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(540, entry.contentRect.width)))
    observer.observe(holder.current)
    return () => observer.disconnect()
  }, [])
  const layout = sheetLayout(template, margin, gap)
  const size = LABEL_TEMPLATES[template]
  const scale = width / (210 * 96 / 25.4)
  return <div ref={holder} className="w-full">
    <div className="mx-auto overflow-hidden bg-white shadow-medium" style={{ width, height: width * 297 / 210 }}>
      <div style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', padding: margin + 'mm',
        display: 'grid', gridTemplateColumns: 'repeat(' + layout.columns + ',' + size.width + 'mm)',
        gridTemplateRows: 'repeat(' + layout.rows + ',' + size.height + 'mm)', alignContent: 'start',
        gap: gap + 'mm', transform: 'scale(' + scale + ')', transformOrigin: 'top left' }}>
        {getLabelPage(queue, skip, page, layout.capacity).map((asset, index) => asset
          ? <button type="button" key={index} aria-label={'Preview ' + labelCode(asset)} onClick={() => onSelect(asset.id)}
              className={asset.id === selectedId ? 'outline outline-2 outline-brand-500' : ''}
              style={{ width: size.width + 'mm', height: size.height + 'mm' }}>
              <AssetLabel asset={asset} template={template} options={options} qrValueType={qrValueType}/>
            </button>
          : <div key={index} title="Already used position" className="flex items-center justify-center border border-dashed border-gray-300 bg-gray-100 text-xs text-gray-400">Used</div>)}
      </div>
    </div>
  </div>
}

export default function PrintLabelsModal({ isOpen, onClose, initialAssets = EMPTY_ASSETS }) {
  const dialog = useRef(null)
  const initial = useRef(initialAssets)
  initial.current = initialAssets
  const headingId = useId()
  const [queue, setQueue] = useState([])
  const [tab, setTab] = useState('queue')
  const [template, setTemplate] = useState('standard')
  const [mode, setMode] = useState('sheet')
  const [companyName, setCompanyName] = useState('ASSET MANAGEMENT')
  const [options, setOptions] = useState(DEFAULT_LABEL_OPTIONS)
  const [qrValueType, setQrValueType] = useState('code')
  const [margin, setMargin] = useState(8)
  const [gap, setGap] = useState(3)
  const [skip, setSkip] = useState(0)
  const [bulkQty, setBulkQty] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('label')
  const [zoom, setZoom] = useState(1.5)
  const [page, setPage] = useState(0)
  const [mobilePreview, setMobilePreview] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [notice, setNotice] = useState('')
  const [printJob, setPrintJob] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const unique = new Map()
    for (const asset of initial.current) {
      if (!asset?.id) continue
      const previous = unique.get(asset.id)
      unique.set(asset.id, { ...asset, printQty: boundedQty((previous?.printQty || 0) + (Number(asset.printQty) || 1)) })
    }
    const nextQueue = [...unique.values()]
    setQueue(nextQueue)
    setSelectedId(nextQueue[0]?.id ?? null)
    setQuery('')
    setResults([])
    setSearchError('')
    setNotice('')
    setPage(0)
    setSkip(0)
    setTab('queue')
    setMobilePreview(false)
    setPrintJob(null)
  }, [isOpen])

  useEffect(() => {
    const node = dialog.current
    if (isOpen && !node.open) node.showModal()
    if (!isOpen && node.open) node.close()
    return () => { if (node.open) node.close() }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setResults([])
    setSearching(true)
    setSearchError('')
    const timer = setTimeout(() => {
      getAssets({ search: query.trim(), pageSize: 8 }, controller.signal)
        .then(({ data }) => {
          if (!controller.signal.aborted) setResults(Array.isArray(data) ? data : data.data || [])
        })
        .catch(() => { if (!controller.signal.aborted) setSearchError('Assets could not be searched. Try again.') })
        .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [isOpen, query])

  const size = LABEL_TEMPLATES[template]
  const sheetMargin = Math.min(25, Math.max(0, Number(margin) || 0))
  const sheetGap = Math.min(20, Math.max(0, Number(gap) || 0))
  const layout = sheetLayout(template, sheetMargin, sheetGap)
  const usedSlots = mode === 'sheet' ? Math.min(skip, layout.capacity - 1) : 0
  const total = useMemo(() => queue.reduce((sum, asset) => sum + asset.printQty, 0), [queue])
  const pages = total ? mode === 'sheet' ? Math.ceil((total + usedSlots) / layout.capacity) : total : 0
  const currentPage = Math.min(page, Math.max(0, pages - 1))
  const selected = queue.find(asset => asset.id === selectedId) || queue[0]
  const labelOptions = { ...options, companyName }
  const hasQr = size.fields.includes('showQr') && options.showQr
  const hasBarcode = size.fields.includes('showBarcode') && options.showBarcode
  const invalidBarcode = hasBarcode && queue.some(asset => !/^[\x20-\x7e]+$/.test(labelCode(asset)))
  const canPrint = total > 0 && total <= 1000 && !invalidBarcode

  function setCopies(id, value) {
    setQueue(current => current.map(asset => asset.id === id ? { ...asset, printQty: boundedQty(value) } : asset))
  }
  function add(asset) {
    setQueue(current => current.some(item => item.id === asset.id)
      ? current.map(item => item.id === asset.id ? { ...item, printQty: boundedQty(item.printQty + 1) } : item)
      : [...current, { ...asset, printQty: 1 }])
    setSelectedId(asset.id)
    setQuery('')
    setNotice('Added ' + labelCode(asset) + ' to the print queue.')
  }
  function preparePrint() {
    if (!canPrint) return
    setPrintJob({ queue, template, mode, options: labelOptions, qrValueType, margin: sheetMargin, gap: sheetGap, skip: usedSlots })
    setNotice('')
  }

  return <dialog ref={dialog} aria-labelledby={headingId} onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}
    className="m-auto w-[calc(100%-1rem)] max-w-7xl overflow-hidden rounded-3xl border border-cream-200 bg-white p-0 text-ink-900 shadow-medium backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:w-[calc(100%-3rem)]">
    <div className="flex max-h-[94dvh] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-cream-200 px-4 py-4 dark:border-gray-700 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-gradient text-white"><Barcode size={24}/></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 id={headingId} className="text-xl font-bold tracking-tight">Label Studio</h2>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">ASSET TAGS</span></div>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-gray-400">Build your queue. Design the tag. Check the paper.</p>
          </div>
        </div>
        <button type="button" aria-label="Close Label Studio" onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-cream-100 dark:hover:bg-gray-800"><X size={19}/></button>
      </header>

      <div className={(printJob ? 'hidden ' : 'flex lg:hidden ') + 'shrink-0 gap-2 border-b border-cream-200 p-3 dark:border-gray-700'}>
        <button type="button" aria-pressed={!mobilePreview} onClick={() => setMobilePreview(false)} className={mobilePreview ? 'btn-secondary' : 'btn-primary'}><Settings2 size={14}/> Setup</button>
        <button type="button" aria-pressed={mobilePreview} onClick={() => setMobilePreview(true)} className={mobilePreview ? 'btn-primary' : 'btn-secondary'}><Eye size={14}/> Preview</button>
      </div>

      {printJob ? <div className="min-h-0 flex-1" style={{ height: '68dvh' }}><LabelPrintView job={printJob}/></div> :
      <div className="grid min-h-0 flex-1 lg:grid-cols-[350px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
        <section aria-label="Label settings" className={(mobilePreview ? 'hidden lg:flex ' : 'flex ') + 'min-h-0 flex-col border-r border-cream-200 dark:border-gray-700'}>
          <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-cream-200 p-2 dark:border-gray-700" role="group" aria-label="Setup sections">
            {TABS.map(({ id, name, icon: Icon }) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}
              className={'flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-semibold ' + (tab === id
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-ink-500 hover:bg-cream-100 dark:text-gray-400 dark:hover:bg-gray-800')}>
              <Icon size={16}/>{name}
            </button>)}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {tab === 'queue' && <div className="space-y-4">
              <div>
                <label htmlFor={headingId + '-search'} className="mb-2 block text-sm font-bold">Add assets</label>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-ink-400"/>
                  <input id={headingId + '-search'} value={query} onChange={event => setQuery(event.target.value)}
                    placeholder="Code, serial number or asset name" autoComplete="off" className="input-field pl-9 text-sm"/>
                </div>
                {query.trim().length >= 2 && <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-cream-200 dark:border-gray-700">
                  {searching || searchError || !results.length
                    ? <p role="status" className="p-3 text-xs text-ink-500 dark:text-gray-400">{searching ? 'Searching…' : searchError || 'No matching assets.'}</p>
                    : results.map(asset => <button type="button" key={asset.id} onClick={() => add(asset)}
                      className="flex w-full items-center justify-between gap-2 border-b border-cream-100 p-3 text-left last:border-0 hover:bg-brand-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      <span className="min-w-0"><span className="block font-mono text-xs font-bold text-brand-700 dark:text-brand-300">{labelCode(asset)}</span>
                        <span className="block truncate text-xs">{asset.name}</span></span>
                      <Plus size={16} className="shrink-0 text-brand-600"/>
                    </button>)}
                </div>}
              </div>

              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">Print queue <span className="font-normal text-ink-500 dark:text-gray-400">({queue.length})</span></h3>
                {!!queue.length && <button type="button" onClick={() => { setQueue([]); setNotice('Print queue cleared.') }}
                  className="text-xs text-red-600 dark:text-red-400">Clear queue</button>}
              </div>
              {!!queue.length && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-100 p-2.5 text-xs dark:bg-gray-800">
                <label className="flex items-center gap-2">Copies each
                  <input type="number" aria-label="Copies for all assets" min={1} max={99} value={bulkQty}
                    onChange={event => setBulkQty(event.target.value)} onBlur={() => setBulkQty(boundedQty(bulkQty))}
                    className="w-14 rounded-lg border border-cream-200 bg-white p-1.5 text-center dark:border-gray-600 dark:bg-gray-900"/>
                </label>
                <button type="button" className="ml-auto font-semibold text-brand-700 dark:text-brand-300"
                  onClick={() => setQueue(current => current.map(asset => ({ ...asset, printQty: boundedQty(bulkQty) })))}>Apply to all</button>
              </div>}
              {!queue.length ? <div className="rounded-2xl border border-dashed border-cream-300 px-4 py-9 text-center dark:border-gray-600">
                <Tag size={28} className="mx-auto mb-3 text-brand-400"/>
                <p className="text-sm font-semibold">Your next batch starts here</p>
                <p className="mt-1 text-xs text-ink-500 dark:text-gray-400">Find an asset above or select assets from the register.</p>
              </div> : <div className="space-y-2">
                {queue.map(asset => <div key={asset.id} className={'rounded-xl border p-3 ' + (selected?.id === asset.id
                  ? 'border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-900/10' : 'border-cream-200 dark:border-gray-700')}>
                  <button type="button" aria-label={'Preview ' + labelCode(asset)} onClick={() => { setSelectedId(asset.id); setView('label') }} className="block w-full min-w-0 text-left">
                    <span className="block font-mono text-xs font-bold">{labelCode(asset)}</span>
                    <span className="mt-1 block truncate text-xs text-ink-600 dark:text-gray-300" title={asset.name}>{asset.name}</span>
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={'Fewer copies of ' + labelCode(asset)} disabled={asset.printQty <= 1}
                        onClick={() => setCopies(asset.id, asset.printQty - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white disabled:opacity-40 dark:bg-gray-800"><Minus size={12}/></button>
                      <input type="number" aria-label={'Copies of ' + labelCode(asset)} min={1} max={99} value={asset.printQty}
                        onChange={event => setCopies(asset.id, event.target.value)}
                        className="h-7 w-12 rounded-lg border border-cream-200 bg-white text-center text-xs dark:border-gray-600 dark:bg-gray-800"/>
                      <button type="button" aria-label={'More copies of ' + labelCode(asset)} disabled={asset.printQty >= 99}
                        onClick={() => setCopies(asset.id, asset.printQty + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white disabled:opacity-40 dark:bg-gray-800"><Plus size={12}/></button>
                    </div>
                    <button type="button" aria-label={'Remove ' + labelCode(asset)} onClick={() => setQueue(current => current.filter(item => item.id !== asset.id))}
                      className="p-1.5 text-ink-400 hover:text-red-600"><Trash2 size={14}/></button>
                  </div>
                </div>)}
              </div>}
            </div>}

            {tab === 'design' && <div className="space-y-5">
              <div><h3 className="text-sm font-bold">Choose a label</h3><p className="mt-1 text-xs text-ink-500 dark:text-gray-400">Physical dimensions apply to both preview and print.</p></div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(LABEL_TEMPLATES).map(([id, item]) => <button type="button" key={id} aria-pressed={template === id}
                  onClick={() => { setTemplate(id); setPage(0) }} className={'relative space-y-2 rounded-2xl border p-3 text-left ' + (template === id
                    ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/20' : 'border-cream-200 hover:bg-cream-50 dark:border-gray-700 dark:hover:bg-gray-800')}>
                  <span className="flex items-center justify-between"><Tag size={18} className="text-brand-600"/>{template === id && <Check size={15} className="text-brand-600"/>}</span>
                  <span className="block text-xs font-bold">{item.name}</span>
                  <span className="block text-[11px] text-ink-500 dark:text-gray-400">{item.width} × {item.height} mm</span>
                </button>)}
              </div>
              <p className="text-xs text-ink-500 dark:text-gray-400">{size.description}</p>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Organization name</span>
                <input value={companyName} maxLength={60} onChange={event => setCompanyName(event.target.value)} className="input-field"/>
              </label>
              <fieldset className="space-y-2"><legend className="mb-2 text-xs font-bold">Visible on this label</legend>
                {size.fields.map(key => <label key={key} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-cream-200 p-3 text-xs dark:border-gray-700">
                  {LABEL_FIELDS[key]}<input type="checkbox" checked={options[key]} onChange={event => setOptions(current => ({ ...current, [key]: event.target.checked }))}
                    className="h-4 w-4 accent-brand-500"/>
                </label>)}
              </fieldset>
              {hasQr && <label className="block space-y-1.5"><span className="text-xs font-semibold">QR code opens / contains</span>
                <select className="input-field" value={qrValueType} onChange={event => setQrValueType(event.target.value)}>
                  <option value="code">Asset code</option><option value="url">Asset detail page</option>
                </select>
                {qrValueType === 'url' && <span className="block text-xs text-ink-500 dark:text-gray-400">Uses this site’s address. Scanning requires access to this application.</span>}
              </label>}
            </div>}

            {tab === 'layout' && <div className="space-y-5">
              <div><h3 className="text-sm font-bold">Match your paper</h3><p className="mt-1 text-xs text-ink-500 dark:text-gray-400">Check your stock’s dimensions before printing a batch.</p></div>
              <div className="grid grid-cols-2 gap-2">
                {[['sheet', 'A4 sheet', LayoutGrid], ['roll', 'Thermal roll', Layers]].map(([id, name, Icon]) => <button type="button" key={id} aria-pressed={mode === id}
                  onClick={() => { setMode(id); setPage(0); setView(id === 'sheet' ? 'sheet' : 'label') }}
                  className={'flex flex-col gap-2 rounded-2xl border p-4 text-left text-xs font-semibold ' + (mode === id
                    ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300' : 'border-cream-200 dark:border-gray-700')}>
                  <Icon size={22}/>{name}
                </button>)}
              </div>
              {mode === 'sheet' ? <>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Page margin" unit="mm" value={margin} min={0} max={25} onChange={setMargin}/>
                  <NumberField label="Label gap" unit="mm" value={gap} min={0} max={20} onChange={setGap}/>
                </div>
                <div className="rounded-xl bg-cream-100 p-3 text-xs dark:bg-gray-800">
                  <p className="font-semibold">{layout.columns} columns × {layout.rows} rows</p><p className="mt-1 text-ink-500 dark:text-gray-400">{layout.capacity} labels fit on each A4 sheet.</p>
                </div>
                <label className="block space-y-1.5"><span className="text-xs font-semibold">First sheet starts at position</span>
                  <select className="input-field" value={usedSlots} onChange={event => { setSkip(Number(event.target.value)); setPage(0); setView('sheet') }}>
                    {Array.from({ length: layout.capacity }, (_, index) => <option key={index} value={index}>{index + 1}{index === 0 ? ' · New sheet' : ' · Row ' + (Math.floor(index / layout.columns) + 1) + ', column ' + (index % layout.columns + 1)}</option>)}
                  </select>
                  <span className="block text-xs leading-relaxed text-ink-500 dark:text-gray-400">Skip positions already used on the first sheet. Positions run left to right.</span>
                </label>
              </> : <div className="rounded-xl bg-cream-100 p-4 text-xs leading-relaxed dark:bg-gray-800">
                One label per page, at {size.width} × {size.height} mm. Select this paper size in your printer settings.
              </div>}
            </div>}
          </div>
        </section>

        <section aria-label="Label preview" className={(mobilePreview ? 'flex ' : 'hidden lg:flex ') + 'min-h-0 min-w-0 flex-col bg-[#f0ece5] dark:bg-gray-950'}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cream-200 bg-white/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex rounded-xl bg-white p-1 text-xs shadow-sm dark:bg-gray-800">
              <button type="button" aria-pressed={view === 'label'} onClick={() => setView('label')} className={'rounded-lg px-3 py-1.5 font-semibold ' + (view === 'label' ? 'bg-ink-900 text-white dark:bg-gray-100 dark:text-gray-900' : '')}>Label</button>
              {mode === 'sheet' && <button type="button" aria-pressed={view === 'sheet'} onClick={() => setView('sheet')} className={'rounded-lg px-3 py-1.5 font-semibold ' + (view === 'sheet' ? 'bg-ink-900 text-white dark:bg-gray-100 dark:text-gray-900' : '')}>A4 layout</button>}
            </div>
            {view === 'label' && <label className="flex items-center gap-2 text-xs text-ink-500 dark:text-gray-400">Zoom
              <select aria-label="Preview zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="rounded-lg border border-cream-200 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-800">
                <option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option>
              </select>
            </label>}
            <span className="text-xs font-medium text-ink-500 dark:text-gray-400">{size.width} × {size.height} mm</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            {!selected ? <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Printer size={40} className="mb-4 text-ink-300 dark:text-gray-600"/>
              <h3 className="font-bold">A place for every asset</h3><p className="mt-2 max-w-xs text-sm text-ink-500 dark:text-gray-400">Add assets to build your labels. Your preview will appear here.</p>
            </div> : view === 'sheet' && mode === 'sheet'
              ? <SheetPreview queue={queue} template={template} margin={sheetMargin} gap={sheetGap} skip={usedSlots}
                  page={currentPage} selectedId={selected.id} onSelect={setSelectedId} options={labelOptions} qrValueType={qrValueType}/>
              : <div className="flex min-h-[340px] flex-col items-center justify-center gap-6">
                <div className="w-full text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-gray-400">Live label preview</p>
                  <p className="mt-1 font-mono text-xs font-semibold">{labelCode(selected)}</p>
                </div>
                <div className="max-w-full overflow-auto px-3 py-6">
                  <div className="rounded-2xl bg-white p-5 shadow-medium" style={{ width: size.width * 96 / 25.4 * zoom + 40, height: size.height * 96 / 25.4 * zoom + 40 }}>
                    <div style={{ width: size.width + 'mm', height: size.height + 'mm', transform: 'scale(' + zoom + ')', transformOrigin: 'top left' }}>
                      <AssetLabel asset={selected} template={template} options={labelOptions} qrValueType={qrValueType}/>
                    </div>
                  </div>
                </div>
                <p className="max-w-sm text-center text-xs leading-relaxed text-ink-500 dark:text-gray-400">Preview zoom changes the display only. Printed labels use the dimensions above.</p>
              </div>}
          </div>

          {selected && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-cream-200 bg-white/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="min-w-0"><p className="text-xs font-semibold">{size.name}</p><p className="mt-1 text-[11px] text-ink-500 dark:text-gray-400">{hasQr ? 'QR' : ''}{hasQr && hasBarcode ? ' + ' : ''}{hasBarcode ? 'Code 128' : ''}{!hasQr && !hasBarcode ? 'Text only' : ''} · {mode === 'sheet' ? layout.capacity + ' labels per sheet' : 'One label per page'}</p></div>
            {view === 'sheet' && <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous preview sheet" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg bg-white p-1.5 disabled:opacity-30 dark:bg-gray-800"><ChevronLeft size={16}/></button>
              <span className="text-xs">{currentPage + 1} / {pages}</span>
              <button type="button" aria-label="Next preview sheet" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} className="rounded-lg bg-white p-1.5 disabled:opacity-30 dark:bg-gray-800"><ChevronRight size={16}/></button>
            </div>}
          </div>}
        </section>
      </div>}

      <footer className="shrink-0 border-t border-cream-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-6">
        {(notice || total > 1000 || invalidBarcode) && <p role="status" className="mb-2 text-xs text-brand-700 dark:text-brand-300">{total > 1000
          ? 'This batch exceeds 1,000 labels. Reduce copies or split the queue to print.' : invalidBarcode
            ? 'A queued asset code contains characters unsupported by Code 128. Choose a QR template or turn off the barcode.' : notice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <dl className="flex gap-4 text-xs sm:gap-6">
            <div><dt className="text-[10px] uppercase tracking-wide text-ink-500 dark:text-gray-400">Assets</dt><dd className="mt-0.5 text-base font-bold">{queue.length}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wide text-ink-500 dark:text-gray-400">Labels</dt><dd className="mt-0.5 text-base font-bold text-brand-600 dark:text-brand-400">{total}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wide text-ink-500 dark:text-gray-400">{mode === 'sheet' ? 'A4 sheets' : 'Roll labels'}</dt><dd className="mt-0.5 text-base font-bold">{pages}</dd></div>
          </dl>
          {printJob ? <button type="button" onClick={() => setPrintJob(null)} className="btn-secondary"><ChevronLeft size={16}/> Back to editor</button> :
            <button type="button" disabled={!canPrint} onClick={preparePrint} className="btn-primary disabled:opacity-40"><Printer size={16}/> Open print view</button>}
        </div>
      </footer>
    </div>
  </dialog>
}

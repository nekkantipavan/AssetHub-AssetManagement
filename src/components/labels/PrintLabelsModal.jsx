import { useState, useMemo, useEffect, useRef } from 'react'
import {
  X, Printer, Plus, Trash2, Sliders, LayoutGrid, RotateCcw,
  Search, Check, Copy, Tag, CheckSquare, Square, Layers
} from 'lucide-react'
import AssetLabel from './AssetLabel'
import { getAssets } from '../../data/api'

export default function PrintLabelsModal({
  isOpen,
  onClose,
  initialAssets = []
}) {
  // Print queue: [{ ...asset, printQty: 1 }]
  const [printQueue, setPrintQueue] = useState([])
  const [template, setTemplate] = useState('standard') // 'standard' | 'compact-qr' | 'industrial' | 'barcode-only'
  const [printMode, setPrintMode] = useState('sheet') // 'sheet' | 'roll'
  const [companyName, setCompanyName] = useState('ASSET MANAGEMENT')
  
  // Field toggles
  const [options, setOptions] = useState({
    showCompany: true,
    showBarcode: true,
    showQr: true,
    showSerial: true,
    showDeptPlant: true,
    showAssigned: false,
    showCategory: true,
  })

  // Quick asset search for adding to queue
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchRef = useRef(null)

  // Initialize queue when modal opens with provided assets
  useEffect(() => {
    if (isOpen) {
      if (initialAssets && initialAssets.length > 0) {
        setPrintQueue(initialAssets.map(a => ({ ...a, printQty: a.printQty || 1 })))
      } else {
        setPrintQueue([])
      }
    }
  }, [isOpen, initialAssets])

  // Handle Search for adding more assets
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await getAssets({ search: searchQuery.trim(), pageSize: 10 })
        const list = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        setSearchResults(list)
        setShowSearchDropdown(true)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addAssetToQueue(asset) {
    setPrintQueue(prev => {
      const existing = prev.find(item => item.id === asset.id)
      if (existing) {
        return prev.map(item => item.id === asset.id ? { ...item, printQty: item.printQty + 1 } : item)
      }
      return [...prev, { ...asset, printQty: 1 }]
    })
    setSearchQuery('')
    setShowSearchDropdown(false)
  }

  function updateQty(assetId, delta) {
    setPrintQueue(prev => prev.map(item => {
      if (item.id === assetId) {
        const newQty = Math.max(1, item.printQty + delta)
        return { ...item, printQty: newQty }
      }
      return item
    }))
  }

  function removeAsset(assetId) {
    setPrintQueue(prev => prev.filter(item => item.id !== assetId))
  }

  function setAllQuantities(qty) {
    setPrintQueue(prev => prev.map(item => ({ ...item, printQty: Math.max(1, qty) })))
  }

  // Flattened array of all labels according to print quantities
  const expandedLabels = useMemo(() => {
    const list = []
    printQueue.forEach(item => {
      const qty = item.printQty || 1
      for (let i = 0; i < qty; i++) {
        list.push({ ...item, _labelIndex: `${item.id}-${i}` })
      }
    })
    return list
  }, [printQueue])

  const totalLabelCount = expandedLabels.length

  // Trigger Print
  function handlePrint() {
    window.print()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
         style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)' }}>
      
      {/* Modal Container */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden border border-cream-300 dark:border-gray-800">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-800 flex items-center justify-between bg-cream-50/70 dark:bg-gray-850/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <Printer size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-900 dark:text-gray-100 flex items-center gap-2">
                Print Asset Barcode & QR Labels
                {totalLabelCount > 0 && (
                  <span className="text-xs bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 px-2.5 py-0.5 rounded-full font-semibold">
                    {totalLabelCount} {totalLabelCount === 1 ? 'label' : 'labels'}
                  </span>
                )}
              </h2>
              <p className="text-xs text-ink-400 dark:text-gray-400">
                Generate high-resolution thermal and adhesive asset tags with 1D/2D Barcodes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-2xl hover:bg-cream-200 dark:hover:bg-gray-800 flex items-center justify-center text-ink-400 hover:text-ink-700 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Two columns (Controls & Queue on Left, Live Preview on Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          
          {/* Left Panel: Configuration & Asset Selection (5 cols) */}
          <div className="lg:col-span-5 border-r border-cream-200 dark:border-gray-800 p-5 overflow-y-auto space-y-5 bg-white dark:bg-gray-900">
            
            {/* Quick Add Asset Search */}
            <div className="space-y-1.5" ref={searchRef}>
              <label className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <Plus size={13} className="text-brand-600"/> Add Assets to Print Queue
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
                  placeholder="Search by code, serial, or name…"
                  className="w-full pl-9 pr-4 py-2 bg-cream-100 dark:bg-gray-800 rounded-xl text-xs text-ink-900 dark:text-gray-100 placeholder-ink-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400 border border-cream-200 dark:border-gray-700"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 animate-pulse">Searching…</span>
                )}

                {/* Dropdown Results */}
                {showSearchDropdown && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-cream-200 dark:border-gray-700 max-h-56 overflow-y-auto z-20 divide-y divide-cream-100 dark:divide-gray-700">
                    {searchResults.map(a => (
                      <div
                        key={a.id}
                        onClick={() => addAssetToQueue(a)}
                        className="p-2.5 hover:bg-brand-50 dark:hover:bg-brand-900/20 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-mono font-bold text-brand-600 dark:text-brand-400">{a.asset_code}</div>
                          <div className="text-ink-800 dark:text-gray-200 truncate font-medium">{a.name}</div>
                          <div className="text-[10px] text-ink-400">{a.category} · {a.plant_name || a.dept_name || 'No location'}</div>
                        </div>
                        <button className="px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded-lg text-[10px] font-bold hover:bg-brand-200">
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Queue List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wider">
                  Selected Assets ({printQueue.length})
                </span>
                {printQueue.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      onClick={() => setAllQuantities(1)}
                      className="text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      All 1×
                    </button>
                    <span className="text-cream-300 dark:text-gray-700">|</span>
                    <button
                      onClick={() => setPrintQueue([])}
                      className="text-red-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {printQueue.length === 0 ? (
                <div className="p-6 border-2 border-dashed border-cream-200 dark:border-gray-800 rounded-2xl text-center text-xs text-ink-400 dark:text-gray-500">
                  <Tag size={24} className="mx-auto mb-1.5 opacity-40 text-brand-500" />
                  No assets in print queue.
                  <p className="text-[10px] text-ink-300 dark:text-gray-500 mt-1">
                    Search above or check assets from the table.
                  </p>
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {printQueue.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-cream-50 dark:bg-gray-800 border border-cream-200 dark:border-gray-700 text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-mono font-bold text-ink-900 dark:text-gray-100 flex items-center gap-1.5">
                          <span>{item.asset_code}</span>
                          {item.sub_sequence > 0 && <span className="text-[10px] text-brand-600">/{item.sub_sequence}</span>}
                        </div>
                        <div className="text-[11px] text-ink-500 dark:text-gray-400 truncate">{item.name}</div>
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white dark:bg-gray-700 border border-cream-300 dark:border-gray-600 font-bold hover:bg-cream-100 flex items-center justify-center text-xs"
                        >
                          -
                        </button>
                        <span className="w-7 text-center font-mono font-bold text-xs">{item.printQty}</span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="w-6 h-6 rounded-lg bg-white dark:bg-gray-700 border border-cream-300 dark:border-gray-600 font-bold hover:bg-cream-100 flex items-center justify-center text-xs"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeAsset(item.id)}
                          className="p-1 text-ink-300 hover:text-red-500 ml-1 rounded-lg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Template Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wider block">
                Label Template & Size
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'standard', name: 'Standard Tag', desc: '50×25mm · QR + Barcode' },
                  { id: 'compact-qr', name: 'Compact QR', desc: '35×35mm · Square Tag' },
                  { id: 'industrial', name: 'Industrial Plate', desc: '75×50mm · Full Spec' },
                  { id: 'barcode-only', name: 'Barcode Only', desc: '50×25mm · 1D Linear' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`p-2.5 text-left rounded-2xl border transition-all text-xs ${
                      template === t.id
                        ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 ring-2 ring-brand-400/20'
                        : 'border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="font-bold">{t.name}</div>
                    <div className="text-[10px] text-ink-400 dark:text-gray-400">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Print Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wider block">
                Print Sheet / Roll Mode
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintMode('sheet')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    printMode === 'sheet'
                      ? 'bg-ink-900 dark:bg-gray-100 text-white dark:text-ink-900 border-transparent'
                      : 'border-cream-200 dark:border-gray-700 text-ink-600 dark:text-gray-400'
                  }`}
                >
                  <LayoutGrid size={13} /> A4 / Multi Grid
                </button>
                <button
                  onClick={() => setPrintMode('roll')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    printMode === 'roll'
                      ? 'bg-ink-900 dark:bg-gray-100 text-white dark:text-ink-900 border-transparent'
                      : 'border-cream-200 dark:border-gray-700 text-ink-600 dark:text-gray-400'
                  }`}
                >
                  <Layers size={13} /> Thermal Roll (1 per page)
                </button>
              </div>
            </div>

            {/* Custom Header */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wider block">
                Header Text / Organization
              </label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. COMPANY ASSET"
                className="w-full px-3 py-2 bg-cream-100 dark:bg-gray-800 rounded-xl text-xs text-ink-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400 border border-cream-200 dark:border-gray-700"
              />
            </div>

            {/* Field Toggles */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-700 dark:text-gray-300 uppercase tracking-wider block">
                Visible Elements
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { key: 'showCompany', label: 'Company Header' },
                  { key: 'showQr', label: 'QR Code' },
                  { key: 'showBarcode', label: '1D Barcode' },
                  { key: 'showSerial', label: 'Serial Number' },
                  { key: 'showDeptPlant', label: 'Plant / Dept' },
                  { key: 'showCategory', label: 'Category' },
                  { key: 'showAssigned', label: 'Assigned User' },
                ].map(item => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-cream-50 dark:hover:bg-gray-800 cursor-pointer text-ink-700 dark:text-gray-300 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={options[item.key]}
                      onChange={e => setOptions(p => ({ ...p, [item.key]: e.target.checked }))}
                      className="rounded text-brand-600 focus:ring-brand-400 h-3.5 w-3.5"
                    />
                    <span className="text-[11px]">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

          </div>

          {/* Right Panel: Live Preview & Print Container (7 cols) */}
          <div className="lg:col-span-7 bg-cream-100/60 dark:bg-gray-950 p-6 flex flex-col justify-between overflow-hidden">
            
            {/* Top Preview Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-cream-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink-800 dark:text-gray-200">Live Print Preview</span>
                <span className="text-[10px] text-ink-400 font-mono">({template} · {printMode})</span>
              </div>
              <span className="text-xs text-ink-500 dark:text-gray-400">
                Ready to print <b>{totalLabelCount}</b> {totalLabelCount === 1 ? 'sticker' : 'stickers'}
              </span>
            </div>

            {/* Scrollable Preview Container */}
            <div className="flex-1 overflow-y-auto py-6 flex items-start justify-center">
              {expandedLabels.length === 0 ? (
                <div className="my-auto text-center text-ink-300 dark:text-gray-600">
                  <Printer size={40} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No labels selected for preview</p>
                  <p className="text-xs mt-1">Add assets from the left panel or check assets in table.</p>
                </div>
              ) : (
                <div className={`print-labels-container p-4 bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-cream-300 dark:border-gray-800 flex flex-wrap gap-4 items-center justify-center max-w-full ${
                  printMode === 'roll' ? 'flex-col' : 'flex-row'
                }`}>
                  {expandedLabels.map((asset) => (
                    <div key={asset._labelIndex} className="print-label-item transition-transform hover:scale-105 duration-150">
                      <AssetLabel
                        asset={asset}
                        template={template}
                        options={{ ...options, companyName }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-4 border-t border-cream-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-xs text-ink-400 dark:text-gray-400">
                Tip: Thermal roll printers will automatically size to single labels.
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-2xl border border-cream-300 dark:border-gray-700 text-xs font-semibold text-ink-600 dark:text-gray-300 hover:bg-cream-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePrint}
                  disabled={expandedLabels.length === 0}
                  className="px-6 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center gap-2 transition-all"
                >
                  <Printer size={15} />
                  Print {totalLabelCount > 0 ? `${totalLabelCount} Labels` : 'Labels'}
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Hidden dedicated Printable Container for Clean Native Printing */}
      <div id="ams-printable-labels-area" className="hidden print:block">
        <div className={`ams-print-sheet ${printMode === 'roll' ? 'ams-thermal-roll' : 'ams-multi-sheet'}`}>
          {expandedLabels.map((asset) => (
            <div key={`print-native-${asset._labelIndex}`} className="ams-single-label-page">
              <AssetLabel
                asset={asset}
                template={template}
                options={{ ...options, companyName }}
              />
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

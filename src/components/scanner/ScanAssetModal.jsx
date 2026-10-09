import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Camera, Keyboard, Upload, RefreshCw, Eye, Printer, Plus,
  CheckCircle, AlertCircle, Zap, ShieldCheck, Box, ExternalLink,
  Volume2, VolumeX, ArrowRight
} from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Badge } from '../common/Badge'
import { getAssets, getAsset } from '../../data/api'

// Audio tone synthesizer for barcode scan beep
function playScanBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime) // 1.2 kHz crisp beep
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.12)
  } catch (e) {
    // Audio context not allowed or unsupported
  }
}

const formatINR = v =>
  v == null || v === '' ? '—'
  : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export default function ScanAssetModal({
  isOpen,
  onClose,
  onOpenPrintLabel,
  onOpenCreateAsset
}) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('camera') // 'camera' | 'manual' | 'upload'
  
  // Camera scanning states
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [isCameraRunning, setIsCameraRunning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Manual code state
  const [manualCode, setManualCode] = useState('')
  const manualInputRef = useRef(null)

  // File upload state
  const [uploadError, setUploadError] = useState('')
  const [isProcessingFile, setIsProcessingFile] = useState(false)

  // Asset Lookup State
  const [isSearching, setIsSearching] = useState(false)
  const [scannedCode, setScannedCode] = useState('')
  const [matchedAsset, setMatchedAsset] = useState(null)
  const [lookupError, setLookupError] = useState('')

  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      stopCameraScanner()
      setMatchedAsset(null)
      setScannedCode('')
      setLookupError('')
      setCameraError('')
      setUploadError('')
      setManualCode('')
    } else {
      setMatchedAsset(null)
      setScannedCode('')
      setLookupError('')
      setCameraError('')
      if (activeTab === 'manual') {
        setTimeout(() => manualInputRef.current?.focus(), 150)
      }
    }
  }, [isOpen])

  // Process and lookup code
  const handleCodeDetected = useCallback(async (rawDecodedText) => {
    if (!rawDecodedText) return
    const text = String(rawDecodedText).trim()
    if (!text) return

    if (soundEnabled) playScanBeep()
    setScannedCode(text)
    setIsSearching(true)
    setLookupError('')
    setMatchedAsset(null)

    // Stop camera while showing results
    stopCameraScanner()

    try {
      // 1. Check if rawDecodedText is a URL (e.g. https://.../assets/123 or /assets/123)
      let parsedAssetId = null
      let cleanCode = text

      const assetUrlMatch = text.match(/\/assets\/(\d+)/i)
      if (assetUrlMatch && assetUrlMatch[1]) {
        parsedAssetId = assetUrlMatch[1]
      }

      // 2. Check if rawDecodedText is a JSON payload { id: ..., code: ... }
      if (text.startsWith('{') && text.endsWith('}')) {
        try {
          const parsed = JSON.parse(text)
          if (parsed.id) parsedAssetId = parsed.id
          if (parsed.code) cleanCode = parsed.code
        } catch (e) {
          // ignore json parse error
        }
      }

      // If ID found, fetch direct asset
      if (parsedAssetId) {
        try {
          const res = await getAsset(parsedAssetId)
          if (res?.data?.asset) {
            setMatchedAsset(res.data.asset)
            setIsSearching(false)
            return
          }
        } catch (err) {
          // fallback to search
        }
      }

      // Query asset by search text (asset_code, serial_number, name)
      const res = await getAssets({ search: cleanCode, pageSize: 10 })
      const list = Array.isArray(res?.data) ? res.data : (res?.data?.data || [])

      if (list && list.length > 0) {
        // Find exact match on asset_code or serial_number or sub_asset_code
        const exact = list.find(a => 
          a.asset_code?.toLowerCase() === cleanCode.toLowerCase() ||
          a.serial_number?.toLowerCase() === cleanCode.toLowerCase() ||
          `${a.asset_code}-${a.sub_sequence}`.toLowerCase() === cleanCode.toLowerCase() ||
          `${a.asset_code} ${a.sub_sequence}`.toLowerCase() === cleanCode.toLowerCase()
        ) || list[0] // fallback to first match

        // Fetch full asset data to get plant, dept, etc.
        try {
          const fullRes = await getAsset(exact.id)
          setMatchedAsset(fullRes?.data?.asset || exact)
        } catch (e) {
          setMatchedAsset(exact)
        }
      } else {
        setLookupError(`No registered asset found matching "${cleanCode}".`)
      }
    } catch (err) {
      setLookupError(err.response?.data?.error || 'Failed to lookup asset information.')
    } finally {
      setIsSearching(false)
    }
  }, [soundEnabled])

  // Camera initialization
  const startCameraScanner = useCallback(async (cameraId = null) => {
    if (!scannerRef.current) return
    setCameraError('')
    
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('ams-qr-reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        })
      }

      const devices = await Html5Qrcode.getCameras()
      setCameras(devices || [])

      let targetCam = cameraId
      if (!targetCam && devices && devices.length > 0) {
        // Prioritize back/environment camera if available
        const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') || d.label.toLowerCase().includes('environment'))
        targetCam = backCam ? backCam.id : devices[devices.length - 1].id
      }

      if (targetCam) {
        setSelectedCameraId(targetCam)
        await html5QrCodeRef.current.start(
          targetCam,
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleCodeDetected(decodedText)
          },
          (errorMessage) => {
            // normal frame scan misses, ignore
          }
        )
        setIsCameraRunning(true)
      } else {
        setCameraError('No video camera detected on this device.')
      }
    } catch (err) {
      console.error('Camera start error:', err)
      setCameraError(typeof err === 'string' ? err : err.message || 'Unable to access camera. Please check browser permissions.')
      setIsCameraRunning(false)
    }
  }, [handleCodeDetected])

  const stopCameraScanner = useCallback(async () => {
    if (html5QrCodeRef.current && isCameraRunning) {
      try {
        await html5QrCodeRef.current.stop()
      } catch (err) {
        console.warn('Camera stop err:', err)
      }
      setIsCameraRunning(false)
    }
  }, [isCameraRunning])

  // Lifecycle for camera tab
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !matchedAsset && !isSearching) {
      const timer = setTimeout(() => {
        startCameraScanner(selectedCameraId)
      }, 300)
      return () => {
        clearTimeout(timer)
        stopCameraScanner()
      }
    } else {
      stopCameraScanner()
    }
  }, [isOpen, activeTab, matchedAsset, isSearching, startCameraScanner, stopCameraScanner, selectedCameraId])

  // Handle Image File Upload
  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')
    setIsProcessingFile(true)

    try {
      const html5QrCode = new Html5Qrcode('ams-file-scanner-temp')
      const decodedText = await html5QrCode.scanFile(file, true)
      handleCodeDetected(decodedText)
    } catch (err) {
      setUploadError('Could not detect a valid Barcode or QR Code in this image. Please try a clearer photo.')
    } finally {
      setIsProcessingFile(false)
      e.target.value = ''
    }
  }

  // Handle Manual Code Submit
  function handleManualSubmit(e) {
    e.preventDefault()
    if (!manualCode.trim()) return
    handleCodeDetected(manualCode.trim())
  }

  function handleResetScan() {
    setMatchedAsset(null)
    setScannedCode('')
    setLookupError('')
    setManualCode('')
    if (activeTab === 'camera') {
      setTimeout(() => startCameraScanner(selectedCameraId), 150)
    } else if (activeTab === 'manual') {
      setTimeout(() => manualInputRef.current?.focus(), 150)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
         style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)' }}>
      
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden border border-cream-300 dark:border-gray-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-800 flex items-center justify-between bg-cream-50/70 dark:bg-gray-850/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-900 dark:text-gray-100 flex items-center gap-2">
                Scan Asset Tag & Barcode
              </h2>
              <p className="text-xs text-ink-400 dark:text-gray-400">
                Scan 2D QR Code, 1D Barcode or enter Asset Tag to lookup instantly
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

        {/* Mode Tabs (Only when not viewing asset result) */}
        {!matchedAsset && (
          <div className="px-6 pt-4 flex items-center justify-between border-b border-cream-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveTab('camera'); setLookupError('') }}
                className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all ${
                  activeTab === 'camera'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-gray-300'
                }`}
              >
                <Camera size={14} /> Camera Scanner
              </button>
              <button
                onClick={() => { setActiveTab('manual'); setLookupError(''); setTimeout(() => manualInputRef.current?.focus(), 100) }}
                className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all ${
                  activeTab === 'manual'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-gray-300'
                }`}
              >
                <Keyboard size={14} /> Barcode Gun / Manual
              </button>
              <button
                onClick={() => { setActiveTab('upload'); setLookupError('') }}
                className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all ${
                  activeTab === 'upload'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-gray-300'
                }`}
              >
                <Upload size={14} /> Image File
              </button>
            </div>

            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Mute Beep Sound' : 'Enable Beep Sound'}
              className="mb-2 p-1.5 rounded-xl hover:bg-cream-100 dark:hover:bg-gray-800 text-ink-400 hover:text-ink-700 dark:hover:text-gray-200 transition-colors"
            >
              {soundEnabled ? <Volume2 size={15} className="text-brand-600" /> : <VolumeX size={15} />}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-cream-50/40 dark:bg-gray-900/60">
          
          {/* SEARCHING SPINNER */}
          {isSearching && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin mx-auto" />
              <p className="text-sm font-bold text-ink-800 dark:text-gray-200">Looking up asset...</p>
              <p className="text-xs text-ink-400 font-mono">Code: {scannedCode}</p>
            </div>
          )}

          {/* 1. MATCHED ASSET CARD */}
          {!isSearching && matchedAsset && (
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Success Banner */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  Asset Identified Successfully!
                </div>
                <span className="font-mono text-[11px] bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md font-bold">
                  {scannedCode}
                </span>
              </div>

              {/* Asset Information Box */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-cream-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-cream-100 dark:border-gray-700/70 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-black text-brand-600 dark:text-brand-400 text-base">
                        {matchedAsset.asset_code}
                      </span>
                      {matchedAsset.sub_sequence > 0 && (
                        <span className="text-xs font-mono bg-cream-100 dark:bg-gray-700 text-ink-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                          Sub #{matchedAsset.sub_sequence}
                        </span>
                      )}
                      <Badge label={matchedAsset.status || 'Active'} />
                    </div>
                    <h3 className="text-lg font-bold text-ink-900 dark:text-gray-100">
                      {matchedAsset.name}
                    </h3>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-ink-400 uppercase font-bold block">Acquisition Value</span>
                    <span className="text-sm font-black text-ink-800 dark:text-gray-100 font-mono">
                      {formatINR(matchedAsset.acquisition_value)}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-2xl bg-cream-50 dark:bg-gray-750/70">
                    <span className="text-[10px] font-bold text-ink-400 dark:text-gray-400 uppercase block">Category</span>
                    <span className="font-semibold text-ink-800 dark:text-gray-200 truncate block">
                      {matchedAsset.category || '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-cream-50 dark:bg-gray-750/70">
                    <span className="text-[10px] font-bold text-ink-400 dark:text-gray-400 uppercase block">Serial Number</span>
                    <span className="font-mono font-medium text-ink-800 dark:text-gray-200 truncate block">
                      {matchedAsset.serial_number || '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-cream-50 dark:bg-gray-750/70">
                    <span className="text-[10px] font-bold text-ink-400 dark:text-gray-400 uppercase block">Asset Class</span>
                    <span className="font-semibold text-ink-800 dark:text-gray-200 truncate block">
                      {matchedAsset.asset_class || '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-cream-50 dark:bg-gray-750/70">
                    <span className="text-[10px] font-bold text-ink-400 dark:text-gray-400 uppercase block">Plant / Location</span>
                    <span className="font-semibold text-ink-800 dark:text-gray-200 truncate block">
                      {matchedAsset.plant_name || matchedAsset.plant_code || '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-cream-50 dark:bg-gray-750/70">
                    <span className="text-[10px] font-bold text-ink-400 dark:text-gray-400 uppercase block">Department</span>
                    <span className="font-semibold text-ink-800 dark:text-gray-200 truncate block">
                      {matchedAsset.dept_name || '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-cream-50 dark:bg-gray-750/70">
                    <span className="text-[10px] font-bold text-ink-400 dark:text-gray-400 uppercase block">Assigned To</span>
                    <span className="font-semibold text-ink-800 dark:text-gray-200 truncate block">
                      {matchedAsset.assigned_employee || matchedAsset.employee_name || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleResetScan}
                  className="px-4 py-2.5 rounded-2xl border border-cream-300 dark:border-gray-700 text-xs font-semibold text-ink-700 dark:text-gray-300 hover:bg-cream-100 dark:hover:bg-gray-800 flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={14} /> Scan Another Asset
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onClose()
                      if (onOpenPrintLabel) onOpenPrintLabel([matchedAsset])
                    }}
                    className="px-4 py-2.5 rounded-2xl bg-cream-200 dark:bg-gray-800 hover:bg-cream-300 dark:hover:bg-gray-700 text-ink-800 dark:text-gray-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Printer size={14} /> Print Label
                  </button>

                  <button
                    onClick={() => {
                      onClose()
                      navigate(`/assets/${matchedAsset.id}`)
                    }}
                    className="px-5 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md shadow-brand-500/20 flex items-center gap-1.5 transition-all"
                  >
                    <Eye size={14} /> View Details <ArrowRight size={13} />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* 2. NOT FOUND ERROR */}
          {!isSearching && !matchedAsset && lookupError && (
            <div className="p-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-3xl text-center space-y-4 my-2">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 mx-auto">
                <AlertCircle size={24} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-800 dark:text-red-300">Asset Not Found</h4>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{lookupError}</p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleResetScan}
                  className="px-4 py-2 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-xl text-xs font-semibold text-ink-700 dark:text-gray-200 hover:bg-cream-50"
                >
                  Try Again
                </button>
                {onOpenCreateAsset && (
                  <button
                    onClick={() => {
                      onClose()
                      onOpenCreateAsset(scannedCode)
                    }}
                    className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 flex items-center gap-1"
                  >
                    <Plus size={13} /> Create Asset with this Code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 3. CAMERA SCANNER VIEW */}
          {!isSearching && !matchedAsset && !lookupError && activeTab === 'camera' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Video Scanner Box */}
              <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden shadow-xl border-4 border-cream-200 dark:border-gray-800">
                <div id="ams-qr-reader" ref={scannerRef} className="w-full h-full object-cover" />
                
                {/* Visual Viewfinder Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-dashed border-white/60 rounded-2xl relative">
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-brand-500 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-brand-500 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-5 h-4 border-b-4 border-l-4 border-brand-500 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-brand-500 rounded-br-lg" />
                    {/* Animated laser line */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse absolute top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              {/* Camera Selector */}
              {cameras.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-400">Camera:</span>
                  <select
                    value={selectedCameraId}
                    onChange={e => {
                      setSelectedCameraId(e.target.value)
                      startCameraScanner(e.target.value)
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-cream-200 dark:border-gray-700 text-ink-800 dark:text-gray-200"
                  >
                    {cameras.map(c => (
                      <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>
              )}

              {cameraError && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded-2xl text-center max-w-sm">
                  {cameraError}
                  <button
                    onClick={() => startCameraScanner(selectedCameraId)}
                    className="block mx-auto mt-2 text-brand-600 underline font-bold"
                  >
                    Retry Camera
                  </button>
                </div>
              )}

              <p className="text-xs text-ink-400 text-center">
                Point your camera towards any 1D Barcode (Code128) or QR Code on the asset.
              </p>
            </div>
          )}

          {/* 4. MANUAL / BARCODE GUN INPUT */}
          {!isSearching && !matchedAsset && !lookupError && activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="max-w-md mx-auto py-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 mx-auto">
                  <Keyboard size={24} />
                </div>
                <h4 className="text-sm font-bold text-ink-900 dark:text-gray-100">
                  Barcode Scanner / Manual Input
                </h4>
                <p className="text-xs text-ink-400">
                  Ready for USB/Bluetooth barcode scanner or keyboard input.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  ref={manualInputRef}
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="Scan or type Asset Code / Serial No / URL…"
                  className="w-full px-4 py-3.5 bg-white dark:bg-gray-800 rounded-2xl font-mono text-center font-bold text-sm text-ink-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 border border-cream-300 dark:border-gray-700 shadow-sm tracking-wider"
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-md shadow-brand-500/20 transition-all"
                >
                  Lookup Asset
                </button>
              </div>
            </form>
          )}

          {/* 5. IMAGE FILE UPLOAD */}
          {!isSearching && !matchedAsset && !lookupError && activeTab === 'upload' && (
            <div className="max-w-md mx-auto py-8 space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 mx-auto">
                  <Upload size={24} />
                </div>
                <h4 className="text-sm font-bold text-ink-900 dark:text-gray-100">
                  Upload Photo with Barcode / QR
                </h4>
                <p className="text-xs text-ink-400">
                  Select an image from your device to scan automatically.
                </p>
              </div>

              <label className="border-2 border-dashed border-cream-300 dark:border-gray-700 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-cream-100/50 dark:hover:bg-gray-800/50 transition-colors">
                <Upload size={32} className="text-brand-500 mb-2 opacity-60" />
                <span className="text-xs font-bold text-ink-800 dark:text-gray-200">
                  {isProcessingFile ? 'Scanning Image…' : 'Choose an image file'}
                </span>
                <span className="text-[10px] text-ink-400 mt-1">PNG, JPG, WEBP supported</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isProcessingFile}
                  className="hidden"
                />
              </label>

              {uploadError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-2xl text-xs text-red-600 dark:text-red-400 text-center">
                  {uploadError}
                </div>
              )}

              {/* Hidden element for file scanning */}
              <div id="ams-file-scanner-temp" className="hidden" />
            </div>
          )}

        </div>

      </div>

    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react'
import api from '../../data/api'
import Button from './Button'
import Modal from './Modal'

function PhotoImage({ endpoint, alt, className }) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    let url
    api.get(endpoint, { responseType: 'blob', signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(response.data)
      setResult({ endpoint, url })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ endpoint, error: true })
    })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [endpoint])
  if (result?.endpoint !== endpoint) return <span role="status">Loading photo…</span>
  if (result.error) return <span role="status">Photo unavailable</span>
  return <img src={result.url} alt={alt} decoding="async" className={className}/>
}

export default function AssetPhotos({ assetId, canEdit }) {
  const card = useRef(null)
  const input = useRef(null)
  const [visible, setVisible] = useState(false)
  const [photos, setPhotos] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const endpoint = `/assets/${assetId}/photos`
  const cover = photos?.[0]
  const index = photos?.findIndex(photo => photo.id === selectedId) ?? -1
  const selected = photos?.[index]

  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    })
    observer.observe(card.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    api.get(endpoint, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setPhotos(response.data)
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load asset photos.')
    })
    return () => controller.abort()
  }, [endpoint, visible, reload])

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    if (file.size > 10 * 1024 * 1024) { setError('Choose an image up to 10 MB.'); return }
    setError('')
    setBusy(true)
    try {
      const body = new FormData()
      body.append('photo', file)
      const { data } = await api.post(endpoint, body, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPhotos(current => [...current, data])
    } catch (err) { setError(err.response?.data?.error || 'Could not upload the photo.') }
    finally { setBusy(false) }
  }

  function closeGallery() {
    if (busy) return
    setSelectedId(null)
    setRemoving(false)
    setError('')
  }

  async function removePhoto() {
    setBusy(true)
    setError('')
    try {
      await api.delete(`${endpoint}/${selected.id}`)
      const remaining = photos.filter(photo => photo.id !== selected.id)
      setPhotos(remaining)
      setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
      setRemoving(false)
    } catch (err) { setError(err.response?.data?.error || 'Could not remove the photo.') }
    finally { setBusy(false) }
  }

  return (
    <section ref={card} aria-label="Asset photos" className="bg-white dark:bg-gray-800 rounded-3xl shadow-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-24 h-16 flex items-center justify-center overflow-hidden rounded-xl bg-cream-100 dark:bg-gray-700 text-ink-500 dark:text-gray-300 text-xs">
            {cover ? <button type="button" aria-label="Open asset photo gallery" className="w-full h-full" onClick={() => setSelectedId(cover.id)}>
              <PhotoImage endpoint={`${endpoint}/${cover.id}/thumb`} alt={`Cover photo: ${cover.label}`} className="h-full w-full object-cover"/>
            </button> : <Camera size={22} aria-hidden="true"/>}
          </div>
          <div>
            <h2 className="text-sm font-bold">Photos</h2>
            <p className="text-xs text-ink-500 dark:text-gray-400" aria-live="polite">
              {photos ? `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}` : error ? 'Unavailable' : visible ? 'Loading photos…' : 'Asset photos'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cover && <Button size="sm" variant="secondary" onClick={() => setSelectedId(cover.id)}>View photos</Button>}
          {canEdit && photos && photos.length < 5 && <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current.click()}>
            <ImagePlus size={15}/>{busy ? 'Uploading…' : 'Add photo'}
          </Button>}
          <input ref={input} type="file" aria-label="Choose an asset photo" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload}/>
        </div>
      </div>
      {!selected && error && <div className="text-sm text-red-600 mt-3" role="alert">{error} {!photos && <button className="underline" onClick={() => { setError(''); setReload(n => n + 1) }}>Retry</button>}</div>}

      <Modal isOpen={Boolean(selected)} onClose={closeGallery} title="Asset photos" size="lg">
        {selected && <div className="space-y-4">
          <div className="min-h-48 flex items-center justify-center rounded-2xl overflow-hidden bg-cream-100 dark:bg-gray-900 text-sm">
            <PhotoImage endpoint={`${endpoint}/${selected.id}/full`} alt={selected.label} className="max-h-[55dvh] max-w-full object-contain"/>
          </div>
          <p className="text-sm break-all" aria-live="polite">{index + 1} of {photos.length} · {selected.label}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={index === 0 || busy || removing} onClick={() => setSelectedId(photos[index - 1].id)}><ChevronLeft size={16}/>Previous</Button>
            <Button size="sm" variant="secondary" disabled={index === photos.length - 1 || busy || removing} onClick={() => setSelectedId(photos[index + 1].id)}>Next<ChevronRight size={16}/></Button>
            {canEdit && !removing && <Button size="sm" variant="secondary" onClick={() => setRemoving(true)}>Remove photo</Button>}
          </div>
          {removing && <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">Remove this photo from the asset?</p>
            <Button size="sm" variant="danger" disabled={busy} onClick={removePhoto}>Remove</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRemoving(false)}>Cancel</Button>
          </div>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>}
      </Modal>
    </section>
  )
}

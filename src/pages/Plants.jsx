import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, MapPin, X } from 'lucide-react'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Badge } from '../components/common/Badge'
import { Input, Select } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getPlants, createPlant, updatePlant, deletePlant } from '../data/api'

const EMPTY = { code:'', name:'', location:'', head:'', status:'Active' }

export default function Plants() {
  const { canEdit } = useAuth()
  const editable = canEdit('plants')

  const [plants,  setPlants]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [modal,   setModal]   = useState(null)   // null | 'add' | 'edit' | 'delete'
  const [selected,setSelected]= useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState('')

  useEffect(() => {
    getPlants()
      .then(r => { setPlants(r.data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  function openAdd()       { setForm(EMPTY); setFormErr(''); setModal('add') }
  function openEdit(p)     { setSelected(p); setForm({ code:p.code, name:p.name, location:p.location||'', head:p.head||'', status:p.status }); setFormErr(''); setModal('edit') }
  function openDelete(p)   { setSelected(p); setFormErr(''); setModal('delete') }
  function close()         { setModal(null); setSelected(null) }

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  async function handleSave() {
    setFormErr('')
    if (!form.code.trim() || !form.name.trim()) { setFormErr('Code and Name are required'); return }
    setSaving(true)
    try {
      if (modal === 'add') {
        const r = await createPlant(form)
        setPlants(prev => [...prev, { ...r.data, asset_count: 0 }])
      } else {
        const r = await updatePlant(selected.id, form)
        setPlants(prev => prev.map(p => p.id === selected.id ? { ...r.data, asset_count: selected.asset_count } : p))
      }
      close()
    } catch (e) { setFormErr(e.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deletePlant(selected.id)
      setPlants(prev => prev.filter(p => p.id !== selected.id))
      close()
    } catch (e) { setFormErr(e.response?.data?.error || 'Delete failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400">Loading plants…</div>
  if (error)   return <div className="py-20 text-center text-sm text-red-500">Error: {error}</div>

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:'Total Plants',  value: plants.length,                              color:'bg-orange-gradient text-white' },
          { label:'Active',        value: plants.filter(p=>p.status==='Active').length, color:'bg-white dark:bg-gray-800 border-cream-200 dark:border-gray-700' },
          { label:'Inactive',      value: plants.filter(p=>p.status==='Inactive').length,color:'bg-white dark:bg-gray-800 border-cream-200 dark:border-gray-700'},
          { label:'Total Assets',  value: plants.reduce((s,p)=>s+(p.asset_count||0),0), color:'bg-white dark:bg-gray-800 border-cream-200 dark:border-gray-700' },
        ].map((s,i) => (
          <div key={i} className={`rounded-3xl p-5 shadow-card ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700">Plant Management</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">{plants.length} plants</p>
          </div>
          {editable && <Button onClick={openAdd}><Plus size={15} /> Add Plant</Button>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-cream-200">
                {['#','Plant Name','Code','Location','Assets','Plant Head','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plants.map(p => (
                <tr key={p.id} className="border-b border-cream-200 hover:bg-cream-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-ink-400">#{p.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-orange-soft flex items-center justify-center flex-shrink-0">
                        <MapPin size={12} className="text-brand-500" />
                      </div>
                      <span className="font-medium text-sm">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-cream-100 dark:bg-gray-800 px-2 py-1 rounded-lg">{p.code}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-500">{p.location || '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold">{p.asset_count || 0}</td>
                  <td className="px-4 py-3 text-sm">{p.head || '—'}</td>
                  <td className="px-4 py-3"><Badge label={p.status} /></td>
                  <td className="px-4 py-3">
                    {editable && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} title="Edit plant"
                          className="p-1.5 rounded-xl hover:bg-brand-50 hover:text-brand-600 text-ink-400 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openDelete(p)} title="Delete plant"
                          className="p-1.5 rounded-xl hover:bg-red-50 hover:text-red-500 text-ink-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plants.length === 0 && <div className="py-12 text-center text-ink-300 dark:text-gray-400 text-sm">No plants found</div>}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={close} title={modal === 'add' ? 'Add New Plant' : 'Edit Plant'}>
        <div className="space-y-4">
          {formErr && <div className="bg-red-50 text-red-600 rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2"><X size={14}/>{formErr}</div>}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Plant Name *" name="name"     value={form.name}     onChange={handleChange} placeholder="e.g. Plant A – Chennai" />
            <Input label="Code *"       name="code"     value={form.code}     onChange={handleChange} placeholder="e.g. CHN" />
            <Input label="Location"     name="location" value={form.location} onChange={handleChange} placeholder="City, State" className="col-span-2" />
            <Input label="Plant Head"   name="head"     value={form.head}     onChange={handleChange} placeholder="Manager name" />
            <Select label="Status" name="status" value={form.status} onChange={handleChange}>
              <option>Active</option><option>Inactive</option>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : modal === 'add' ? 'Add Plant' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={modal === 'delete'} onClose={close} title="Delete Plant" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Delete <strong>{selected?.name}</strong>? This cannot be undone. Plants with assigned assets cannot be deleted.</p>
          {formErr && <p className="text-xs text-red-500">{formErr}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

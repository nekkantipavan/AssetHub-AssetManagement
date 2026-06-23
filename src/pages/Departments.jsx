import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Layers, X } from 'lucide-react'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Badge } from '../components/common/Badge'
import { Input, Select } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getDepartments, createDepartment, updateDepartment, deleteDepartment, getPlants } from '../data/api'

const EMPTY = { code:'', name:'', plant_id:'', manager:'', status:'Active' }

export default function Departments() {
  const { canEdit } = useAuth()
  const editable = canEdit('departments')

  const [depts,   setDepts]   = useState([])
  const [plants,  setPlants]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [selected,setSelected]= useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState('')

  useEffect(() => {
    Promise.all([getDepartments(), getPlants()])
      .then(([d, p]) => { setDepts(d.data); setPlants(p.data); setLoading(false) })
      .catch(e => setLoading(false))
  }, [])

  function openAdd()     { setForm(EMPTY); setFormErr(''); setModal('add') }
  function openEdit(d)   { setSelected(d); setForm({ code:d.code, name:d.name, plant_id:d.plant_id||'', manager:d.manager||'', status:d.status }); setFormErr(''); setModal('edit') }
  function openDelete(d) { setSelected(d); setFormErr(''); setModal('delete') }
  function close()       { setModal(null); setSelected(null) }

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  async function handleSave() {
    setFormErr('')
    if (!form.code.trim() || !form.name.trim()) { setFormErr('Code and Name are required'); return }
    setSaving(true)
    try {
      const payload = { ...form, plant_id: form.plant_id || null }
      if (modal === 'add') {
        const r = await createDepartment(payload)
        const plant = plants.find(p => p.id === parseInt(form.plant_id))
        setDepts(prev => [...prev, { ...r.data, plant_name: plant?.name || null, asset_count: 0 }])
      } else {
        const r = await updateDepartment(selected.id, payload)
        const plant = plants.find(p => p.id === parseInt(form.plant_id))
        setDepts(prev => prev.map(d => d.id === selected.id ? { ...r.data, plant_name: plant?.name || null, asset_count: selected.asset_count } : d))
      }
      close()
    } catch (e) { setFormErr(e.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteDepartment(selected.id)
      setDepts(prev => prev.filter(d => d.id !== selected.id))
      close()
    } catch (e) { setFormErr(e.response?.data?.error || 'Delete failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400">Loading departments…</div>

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Total Departments', value: depts.length, color:'bg-orange-gradient text-white' },
          { label:'Active',  value: depts.filter(d=>d.status==='Active').length,   color:'bg-white dark:bg-gray-800 border-cream-200 dark:border-gray-700' },
          { label:'Total Assets', value: depts.reduce((s,d)=>s+(d.asset_count||0),0), color:'bg-white dark:bg-gray-800 border-cream-200 dark:border-gray-700' },
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
            <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700">Department Management</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">{depts.length} departments</p>
          </div>
          {editable && <Button onClick={openAdd}><Plus size={15} /> Add Department</Button>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-cream-200">
                {['#','Department','Code','Plant','Assets','Manager','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depts.map(d => (
                <tr key={d.id} className="border-b border-cream-200 hover:bg-cream-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-ink-400">#{d.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <Layers size={12} className="text-purple-500" />
                      </div>
                      <span className="font-medium text-sm">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-cream-100 dark:bg-gray-800 px-2 py-1 rounded-lg">{d.code}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-500">{d.plant_name || '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold">{d.asset_count || 0}</td>
                  <td className="px-4 py-3 text-sm">{d.manager || '—'}</td>
                  <td className="px-4 py-3"><Badge label={d.status} /></td>
                  <td className="px-4 py-3">
                    {editable && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(d)} title="Edit department"
                          className="p-1.5 rounded-xl hover:bg-brand-50 hover:text-brand-600 text-ink-400 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openDelete(d)} title="Delete department"
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
        {depts.length === 0 && <div className="py-12 text-center text-ink-300 dark:text-gray-400 text-sm">No departments found</div>}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={close} title={modal === 'add' ? 'Add Department' : 'Edit Department'}>
        <div className="space-y-4">
          {formErr && <div className="bg-red-50 text-red-600 rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2"><X size={14}/>{formErr}</div>}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Department Name *" name="name"    value={form.name}    onChange={handleChange} placeholder="e.g. Information Technology" className="col-span-2" />
            <Input label="Code *"            name="code"    value={form.code}    onChange={handleChange} placeholder="e.g. IT" />
            <Input label="Manager"           name="manager" value={form.manager} onChange={handleChange} placeholder="Manager name" />
            <Select label="Plant" name="plant_id" value={form.plant_id} onChange={handleChange}>
              <option value="">— Multi-Plant —</option>
              {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select label="Status" name="status" value={form.status} onChange={handleChange}>
              <option>Active</option><option>Inactive</option>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : modal === 'add' ? 'Add Department' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={modal === 'delete'} onClose={close} title="Delete Department" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Delete <strong>{selected?.name}</strong>? Departments with assigned assets cannot be deleted.</p>
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

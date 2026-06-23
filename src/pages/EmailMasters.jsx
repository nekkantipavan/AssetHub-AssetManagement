import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Mail, X, CheckCircle } from 'lucide-react'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Input } from '../components/common/FormFields'
import { Badge } from '../components/common/Badge'
import { useAuth } from '../context/AuthContext'
import { getEmailMasters, createEmailMaster, updateEmailMaster, deleteEmailMaster } from '../data/api'

const EMPTY = { name:'', email:'', department:'' }

export default function EmailMasters() {
  const { canEdit } = useAuth()
  const editable = canEdit('users') // Admin only

  const [masters,  setMasters]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null) // 'add'|'edit'|'delete'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    getEmailMasters()
      .then(r => { setMasters(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function openAdd()   { setForm(EMPTY); setErr(''); setModal('add') }
  function openEdit(m) { setSelected(m); setForm({ name:m.name, email:m.email, department:m.department||'' }); setErr(''); setModal('edit') }
  function openDel(m)  { setSelected(m); setErr(''); setModal('delete') }
  function close()     { setModal(null); setSelected(null) }

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  async function handleSave() {
    setErr('')
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!form.email.trim()) { setErr('Email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr('Invalid email format'); return }
    setSaving(true)
    try {
      if (modal === 'add') {
        const r = await createEmailMaster(form)
        setMasters(p => [...p, r.data])
      } else {
        const r = await updateEmailMaster(selected.id, form)
        setMasters(p => p.map(m => m.id === selected.id ? r.data : m))
      }
      close()
    } catch(e) { setErr(e.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteEmailMaster(selected.id)
      setMasters(p => p.filter(m => m.id !== selected.id))
      close()
    } catch(e) { setErr(e.response?.data?.error || 'Delete failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading…</div>

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="bg-orange-soft dark:bg-gray-800 rounded-3xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-orange-gradient flex items-center justify-center shadow-soft flex-shrink-0">
          <Mail size={18} className="text-white"/>
        </div>
        <div>
          <p className="font-bold text-ink-900 dark:text-gray-100 text-sm">Email Approval Masters</p>
          <p className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
            These are the managers who will receive approval emails when a transfer is initiated.
            Select one when creating a transfer.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-orange-gradient text-white rounded-3xl p-5 shadow-card">
          <p className="text-2xl font-bold">{masters.length}</p>
          <p className="text-xs opacity-70 mt-0.5">Total Approvers</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-card">
          <p className="text-2xl font-bold text-ink-900 dark:text-gray-100">{masters.filter(m=>m.is_active).length}</p>
          <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Active</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900 dark:text-gray-100">Approval Email List</h3>
            <p className="text-xs text-ink-300 dark:text-gray-400">{masters.length} contacts</p>
          </div>
          {editable && <Button onClick={openAdd}><Plus size={15}/> Add Approver</Button>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-200 dark:border-gray-700">
                {['#','Name','Email','Department','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {masters.map((m, i) => (
                <tr key={m.id} className="border-b border-cream-200 dark:border-gray-700 hover:bg-cream-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-4 py-3 text-sm text-ink-400 dark:text-gray-400">#{i+1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-orange-gradient flex items-center justify-center text-white text-xs font-bold">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-ink-900 dark:text-gray-100">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-500 dark:text-gray-400">{m.email}</td>
                  <td className="px-4 py-3 text-sm text-ink-600 dark:text-gray-300">{m.department || '—'}</td>
                  <td className="px-4 py-3"><Badge label={m.is_active ? 'Active' : 'Inactive'}/></td>
                  <td className="px-4 py-3">
                    {editable && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(m)} className="p-1.5 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 text-ink-400 dark:text-gray-400 transition-colors"><Edit2 size={14}/></button>
                        <button onClick={() => openDel(m)}  className="p-1.5 rounded-xl hover:bg-red-50   dark:hover:bg-red-900/20   hover:text-red-500   text-ink-400 dark:text-gray-400 transition-colors"><Trash2 size={14}/></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {masters.length === 0 && (
            <div className="py-12 text-center text-ink-300 dark:text-gray-500 text-sm">
              No approvers yet. Add one above.
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modal==='add'||modal==='edit'} onClose={close}
             title={modal==='add' ? 'Add Approver' : 'Edit Approver'} size="sm">
        <div className="space-y-4">
          {err && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <X size={14}/>{err}
            </div>
          )}
          <Input label="Full Name *"   name="name"       value={form.name}       onChange={handleChange} placeholder="e.g. Arun Prasad"/>
          <Input label="Email *"       name="email"      value={form.email}      onChange={handleChange} type="email" placeholder="manager@company.com"/>
          <Input label="Department"    name="department" value={form.department} onChange={handleChange} placeholder="e.g. IT, Finance"/>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : modal==='add' ? 'Add Approver' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={modal==='delete'} onClose={close} title="Remove Approver" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-600 dark:text-gray-300">
            Remove <strong>{selected?.name}</strong> ({selected?.email}) from the approver list?
          </p>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>{saving ? 'Removing…' : 'Remove'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

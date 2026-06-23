import { useState, useEffect } from 'react'
import { Plus, Edit2, Shield, KeyRound, X, CheckCircle, Eye, EyeOff } from 'lucide-react'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/common/Table'
import { Badge, DotBadge } from '../components/common/Badge'
import { Input, Select } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getUsers, createUser, updateUser } from '../data/api'
import api from '../data/api'

const roles = ['Admin', 'Manager', 'User']
const EMPTY_FORM = { employee_id:'', username:'', name:'', email:'', role:'User', status:'Active', password:'' }

export default function Users() {
  const { canEdit } = useAuth()
  const editable = canEdit('users')

  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('All')

  // Add/Edit modal
  const [modal,    setModal]   = useState(null) // 'add'|'edit'|'resetpw'
  const [selected, setSelected]= useState(null)
  const [form,     setForm]    = useState(EMPTY_FORM)
  const [saving,   setSaving]  = useState(false)
  const [formErr,  setFormErr] = useState('')
  const [formOk,   setFormOk]  = useState('')

  // Reset password modal state
  const [newPw,   setNewPw]   = useState('')
  const [showPw,  setShowPw]  = useState(false)

  useEffect(() => {
    getUsers()
      .then(r => { setUsers(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = users.filter(u => filter === 'All' || u.role === filter)

  function openAdd()  { setForm(EMPTY_FORM); setFormErr(''); setFormOk(''); setModal('add') }
  function openEdit(u){
    setSelected(u)
    setForm({ employee_id:u.employee_id||'', username:u.username||'', name:u.name||'', email:u.email||'', role:u.role||'User', status:u.status||'Active', password:'' })
    setFormErr(''); setFormOk(''); setModal('edit')
  }
  function openResetPw(u) { setSelected(u); setNewPw(''); setShowPw(false); setFormErr(''); setFormOk(''); setModal('resetpw') }
  function close() { setModal(null); setSelected(null) }

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  async function handleSave() {
  setFormErr('')
  setFormOk('')

  // ── Client-side validation (all fields required, no auto-fill) ──
  if (!form.employee_id.trim()) { setFormErr('Employee ID is required'); return }
  if (!form.username.trim())    { setFormErr('Username is required'); return }
  if (!form.name.trim())        { setFormErr('Full name is required'); return }
  if (!form.email.trim())       { setFormErr('Email is required'); return }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    setFormErr('Please enter a valid email address')
    return
  }

  if (modal === 'add' && form.password.length < 6) {
    setFormErr('Temporary password must be at least 6 characters')
    return
  }


  setSaving(true)
  try {
    // ── No username fallback — user must fill it explicitly ──
    const payload = {
      employee_id: form.employee_id.trim(),
      username:    form.username.trim(),   // required, never falls back to employee_id
      name:        form.name.trim(),
      email:       form.email.trim(),
      role:        form.role,
      status:      form.status,
      ...(modal === 'add' && { password: form.password }),
    }

    if (modal === 'add') {
      const r = await createUser(payload)
      setUsers(prev => [r.data, ...prev])
    } else {
      const r = await updateUser(selected.id, payload)
      setUsers(prev => prev.map(u => u.id === selected.id ? r.data : u))
    }

    close()

  } catch (err) {
    // Backend always returns { error: "clean message" } — show it directly
    const msg = err.response?.data?.error
    setFormErr(msg || 'Something went wrong. Please try again.')
  } finally {
    setSaving(false)
  }
}
async function handleResetPassword() {
  setFormErr(''); setFormOk('')
  if (newPw.length < 6) { setFormErr('Password must be at least 6 characters'); return }
  setSaving(true)
  try {
    const r = await api.put(`/users/${selected.id}/reset-password`, { new_password: newPw })
    setFormOk(r.data.message || 'Password reset. User will be prompted to change it on next login.')
    setNewPw('')
  } catch (err) {
    setFormErr(err.response?.data?.error || 'Reset failed')
  } finally {
    setSaving(false)
  }
}

  if (loading) return <div className="py-20 text-center text-sm text-ink-400">Loading users…</div>

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:'Total Users', value:users.length,                              color:'bg-orange-gradient text-white' },
          ...roles.map(r => ({ label:r+'s', value:users.filter(u=>u.role===r).length, color:'bg-white dark:bg-gray-800 border-cream-200 dark:border-gray-700' }))
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
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-bold border-cream-200 dark:border-gray-700">User Management</h3>
              <p className="text-xs text-ink-300 dark:text-gray-400">{filtered.length} users</p>
            </div>
            <div className="flex gap-1 bg-cream-100 dark:bg-gray-800 rounded-2xl p-1">
              {['All',...roles].map(r => (
                <button key={r} onClick={() => setFilter(r)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all
                    ${filter===r ? 'bg-orange-gradient text-white shadow-soft' : 'text-ink-400 hover:text-ink-700'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {editable && <Button onClick={openAdd}><Plus size={15}/> Add User</Button>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-cream-200">
                {['#','Employee ID','Username','Name','Email','Role','Status','Created','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-300 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-cream-200 hover:bg-cream-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-ink-400">#{u.id}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-brand-600">{u.employee_id||'—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-cream-100 dark:bg-gray-800 px-2 py-1 rounded-lg">{u.username||'—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-orange-gradient flex items-center justify-center text-white text-xs font-bold shadow-soft flex-shrink-0">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <span className="text-sm font-medium border-cream-200 dark:border-gray-700">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-400">{u.email}</td>
                  <td className="px-4 py-3"><Badge label={u.role}/></td>
                  <td className="px-4 py-3"><DotBadge label={u.status}/></td>
                  <td className="px-4 py-3 text-xs text-ink-400">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    {editable && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} title="Edit user"
                          className="p-1.5 rounded-xl hover:bg-brand-50 hover:text-brand-600 text-ink-400 transition-colors">
                          <Edit2 size={14}/>
                        </button>
                        <button onClick={() => openResetPw(u)} title="Reset password"
                          className="p-1.5 rounded-xl hover:bg-purple-50 hover:text-purple-600 text-ink-400 transition-colors">
                          <KeyRound size={14}/>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="py-12 text-center text-ink-300 dark:text-gray-400 text-sm">No users found</div>}
      </div>

      {/* ── Add / Edit User Modal ─────────────────────────── */}
      <Modal isOpen={modal==='add'||modal==='edit'} onClose={close} title={modal==='add'?'Add New User':'Edit User'}>
        <div className="space-y-4">
          {formErr && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-2.5 text-sm text-red-600 flex items-center gap-2">
              <X size={14}/>{formErr}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Employee ID *"  name="employee_id" value={form.employee_id} onChange={handleChange} placeholder="EMP001" />
            <Input label="Username *"     name="username"    value={form.username}    onChange={handleChange} placeholder="Login username" />
            <Input label="Full Name *"    name="name"        value={form.name}        onChange={handleChange} placeholder="Full name" className="col-span-2" />
            <Input label="Email *"        name="email"       value={form.email}       onChange={handleChange} type="email" placeholder="email@company.com" className="col-span-2" />
            <Select label="Role"   name="role"   value={form.role}   onChange={handleChange}>
              {roles.map(r => <option key={r}>{r}</option>)}
            </Select>
            <Select label="Status" name="status" value={form.status} onChange={handleChange}>
              <option>Active</option><option>Inactive</option>
            </Select>
          </div>

          {modal === 'add' && (
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1.5">
                Temporary Password * <span className="font-normal text-ink-300 dark:text-gray-400">(user will be forced to change on first login)</span>
              </label>
              <Input
                name="password"
                value={form.password}
                onChange={handleChange}
                type="password"
                placeholder="Min. 6 characters"
              />
            </div>
          )}

          {modal === 'add' && (
            <div className="bg-amber-50 rounded-2xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
              <Shield size={13} className="mt-0.5 flex-shrink-0"/>
              User will be asked to set a new password immediately after their first login.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Saving…</>
                : modal==='add' ? 'Add User' : 'Save Changes'
              }
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Reset Password Modal ─────────────────────────── */}
      <Modal isOpen={modal==='resetpw'} onClose={close} title="Reset User Password" size="sm">
        <div className="space-y-4">
          {selected && (
            <div className="bg-cream-100 dark:bg-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-gradient flex items-center justify-center text-white text-sm font-bold shadow-soft">
                {selected.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold border-cream-200 dark:border-gray-700">{selected.name}</p>
                <p className="text-xs text-ink-400">@{selected.username} · {selected.role}</p>
              </div>
            </div>
          )}

          {formErr && (
            <div className="bg-red-50 rounded-2xl px-4 py-2.5 text-sm text-red-600 flex items-center gap-2">
              <X size={14}/>{formErr}
            </div>
          )}
          {formOk && (
            <div className="bg-green-50 rounded-2xl px-4 py-2.5 text-sm text-green-700 flex items-start gap-2">
              <CheckCircle size={14} className="mt-0.5 flex-shrink-0"/>{formOk}
            </div>
          )}

          {!formOk && (
            <>
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1.5">
                  New Temporary Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full pr-10 pl-4 py-2.5 bg-cream-100 dark:bg-gray-800 rounded-2xl text-sm border-cream-200 dark:border-gray-700
                               placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
                  />
                  <button type="button" onClick={() => setShowPw(v=>!v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400 hover:text-ink-500">
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 rounded-2xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
                <Shield size={13} className="mt-0.5 flex-shrink-0"/>
                The user will be forced to set a new password on their next login.
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
                <Button onClick={handleResetPassword} disabled={saving || newPw.length < 6}>
                  {saving ? 'Resetting…' : 'Reset Password'}
                </Button>
              </div>
            </>
          )}

          {formOk && (
            <div className="flex justify-end pt-1">
              <Button onClick={close}>Done</Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

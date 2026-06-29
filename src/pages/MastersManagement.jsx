import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, X, CheckCircle, Tag, Layers, Activity, Circle, Building2, Landmark } from 'lucide-react'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Input } from '../components/common/FormFields'
import { useAuth } from '../context/AuthContext'
import { getAssetMastersAll, createAssetMaster, updateAssetMaster, deleteAssetMaster } from '../data/api'

// Master types we manage on this page
const MASTER_TYPES = [
  { key:'category',     label:'Categories',    icon:Tag,       desc:'Asset categories (Laptop, Printer, etc.)' },
  { key:'asset_class',  label:'Asset Classes', icon:Layers,    desc:'Asset classification codes (IT Equipment, etc.)' },
  { key:'asset_status', label:'Asset Status',  icon:Activity,  desc:'Physical status of an asset (In Use, Available, etc.)' },
  { key:'status',       label:'Record Status', icon:Circle,    desc:'Record lifecycle status (Active, Inactive)' },
  { key:'company_code', label:'Company Codes', icon:Building2, desc:'Company codes used for asset ownership classification.' },
  { key:'cost_center',  label:'Cost Centers',  icon:Landmark,  desc:'Cost center codes and descriptions used for cost allocation.' },
]

export default function MastersManagement() {
  const { canEdit } = useAuth()
  const editable = canEdit('departments') // reuse departments permission level

  const [data,    setData]    = useState({}) // { category: [...], asset_class: [...], ... }
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('category')

  // Modal state
  const [modal,    setModal]    = useState(null) // 'add' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState({ value:'', sort_order:'0', description:'' })
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')
  const [ok,       setOk]       = useState('')

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    getAssetMastersAll()
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function openAdd() {
    setForm({ value:'', sort_order: String((data[activeTab]?.length || 0) + 1), description:'' })
    setErr(''); setOk(''); setModal('add')
  }
  function openEdit(item) {
    setSelected(item)
    setForm({ value: item.value, sort_order: String(item.sort_order), description: item.description || '' })
    setErr(''); setOk(''); setModal('edit')
  }
  function openDelete(item) {
    setSelected(item); setErr(''); setModal('delete')
  }
  function close() { setModal(null); setSelected(null) }

  async function handleSave() {
    setErr('')
    if (!form.value.trim()) { setErr('Value is required'); return }
    setSaving(true)
    const extra = activeTab === 'cost_center' ? { description: form.description.trim() || null } : {}
    try {
      if (modal === 'add') {
        await createAssetMaster({ type: activeTab, value: form.value.trim(), sort_order: parseInt(form.sort_order) || 0, ...extra })
      } else {
        await updateAssetMaster(selected.id, { value: form.value.trim(), sort_order: parseInt(form.sort_order) || 0, is_active: true, ...extra })
      }
      load(); close()
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAssetMaster(selected.id)
      load(); close()
    } catch (e) {
      setErr(e.response?.data?.error || 'Delete failed')
    } finally { setSaving(false) }
  }

  const currentItems = data[activeTab] || []
  const activeType   = MASTER_TYPES.find(t => t.key === activeTab)

  if (loading) return <div className="py-20 text-center text-sm text-ink-400 dark:text-gray-400">Loading masters…</div>

  return (
    <div className="space-y-5">
      {/* Header explanation */}
      <div className="bg-orange-soft dark:bg-gray-800 rounded-3xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-orange-gradient flex items-center justify-center shadow-soft flex-shrink-0">
          <Tag size={18} className="text-white"/>
        </div>
        <div>
          <p className="font-bold text-ink-900 dark:text-gray-100 text-sm">Asset Masters Configuration</p>
          <p className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
            Manage the dropdown options used across the system — Categories, Asset Classes, Status values, etc.
            Changes here automatically appear in Add Asset, Edit Asset, Bulk Upload, and filters.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-card overflow-hidden">
        <div className="flex border-b border-cream-200 dark:border-gray-700">
          {MASTER_TYPES.map(t => {
            const Icon = t.icon
            const count = (data[t.key] || []).length
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-1 flex flex-col items-center gap-1 px-4 py-4 text-xs font-semibold transition-all
                  ${activeTab === t.key
                    ? 'bg-orange-gradient text-white'
                    : 'text-ink-500 dark:text-gray-400 hover:bg-cream-100 dark:hover:bg-gray-700'}`}
              >
                <Icon size={16}/>
                <span>{t.label}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                  ${activeTab === t.key ? 'bg-white/20 text-white' : 'bg-cream-200 dark:bg-gray-700 text-ink-500 dark:text-gray-400'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Tab description + add button */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-ink-900 dark:text-gray-100">{activeType?.label}</p>
            <p className="text-xs text-ink-400 dark:text-gray-400">{activeType?.desc}</p>
          </div>
          {editable && <Button size="sm" onClick={openAdd}><Plus size={14}/> Add {activeType?.label.slice(0,-1)}</Button>}
        </div>

        {/* Items list */}
        <div className="p-5">
          {currentItems.length === 0 ? (
            <div className="py-8 text-center text-ink-300 dark:text-gray-500 text-sm">
              No {activeType?.label.toLowerCase()} yet. Add one above.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {currentItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-cream-100 dark:bg-gray-700 rounded-2xl px-4 py-3 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-ink-300 dark:text-gray-500 font-mono w-5 flex-shrink-0">{idx+1}</span>
                    {activeTab === 'cost_center' ? (
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-800 dark:text-gray-200 truncate">{item.value}</div>
                        {item.description && <div className="text-xs text-ink-400 dark:text-gray-400 truncate">{item.description}</div>}
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-ink-800 dark:text-gray-200 truncate">{item.value}</span>
                    )}
                  </div>
                  {editable && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                      <button onClick={() => openEdit(item)}
                        className="p-1 rounded-lg hover:bg-brand-100 dark:hover:bg-gray-600 text-ink-400 hover:text-brand-600 transition-colors">
                        <Edit2 size={12}/>
                      </button>
                      <button onClick={() => openDelete(item)}
                        className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-gray-600 text-ink-400 hover:text-red-500 transition-colors">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────── */}
      <Modal isOpen={modal==='add'||modal==='edit'} onClose={close}
             title={modal==='add' ? `Add ${activeType?.label.slice(0,-1)}` : `Edit ${activeType?.label.slice(0,-1)}`}
             size="sm">
        <div className="space-y-4">
          {err && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <X size={14}/>{err}
            </div>
          )}
          <Input
            label="Value *"
            value={form.value}
            onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
            placeholder={`e.g. ${activeTab === 'category' ? 'Laptop' : activeTab === 'asset_class' ? 'IT Equipment' : activeTab === 'company_code' ? '1000' : activeTab === 'cost_center' ? 'CC-001' : 'In Use'}`}
          />
          {activeTab === 'cost_center' && (
            <Input
              label="Description"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="e.g. Marketing & Sales"
            />
          )}
          <Input
            label="Sort Order"
            value={form.sort_order}
            onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))}
            type="number"
            placeholder="1"
          />
          <p className="text-xs text-ink-400 dark:text-gray-500">
            Lower sort order = appears first in dropdowns.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : modal==='add' ? 'Add' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ─────────────────────────────────────── */}
      <Modal isOpen={modal==='delete'} onClose={close} title="Remove Value" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-600 dark:text-gray-300">
            Remove <strong>"{selected?.value}"</strong> from {activeType?.label}?
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            Assets that already use this value won't be affected — it just won't appear in new dropdown menus.
          </div>
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

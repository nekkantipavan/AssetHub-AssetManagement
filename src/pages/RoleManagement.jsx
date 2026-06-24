import { useState, useEffect, Fragment } from 'react'
import { Save, CheckCircle, AlertCircle, Info, ShieldCheck } from 'lucide-react'
import { getRolePermissions, updateRolePermissions } from '../data/api'
import { useAuth } from '../context/AuthContext'

const PAGE_GROUPS = [
  { section: 'Management', pages: [
    { key: 'dashboard',   label: 'Dashboard'   },
    { key: 'assets',      label: 'Assets'      },
    { key: 'bulk-upload', label: 'Bulk Upload' },
    { key: 'transfer',    label: 'Transfers'   },
  ]},
  { section: 'Masters', pages: [
    { key: 'plants',        label: 'Plants'        },
    { key: 'departments',   label: 'Departments'   },
    { key: 'masters',       label: 'Asset Masters' },
    { key: 'email-masters', label: 'Email Masters' },
  ]},
  { section: 'Reports', pages: [
    { key: 'reports', label: 'Reports (Asset & Transfer)' },
  ]},
  { section: 'System', pages: [
    { key: 'users',      label: 'Users'      },
    { key: 'audit-logs', label: 'Audit Logs' },
  ]},
]

const ACCESS_OPTIONS = [
  { value: 'true',  label: 'Full', desc: 'Create, edit, delete',
    active: 'bg-emerald-500 text-white', idle: 'hover:bg-emerald-50 hover:text-emerald-600' },
  { value: 'view',  label: 'View', desc: 'Read only',
    active: 'bg-brand-500 text-white',   idle: 'hover:bg-brand-50 hover:text-brand-600'    },
  { value: 'false', label: 'None', desc: 'Hidden',
    active: 'bg-gray-400 text-white',   idle: 'hover:bg-gray-100 hover:text-gray-600'     },
]

const ROLES = ['Manager', 'User']
const ROLE_COLORS = {
  Manager: 'text-purple-600 dark:text-purple-400',
  User:    'text-ink-500 dark:text-gray-400',
}

function AccessToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-cream-200 dark:border-gray-600 overflow-hidden">
      {ACCESS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.desc}
          className={`px-3 py-1.5 text-xs font-semibold transition-all ${
            value === opt.value
              ? opt.active
              : `bg-white dark:bg-gray-800 text-ink-300 dark:text-gray-500 ${opt.idle}`
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function RoleManagement() {
  const { refreshPermissions } = useAuth()
  const [perms,   setPerms]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)

  useEffect(() => {
    getRolePermissions()
      .then(r => { setPerms(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function setAccess(role, page, value) {
    setPerms(prev => ({
      ...prev,
      [role]: { ...(prev[role] || {}), [page]: value },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      await updateRolePermissions({ permissions: perms })
      await refreshPermissions()
      setToast({ type: 'ok', msg: 'Permissions saved successfully' })
    } catch (err) {
      setToast({ type: 'err', msg: err.response?.data?.error || 'Failed to save permissions' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-7 h-7 border-2 border-brand-300 border-t-brand-500 rounded-full animate-spin"/>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-gradient flex items-center justify-center shadow-soft">
            <ShieldCheck size={15} className="text-white"/>
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-900 dark:text-white leading-none">Role Permissions</h2>
            <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">Control page access for Manager and User roles</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !perms}
          className="btn-primary disabled:opacity-60"
        >
          <Save size={14}/>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium ${
          toast.type === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {toast.type === 'ok' ? <CheckCircle size={15}/> : <AlertCircle size={15}/>}
          {toast.msg}
        </div>
      )}

      {/* Admin notice */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 rounded-xl">
        <Info size={14} className="text-brand-500 mt-0.5 flex-shrink-0"/>
        <p className="text-xs text-brand-700 dark:text-brand-300">
          <strong>Admin</strong> role always has full access to all pages and cannot be modified here.
        </p>
      </div>

      {/* Permissions table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cream-50 dark:bg-gray-750 border-b border-cream-200 dark:border-gray-700">
              <th className="px-5 py-3 text-left text-xs font-semibold text-ink-400 dark:text-gray-400 uppercase tracking-wider w-2/5">
                Page / Module
              </th>
              {ROLES.map(role => (
                <th key={role} className={`px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider w-[30%] ${ROLE_COLORS[role]}`}>
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAGE_GROUPS.map(({ section, pages }) => (
              <Fragment key={section}>
                {/* Section header row */}
                <tr className="bg-cream-50/60 dark:bg-gray-750/40">
                  <td colSpan={3} className="px-5 py-2">
                    <span className="text-xs font-semibold text-ink-300 dark:text-gray-500 uppercase tracking-wider">
                      {section}
                    </span>
                  </td>
                </tr>

                {/* Page rows */}
                {pages.map(page => (
                  <tr key={page.key} className="border-b border-cream-100 dark:border-gray-700 last:border-0 hover:bg-cream-50 dark:hover:bg-gray-750/40 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-ink-700 dark:text-gray-200">{page.label}</span>
                    </td>
                    {ROLES.map(role => (
                      <td key={role} className="px-5 py-3 text-center">
                        <div className="flex justify-center">
                          <AccessToggle
                            value={perms?.[role]?.[page.key] ?? 'false'}
                            onChange={v => setAccess(role, page.key, v)}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-400 dark:text-gray-400">
        <span className="font-semibold text-ink-500 dark:text-gray-300">Legend:</span>
        {ACCESS_OPTIONS.map(opt => (
          <div key={opt.value} className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${opt.active}`}>{opt.label}</span>
            <span>— {opt.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

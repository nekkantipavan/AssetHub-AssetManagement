import { createContext, useContext, useState, useEffect } from 'react'
import api from '../data/api'

const AuthContext = createContext(null)

// Fallback used while DB permissions are loading (matches legacy hardcoded values)
const DEFAULT_PERMISSIONS = {
  Manager: {
    dashboard: 'true', assets: 'true', 'bulk-upload': 'true', transfer: 'true',
    plants: 'view', departments: 'view', masters: 'view', 'email-masters': 'false',
    reports: 'true', users: 'view', 'audit-logs': 'false',
  },
  User: {
    dashboard: 'true', assets: 'view', 'bulk-upload': 'false', transfer: 'view',
    plants: 'false', departments: 'false', masters: 'false', 'email-masters': 'false',
    reports: 'false', users: 'false', 'audit-logs': 'false',
  },
}

// Kept for any legacy imports — runtime access checking now uses DB permissions
export const PAGE_PERMISSIONS = {
  dashboard:        { Admin: true, Manager: true,   User: true   },
  assets:           { Admin: true, Manager: true,   User: 'view' },
  'bulk-upload':    { Admin: true, Manager: true,   User: false  },
  transfer:         { Admin: true, Manager: true,   User: 'view' },
  plants:           { Admin: true, Manager: 'view', User: false  },
  departments:      { Admin: true, Manager: 'view', User: false  },
  masters:          { Admin: true, Manager: 'view', User: false  },
  'email-masters':  { Admin: true, Manager: false,  User: false  },
  users:            { Admin: true, Manager: 'view', User: false  },
  'audit-logs':     { Admin: true, Manager: false,  User: false  },
  reports:          { Admin: true, Manager: true,   User: false  },
  'role-management':{ Admin: true, Manager: false,  User: false  },
}

function loadCachedPermissions() {
  try {
    const c = localStorage.getItem('ams_permissions')
    return c ? JSON.parse(c) : null
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [permissions, setPermissions] = useState(loadCachedPermissions)

  async function refreshPermissions() {
    try {
      const r = await api.get('/role-permissions')
      setPermissions(r.data)
      localStorage.setItem('ams_permissions', JSON.stringify(r.data))
    } catch { /* keep cached */ }
  }

  useEffect(() => {
    const token = localStorage.getItem('ams_token')
    const saved = localStorage.getItem('ams_user')
    if (token && saved) {
      try {
        const parsed = JSON.parse(saved)
        setUser(parsed)
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        refreshPermissions()
      } catch { logout() }
    }
    setLoading(false)
  }, [])

  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password })
    const { token, user: u } = res.data
    localStorage.setItem('ams_token', token)
    localStorage.setItem('ams_user', JSON.stringify(u))
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(u)
    await refreshPermissions()
    return u
  }

  function logout() {
    localStorage.removeItem('ams_token')
    localStorage.removeItem('ams_user')
    localStorage.removeItem('ams_permissions')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    setPermissions(null)
  }

  function clearMustChangePassword() {
    const updated = { ...user, must_change_password: false }
    setUser(updated)
    localStorage.setItem('ams_user', JSON.stringify(updated))
  }

  function canAccess(page) {
    if (!user) return false
    if (user.role === 'Admin') return true

    const perms = permissions || DEFAULT_PERMISSIONS
    const val   = perms[user.role]?.[page]

    if (val === 'true' || val === true) return true
    if (val === 'view') return 'view'
    return false
  }

  function canEdit(page) {
    return canAccess(page) === true
  }

  return (
    <AuthContext.Provider value={{
      user, loading, permissions,
      login, logout, canAccess, canEdit,
      clearMustChangePassword, refreshPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

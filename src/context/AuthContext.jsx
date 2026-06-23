import { createContext, useContext, useState, useEffect } from 'react'
import api from '../data/api'

const AuthContext = createContext(null)

export const PAGE_PERMISSIONS = {
  dashboard:      { Admin:true,   Manager:true,   User:true   },
  assets:         { Admin:true,   Manager:true,   User:'view' },
  'bulk-upload':  { Admin:true,   Manager:true,   User:false  },
  transfer:       { Admin:true,   Manager:true,   User:'view' },
  plants:         { Admin:true,   Manager:'view', User:false  },
  departments:    { Admin:true,   Manager:'view', User:false  },
  masters:        { Admin:true,   Manager:'view', User:false  },
  users:          { Admin:true,   Manager:'view', User:false  },
  'audit-logs':   { Admin:true,   Manager:false,  User:false  },
  reports:        { Admin:true,   Manager:true,   User:false  },
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ams_token')
    const saved = localStorage.getItem('ams_user')
    if (token && saved) {
      try {
        const parsed = JSON.parse(saved)
        setUser(parsed)
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
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
    return u
  }

  function logout() {
    localStorage.removeItem('ams_token')
    localStorage.removeItem('ams_user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }

  function clearMustChangePassword() {
    const updated = { ...user, must_change_password: false }
    setUser(updated)
    localStorage.setItem('ams_user', JSON.stringify(updated))
  }

  function canAccess(page) {
    if (!user) return false
    return PAGE_PERMISSIONS[page]?.[user.role] ?? false
  }

  function canEdit(page) {
    return canAccess(page) === true
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccess, canEdit, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from "../../context/AuthContext";
import { ShieldOff } from 'lucide-react'

// Wraps any page and enforces auth + role-based access
export default function ProtectedRoute({ page, children }) {
  const { user, loading, canAccess } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 dark:bg-gray-800 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-brand-300 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in → redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Check page-level permission
  const access = canAccess(page)

  if (access === false) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-50 flex items-center justify-center mb-4">
          <ShieldOff size={28} className="text-red-400" />
        </div>
        <h2 className="text-lg font-bold border-cream-200 dark:border-gray-700 mb-1">Access Denied</h2>
        <p className="text-sm text-ink-400 max-w-xs">
          Your role ({user.role}) doesn't have permission to view this page.
          Contact your administrator.
        </p>
      </div>
    )
  }

  return children
}

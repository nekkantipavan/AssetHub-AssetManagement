import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Layout from './components/layout/Layout'
import { useEffect, useState } from 'react'

import Login              from './pages/Login'
import ForceChangePassword from './pages/ForceChangePassword'
import Dashboard          from './pages/Dashboard'
import Assets             from './pages/Assets'
import BulkUpload         from './pages/BulkUpload'
import Transfer           from './pages/Transfer'
import NewTransfer        from './pages/NewTransfer'
import TransferDetail     from './pages/TransferDetail'
import ReturnProcessing   from './pages/ReturnProcessing'
import Plants             from './pages/Plants'
import Departments        from './pages/Departments'
import MastersManagement  from './pages/MastersManagement'
import EmailMasters       from './pages/EmailMasters'
import Users              from './pages/Users'
import AuditLogs          from './pages/AuditLogs'
import AssetReport        from './pages/AssetReport'
import TransferReport     from './pages/TransferReport'

// Pages that go inside the Layout (sidebar + header)
const pages = [
  { path:'dashboard',   element:<Dashboard />,        page:'dashboard'   },
  { path:'assets',      element:<Assets />,            page:'assets'      },
  { path:'bulk-upload', element:<BulkUpload />,        page:'bulk-upload' },
  { path:'transfer',    element:<Transfer />,          page:'transfer'    },
  { path:'transfer/new',element:<NewTransfer />,       page:'transfer'    },
  { path:'transfer/:id',element:<TransferDetail />,    page:'transfer'    },
  { path:'transfer/:id/return', element:<ReturnProcessing />, page:'transfer' },
  { path:'plants',      element:<Plants />,            page:'plants'      },
  { path:'departments', element:<Departments />,       page:'departments' },
  { path:'masters',     element:<MastersManagement />, page:'departments' },
  { path:'email-masters',element:<EmailMasters />,     page:'users'       },
  { path:'users',       element:<Users />,             page:'users'       },
  { path:'audit-logs',        element:<AuditLogs />,       page:'audit-logs' },
  { path:'reports/assets',    element:<AssetReport />,     page:'reports'    },
  { path:'reports/transfers', element:<TransferReport />,  page:'reports'    },
]

function PasswordGuard({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (user?.must_change_password && location.pathname !== '/change-password')
    return <Navigate to="/change-password" replace />
  if (!user?.must_change_password && location.pathname === '/change-password')
    return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/change-password"
        element={
          <ProtectedRoute page="dashboard">
            <PasswordGuard>
              <ForceChangePassword />
            </PasswordGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute page="dashboard">
            <PasswordGuard>
              <Layout />
            </PasswordGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        {pages.map(({ path, element, page }) => (
          <Route
            key={path}
            path={path}
            element={<ProtectedRoute page={page}>{element}</ProtectedRoute>}
          />
        ))}
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <AuthProvider>
      <div className="bg-cream-50 border-cream-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white min-h-screen">
        <AppRoutes />
      </div>
    </AuthProvider>
  )
}

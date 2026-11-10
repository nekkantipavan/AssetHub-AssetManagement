import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Layout from './components/layout/Layout'
import { useEffect, useState, lazy, Suspense } from 'react'
import PageState from './components/common/PageState'
import RouteBoundary from './components/common/RouteBoundary'

const Login = lazy(() => import('./pages/Login'))
const ForceChangePassword = lazy(() => import('./pages/ForceChangePassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Assets = lazy(() => import('./pages/Assets'))
const AssetDetail = lazy(() => import('./pages/AssetDetail'))
const BulkUpload = lazy(() => import('./pages/BulkUpload'))
const Transfer = lazy(() => import('./pages/Transfer'))
const NewTransfer = lazy(() => import('./pages/NewTransfer'))
const TransferDetail = lazy(() => import('./pages/TransferDetail'))
const ReturnProcessing = lazy(() => import('./pages/ReturnProcessing'))
const AssetRequests = lazy(() => import('./pages/AssetRequests'))
const NewAssetRequest = lazy(() => import('./pages/NewAssetRequest'))
const AssetRequestDetail = lazy(() => import('./pages/AssetRequestDetail'))
const Plants = lazy(() => import('./pages/Plants'))
const Departments = lazy(() => import('./pages/Departments'))
const MastersManagement = lazy(() => import('./pages/MastersManagement'))
const EmailMasters = lazy(() => import('./pages/EmailMasters'))
const Users = lazy(() => import('./pages/Users'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const AssetReport = lazy(() => import('./pages/AssetReport'))
const TransferReport = lazy(() => import('./pages/TransferReport'))
const RoleManagement = lazy(() => import('./pages/RoleManagement'))
const ChallanSettings = lazy(() => import('./pages/ChallanSettings'))
const ChallanRepository = lazy(() => import('./pages/ChallanRepository'))

// Pages that go inside the Layout (sidebar + header)
const pages = [
  { path:'dashboard',   element:<Dashboard />,        page:'dashboard'   },
  { path:'assets',       element:<Assets />,            page:'assets'      },
  { path:'assets/:id',  element:<AssetDetail />,       page:'assets'      },
  { path:'bulk-upload', element:<BulkUpload />,        page:'bulk-upload' },
  { path:'asset-requests',     element:<AssetRequests />,      page:'asset-requests' },
  { path:'asset-requests/new', element:<NewAssetRequest />,    page:'asset-requests' },
  { path:'asset-requests/:id', element:<AssetRequestDetail />, page:'asset-requests' },
  { path:'transfer',    element:<Transfer />,          page:'transfer'    },
  { path:'transfer/new',element:<NewTransfer />,       page:'transfer'    },
  { path:'transfer/:id',element:<TransferDetail />,    page:'transfer'    },
  { path:'transfer/:id/return', element:<ReturnProcessing />, page:'transfer' },
  { path:'challans',          element:<ChallanRepository />, page:'transfer'    },
  { path:'plants',      element:<Plants />,            page:'plants'      },
  { path:'departments', element:<Departments />,       page:'departments' },
  { path:'masters',     element:<MastersManagement />, page:'departments' },
  { path:'email-masters',element:<EmailMasters />,     page:'users'       },
  { path:'users',       element:<Users />,             page:'users'       },
  { path:'audit-logs',        element:<AuditLogs />,        page:'audit-logs'      },
  { path:'reports/assets',    element:<AssetReport />,      page:'reports'         },
  { path:'reports/transfers', element:<TransferReport />,   page:'reports'         },
  { path:'role-management',   element:<RoleManagement />,   page:'role-management' },
  { path:'challan-settings',  element:<ChallanSettings />,  page:'challan-settings' },
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
        <RouteBoundary><Suspense fallback={<PageState label="Loading page…"/>}><AppRoutes /></Suspense></RouteBoundary>
      </div>
    </AuthProvider>
  )
}

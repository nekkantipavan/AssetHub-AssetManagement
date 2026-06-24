import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Box, Upload, ArrowLeftRight,
  Building2, Layers, Tag, Mail, Users, ScrollText,
  LogOut, Plus, List, FileBox, FileText, ShieldCheck
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../context/AuthContext'

const allNavItems = [
  { label:'Dashboard',   icon:LayoutDashboard, path:'/dashboard',   page:'dashboard'   },
  { label:'Assets',      icon:Box,             path:'/assets',       page:'assets'      },
  { label:'Bulk Upload', icon:Upload,          path:'/bulk-upload',  page:'bulk-upload' },
]

const allMasterItems = [
  { label:'Plants',        icon:Building2, path:'/plants',         page:'plants'      },
  { label:'Departments',   icon:Layers,    path:'/departments',    page:'departments' },
  { label:'Asset Masters', icon:Tag,       path:'/masters',        page:'departments' },
  { label:'Email Masters', icon:Mail,      path:'/email-masters',  page:'users'       },
]

const allReportItems = [
  { label:'Asset Report',    icon:FileBox,  path:'/reports/assets',    page:'reports' },
  { label:'Transfer Report', icon:FileText, path:'/reports/transfers', page:'reports' },
]

const allSystemItems = [
  { label:'Users',           icon:Users,       path:'/users',           page:'users'           },
  { label:'Audit Logs',      icon:ScrollText,  path:'/audit-logs',      page:'audit-logs'      },
  { label:'Role Management', icon:ShieldCheck, path:'/role-management', page:'role-management' },
]

const roleColors = {
  Admin:   'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
  Manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  User:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

function NavItem({ item }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/transfer'}
      className={({ isActive }) =>
        clsx('sidebar-link', isActive && 'active')
      }
    >
      <item.icon size={18}/>
      <span>{item.label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, logout, canAccess } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const visible = items => items.filter(i => canAccess(i.page) !== false)

  const navItems    = visible(allNavItems)
  const masterItems = visible(allMasterItems)
  const reportItems = visible(allReportItems)
  const systemItems = visible(allSystemItems)

  const showTransfer = canAccess('transfer') !== false
  const isTransferActive = location.pathname.startsWith('/transfer')

  function handleLogout() { logout(); navigate('/login') }

  const initials = user?.name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || '??'

  return (
    <aside className="w-56 flex-shrink-0 bg-white dark:bg-gray-800 flex flex-col shadow-soft overflow-y-auto border-r border-cream-200 dark:border-gray-700">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-cream-200 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-gradient flex items-center justify-center shadow-soft">
            <Box size={16} className="text-white" strokeWidth={2.5}/>
          </div>
          <div>
            <p className="text-sm font-bold text-ink-900 dark:text-gray-100 leading-none">AssetHub</p>
            <p className="text-xs text-ink-300 dark:text-gray-500 mt-0.5">Management System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => <NavItem key={item.path} item={item}/>)}

        {/* Transfers — with sub-links */}
        {showTransfer && (
          <div>
            <NavLink to="/transfer" end
              className={({ isActive }) =>
                clsx('sidebar-link', isActive && 'active')
              }>
              <ArrowLeftRight size={18}/>
              <span>Transfers</span>
            </NavLink>

            {/* Sub-nav shown when on any transfer page */}
            {isTransferActive && (
              <div className="ml-6 mt-1 space-y-0.5 border-l-2 border-brand-200 dark:border-brand-800 pl-3">
                <NavLink to="/transfer" end
                  className={({ isActive }) =>
                    clsx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all',
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                        : 'text-ink-500 dark:text-gray-400 hover:bg-cream-100 dark:hover:bg-gray-700')
                  }>
                  <List size={13}/>
                  Transfer List
                </NavLink>
                {canAccess('transfer') === true && (
                  <NavLink to="/transfer/new"
                    className={({ isActive }) =>
                      clsx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all',
                        isActive
                          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                          : 'text-ink-500 dark:text-gray-400 hover:bg-cream-100 dark:hover:bg-gray-700')
                    }>
                    <Plus size={13}/>
                    New Transfer
                  </NavLink>
                )}
              </div>
            )}
          </div>
        )}

        {masterItems.length > 0 && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-4 text-xs font-semibold text-ink-300 dark:text-gray-500 uppercase tracking-wider">Masters</p>
            </div>
            {masterItems.map(item => <NavItem key={item.path} item={item}/>)}
          </>
        )}

        {reportItems.length > 0 && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-4 text-xs font-semibold text-ink-300 dark:text-gray-500 uppercase tracking-wider">Reports</p>
            </div>
            {reportItems.map(item => <NavItem key={item.path} item={item}/>)}
          </>
        )}

        {systemItems.length > 0 && (
          <>
            <div className="pt-4 pb-1">
              <p className="px-4 text-xs font-semibold text-ink-300 dark:text-gray-500 uppercase tracking-wider">System</p>
            </div>
            {systemItems.map(item => <NavItem key={item.path} item={item}/>)}
          </>
        )}
      </nav>

      {/* User card + logout */}
      <div className="px-3 pb-4 space-y-1.5">
        <div className="bg-cream-100 dark:bg-gray-700 rounded-xl p-2.5 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-gradient flex items-center justify-center text-white text-xs font-bold shadow-soft flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink-900 dark:text-gray-100 truncate">{user?.name}</p>
            <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded-lg', roleColors[user?.role])}>
              {user?.role}
            </span>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
                     text-ink-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20
                     hover:text-red-500 transition-all duration-200">
          <LogOut size={15}/>
          Sign out
        </button>
      </div>
    </aside>
  )
}

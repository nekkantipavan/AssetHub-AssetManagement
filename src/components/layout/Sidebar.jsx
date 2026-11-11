import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Box, Upload, ArrowLeftRight,
  Building2, Layers, Tag, Mail, Users, ScrollText,
  X, Plus, List, FileBox, FileText, ShieldCheck, ClipboardList, Receipt, FolderArchive
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../context/AuthContext'

const allNavItems = [
  { label:'Dashboard',      icon:LayoutDashboard, path:'/dashboard',      page:'dashboard'      },
  { label:'Assets',         icon:Box,             path:'/assets',         page:'assets'         },
  { label:'Asset Requests', icon:ClipboardList,   path:'/asset-requests', page:'asset-requests' },
  { label:'Bulk Upload',    icon:Upload,          path:'/bulk-upload',    page:'bulk-upload'    },
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
  { label:'Users',            icon:Users,         path:'/users',            page:'users'            },
  { label:'Audit Logs',       icon:ScrollText,    path:'/audit-logs',       page:'audit-logs'       },
  { label:'Role Management',  icon:ShieldCheck,   path:'/role-management',  page:'role-management'  },
  { label:'Challan Settings', icon:Receipt,       path:'/challan-settings', page:'challan-settings' },
  { label:'Challan Vault',    icon:FolderArchive, path:'/challans',         page:'transfer'         },
]

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

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { canAccess } = useAuth()
  const location  = useLocation()

  const visible = items => items.filter(i => canAccess(i.page) !== false)

  const navItems    = visible(allNavItems)
  const masterItems = visible(allMasterItems)
  const reportItems = visible(allReportItems)
  const systemItems = visible(allSystemItems)

  const showTransfer = canAccess('transfer') !== false
  const isTransferActive = location.pathname.startsWith('/transfer')

  return (
    <aside aria-label="Main navigation" onClick={e => { if (e.target.closest('a')) onClose() }} className={clsx("fixed inset-y-0 left-0 z-40 md:static w-56 flex-shrink-0 bg-white dark:bg-gray-800 flex flex-col shadow-soft overflow-y-auto border-r border-cream-200 dark:border-gray-700 transition-transform", open ? "translate-x-0" : "-translate-x-full md:translate-x-0")}>
      <div className="flex items-center justify-between border-b border-cream-200 px-4 py-3 dark:border-gray-700 md:hidden">
        <p className="text-sm font-semibold">Navigation</p>
        <button type="button" aria-label="Close navigation" onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-cream-100 dark:hover:bg-gray-700"><X size={18}/></button>
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

    </aside>
  )
}

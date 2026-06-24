import { useLocation, useNavigate } from 'react-router-dom'
import { Search, Bell, ChevronDown, LogOut, KeyRound, CheckCheck, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import ChangePasswordModal from '../common/ChangePasswordModal'
import clsx from 'clsx'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../data/api'

const pageTitles = {
  '/dashboard':          { title:'Dashboard',       sub:'Welcome back'                },
  '/assets':             { title:'Assets',          sub:'Manage all your assets'      },
  '/bulk-upload':        { title:'Bulk Upload',     sub:'Import assets from Excel/CSV'},
  '/transfer':           { title:'Transfers',       sub:'Move assets between plants'  },
  '/plants':             { title:'Plants',          sub:'Manage plant locations'      },
  '/departments':        { title:'Departments',     sub:'Manage departments'          },
  '/users':              { title:'Users',           sub:'Manage system users'         },
  '/audit-logs':         { title:'Audit Logs',      sub:'Track all system activity'   },
  '/reports/assets':     { title:'Asset Report',      sub:'Asset inventory report'      },
  '/reports/transfers':  { title:'Transfer Report',   sub:'Transfer records report'     },
  '/role-management':    { title:'Role Management',   sub:'Configure role permissions'  },
}

const roleColors = {
  Admin:   'bg-brand-100 text-brand-700',
  Manager: 'bg-purple-100 text-purple-700',
  User:    'bg-gray-100 text-gray-600',
}

const NOTIF_ICON = {
  transfer_approved: <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5"/>,
  transfer_rejected: <XCircle    size={14} className="text-red-500    flex-shrink-0 mt-0.5"/>,
  return_approved:   <RotateCcw  size={14} className="text-teal-500   flex-shrink-0 mt-0.5"/>,
  return_rejected:   <XCircle    size={14} className="text-red-500    flex-shrink-0 mt-0.5"/>,
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function NotificationPanel({ notifications, onMarkAll, onMarkOne, onNavigate, onClose }) {
  const unread = notifications.filter(n => !n.is_read).length

  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-medium border border-cream-200 dark:border-gray-700 z-30 overflow-hidden">
      <div className="px-4 py-3 border-b border-cream-100 dark:border-gray-700 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-ink-900 dark:text-white">Notifications</p>
          {unread > 0 && <p className="text-xs text-ink-400 dark:text-gray-400">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAll}
            className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline"
          >
            <CheckCheck size={13}/> Mark all read
          </button>
        )}
      </div>

      <div className="overflow-y-auto max-h-80">
        {notifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell size={24} className="mx-auto mb-2 text-ink-200 dark:text-gray-600"/>
            <p className="text-sm text-ink-300 dark:text-gray-500">No notifications yet</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => {
                onMarkOne(n.id)
                onNavigate(n)
                onClose()
              }}
              className={clsx(
                'w-full text-left px-4 py-3 flex items-start gap-3 border-b border-cream-100 dark:border-gray-700 last:border-0 transition-colors',
                n.is_read
                  ? 'hover:bg-cream-50 dark:hover:bg-gray-750'
                  : 'bg-brand-50/50 dark:bg-brand-900/10 hover:bg-brand-50 dark:hover:bg-brand-900/20'
              )}
            >
              <div className="mt-0.5">{NOTIF_ICON[n.type] || <Bell size={14} className="text-ink-300"/>}</div>
              <div className="flex-1 min-w-0">
                <p className={clsx('text-xs leading-snug', n.is_read ? 'text-ink-600 dark:text-gray-300' : 'text-ink-800 dark:text-gray-100 font-medium')}>
                  {n.message}
                </p>
                <p className="text-xs text-ink-300 dark:text-gray-500 mt-0.5">{timeAgo(n.created_at)}</p>
              </div>
              {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1"/>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default function Header() {
  const { pathname } = useLocation()
  const { user, logout, canAccess } = useAuth()
  const navigate = useNavigate()

  const [dropOpen,      setDropOpen]      = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const [showChangePw,  setShowChangePw]  = useState(false)
  const [notifications, setNotifications] = useState([])
  const [theme,         setTheme]         = useState(localStorage.getItem('theme') || 'light')
  const notifRef = useRef(null)

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const canViewNotifs = canAccess('reports') !== false

 const fetchNotifications = useCallback(async () => {
  if (!canViewNotifs) return
  try {
    const r = await getNotifications()
    setNotifications(Array.isArray(r.data) ? r.data : [])
  } catch {
    setNotifications([])
  }
}, [canViewNotifs])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close notification panel on outside click
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch { /* silent */ }
  }

  async function handleMarkOne(id) {
    try {
      await markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch { /* silent */ }
  }

  function handleNavigateNotif(n) {
    if (n.related_id) {
      const code = n.related_code || ''
      if (code.startsWith('RET-')) navigate(`/transfer/${n.related_id}`)
      else navigate(`/transfer/${n.related_id}`)
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const page = pageTitles[pathname] || { title:'AssetHub', sub:'' }
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || '?'

  function handleLogout() { logout(); navigate('/login') }

  return (
    <>
      <header className="bg-white dark:bg-gray-800 border-b border-cream-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0 relative z-20">
        <div>
          <h1 className="text-base font-bold dark:text-white leading-none">{page.title}</h1>
          <p className="text-xs text-ink-300 dark:text-gray-400 mt-0.5">{page.sub}, {user?.name?.split(' ')[0]}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400"/>
            <input
              type="text"
              placeholder="Search assets, plants…"
              className="pl-9 pr-4 py-2 bg-cream-100 dark:bg-gray-700 rounded-2xl text-sm dark:text-white placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 w-52 transition-all"
            />
          </div>

          {/* Notifications bell */}
          {canViewNotifs && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative w-9 h-9 bg-cream-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center hover:bg-cream-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Bell size={16} className="text-ink-500 dark:text-gray-300"/>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <NotificationPanel
                  notifications={notifications}
                  onMarkAll={handleMarkAll}
                  onMarkOne={handleMarkOne}
                  onNavigate={handleNavigateNotif}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>
          )}

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropOpen(v => !v)}
              className="flex items-center gap-2 bg-cream-100 dark:bg-gray-700 hover:bg-cream-200 dark:hover:bg-gray-600 rounded-2xl px-3 py-2 transition-colors"
            >
              <div className="w-7 h-7 rounded-xl bg-orange-gradient flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold dark:text-white leading-none">{user?.name}</p>
                <span className={clsx('text-xs font-medium px-1 rounded', roleColors[user?.role])}>{user?.role}</span>
              </div>
              <ChevronDown size={14} className="text-ink-300 dark:text-gray-400 ml-1"/>
            </button>

            {dropOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)}/>
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-medium border border-cream-200 dark:border-gray-700 z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-cream-100 dark:border-gray-700">
                    <p className="text-xs font-bold dark:text-white">{user?.name}</p>
                    <p className="text-xs text-ink-400 truncate">@{user?.username}</p>
                    <p className="text-xs text-ink-300 dark:text-gray-400 truncate">{user?.email}</p>
                  </div>

                  <button
                    onClick={() => { setDropOpen(false); setShowChangePw(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-ink-600 dark:text-gray-200 hover:bg-cream-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <KeyRound size={14}/> Change Password
                  </button>

                  <button
                    onClick={() => setTheme(p => p === 'light' ? 'dark' : 'light')}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink-600 dark:text-gray-200 hover:bg-cream-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>Dark Mode</span>
                    <span className="text-lg">{theme === 'dark' ? '🌙' : '☀️'}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors border-t border-cream-100 dark:border-gray-700"
                  >
                    <LogOut size={14}/> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <ChangePasswordModal isOpen={showChangePw} onClose={() => setShowChangePw(false)}/>
    </>
  )
}

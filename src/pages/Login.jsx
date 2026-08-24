import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, User, Lock, Eye, EyeOff, AlertCircle,
  ShieldCheck, BarChart3, Users as UsersIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: Box,         title: 'Asset Tracking',     desc: 'Real-time visibility',      color: 'text-brand-500'  },
  { icon: ShieldCheck, title: 'Secure & Reliable',   desc: 'Enterprise grade security', color: 'text-blue-500'   },
  { icon: BarChart3,   title: 'Insights & Reports',  desc: 'Data-driven decisions',     color: 'text-green-500'  },
  { icon: UsersIcon,   title: 'Role Based Access',   desc: 'Manage permissions',        color: 'text-purple-500' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [showForgotHint, setShowForgotHint] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      await login(username.trim(), password, remember)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid credentials'
      setError(
        msg.toLowerCase().includes('password') ||
        msg.toLowerCase().includes('invalid') ||
        msg.toLowerCase().includes('credentials')
          ? 'Invalid username or password'
          : msg
      )
    } finally {
      setLoading(false)
    }
  }

  const isError = !!error

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col bg-cream-50 dark:bg-gray-950">

      {/* Decorative background — NeoLync doodle artwork (logistics/RFID/warehouse), dimmed for readability */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.16] dark:opacity-[0.10] pointer-events-none"
        style={{ backgroundImage: 'url(/neolync-bg.png)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-cream-50/90 via-white/80 to-blue-50/70 dark:from-gray-950/90 dark:via-gray-900/85 dark:to-gray-900/80 pointer-events-none" />

      {/* Soft glow behind the card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] bg-brand-200/25 dark:bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Centered content ── */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-gradient shadow-soft mb-3 transition-transform duration-200 hover:scale-105 hover:rotate-3">
              <Box size={24} className="text-white" strokeWidth={2.5} />
            </div>
            <p className="text-lg font-bold text-ink-900 dark:text-white leading-none">AssetHub</p>
            <p className="text-xs text-ink-400 dark:text-gray-500 mt-1">Asset Management System</p>
          </div>

          {/* Login card */}
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-white/60 dark:border-gray-800 transition-shadow duration-300 hover:shadow-[0_12px_48px_rgba(0,0,0,0.14)]">

            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-ink-900 dark:text-white">Welcome back</h2>
              <p className="text-sm text-ink-400 dark:text-gray-400 mt-1">Sign in to your account</p>
            </div>

            {isError && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm text-red-600 font-medium">
                <AlertCircle size={16} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* USERNAME */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">
                  Username
                </label>
                <div className="relative group">
                  <User
                    size={15}
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors
                      ${isError ? 'text-red-400' : 'text-ink-300 dark:text-gray-400 group-focus-within:text-brand-500'}`}
                  />
                  <input
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    placeholder="Enter username"
                    autoComplete="username"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border-2 transition-all
                      ${isError
                        ? 'bg-red-50 border-red-300 text-red-900 placeholder-red-300 focus:border-red-400'
                        : 'bg-cream-100 dark:bg-gray-800 dark:text-white border-transparent hover:border-brand-200 dark:hover:border-gray-600 focus:border-brand-300 focus:bg-white dark:focus:bg-gray-700'}`}
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative group">
                  <Lock
                    size={15}
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors
                      ${isError ? 'text-red-400' : 'text-ink-300 dark:text-gray-400 group-focus-within:text-brand-500'}`}
                  />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none border-2 transition-all
                      ${isError
                        ? 'bg-red-50 border-red-300 text-red-900 placeholder-red-300 focus:border-red-400'
                        : 'bg-cream-100 dark:bg-gray-800 dark:text-white border-transparent hover:border-brand-200 dark:hover:border-gray-600 focus:border-brand-300 focus:bg-white dark:focus:bg-gray-700'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors
                      ${isError ? 'text-red-400 hover:text-red-600' : 'text-ink-300 hover:text-brand-500 dark:text-gray-400 dark:hover:text-brand-400'}`}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* REMEMBER ME + FORGOT PASSWORD */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-cream-300 text-brand-500 focus:ring-brand-400 focus:ring-offset-0"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotHint(v => !v)}
                  className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {showForgotHint && (
                <p className="text-xs text-ink-400 dark:text-gray-500 -mt-2">
                  Please contact your system administrator to reset your password.
                </p>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-orange-gradient text-white rounded-xl font-semibold
                           shadow-soft transition-all duration-200 hover:shadow-medium hover:-translate-y-0.5
                           active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0 mt-2"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

            </form>

            {/* Contact info */}
            <div className="mt-6 pt-5 border-t border-cream-200 dark:border-gray-800 flex items-center justify-center gap-2 text-xs text-ink-400 dark:text-gray-500">
              <ShieldCheck size={14} className="flex-shrink-0" />
              Contact Administrator for credentials
            </div>
          </div>

          {/* Feature strip */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="group flex flex-col items-center text-center gap-2 p-3 rounded-2xl bg-white/70 dark:bg-gray-800/60
                           backdrop-blur-sm border border-white/60 dark:border-gray-800
                           transition-all duration-200 hover:-translate-y-1 hover:shadow-medium hover:bg-white dark:hover:bg-gray-800"
              >
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-900 shadow-soft flex items-center justify-center
                                 transition-transform duration-200 group-hover:scale-110">
                  <f.icon size={16} className={f.color} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-900 dark:text-white leading-none">{f.title}</p>
                  <p className="text-[10px] text-ink-400 dark:text-gray-500 mt-1 leading-tight">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <footer className="relative z-10 text-center text-xs text-ink-300 dark:text-gray-600 py-4">
        © {new Date().getFullYear()} AssetHub. All rights reserved.
      </footer>
    </div>
  )
}

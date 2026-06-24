import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e) {
    e.preventDefault()

    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      await login(username.trim(), password)
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
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center relative"
      style={{ backgroundImage: 'url(/neolync-bg.png)' }}
    >
      {/* Subtle white overlay so the card stands out */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px]" />

      {/* ── Centered login card ── */}
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6">
        <div className="w-full">

          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-gradient shadow-medium mb-3">
              <Box size={28} className="text-white" strokeWidth={2.5}/>
            </div>
            <h1 className="text-xl font-bold dark:text-white">AssetHub</h1>
            <p className="text-sm text-ink-400 mt-1">Asset Management System</p>
          </div>

          <h2 className="text-base font-bold dark:text-white mb-1">Welcome back</h2>
          <p className="text-sm text-ink-400 mb-5">Sign in to your account</p>

          {/* Error banner */}
          {isError && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm text-red-600 font-medium">
              <AlertCircle size={16} className="flex-shrink-0"/>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* USERNAME */}
            <div>
              <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User
                  size={15}
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none
                    ${isError ? 'text-red-400' : 'text-ink-300 dark:text-gray-400'}`}
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
                      : 'bg-cream-100 dark:bg-gray-800 dark:text-white border-transparent focus:border-brand-300 focus:bg-white dark:focus:bg-gray-700'}`}
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-xs font-semibold text-ink-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none
                    ${isError ? 'text-red-400' : 'text-ink-300 dark:text-gray-400'}`}
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
                      : 'bg-cream-100 dark:bg-gray-800 dark:text-white border-transparent focus:border-brand-300 focus:bg-white dark:focus:bg-gray-700'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2
                    ${isError ? 'text-red-400 hover:text-red-600' : 'text-ink-300 hover:text-ink-500 dark:text-gray-400'}`}
                >
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-orange-gradient text-white rounded-xl font-semibold
                         hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

          </form>

          {/* Contact info */}
          <div className="mt-5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-amber-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>
            <p>Contact Administrator for credentials</p>
          </div>

        </div>
      </div>
    </div>
  )
}

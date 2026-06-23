import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../data/api'

function StrengthBar({ password }) {
  const checks = [
    password.length >= 6,
    password.length >= 10,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score  = checks.filter(Boolean).length
  const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-lime-400', 'bg-green-500']
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong']

  if (!password) return null

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2,3,4].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < score ? colors[score-1] : 'bg-cream-200'}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${score < 2 ? 'text-red-500' : score < 4 ? 'text-yellow-600' : 'text-green-600'}`}>
        {labels[Math.max(0, score-1)]}
      </p>
    </div>
  )
}

export default function ForceChangePassword() {
  const { user, clearMustChangePassword, logout } = useAuth()
  const navigate = useNavigate()

  const [current,  setCurrent]  = useState('')
  const [newPw,    setNewPw]    = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [showCon,  setShowCon]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!current)           { setError('Please enter your current (temporary) password'); return }
    if (newPw.length < 6)   { setError('New password must be at least 6 characters'); return }
    if (newPw === current)  { setError('New password must be different from your current password'); return }
    if (newPw !== confirm)  { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      await api.put('/auth/change-password', {
        current_password: current,
        new_password:     newPw,
      })
      setSuccess(true)
      clearMustChangePassword()
      setTimeout(() => navigate('/dashboard', { replace: true }), 1800)
    } catch (err) {
      setError(err.response?.data?.error || 'Password change failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (success) {
    return (
      <div className="min-h-screen bg-cream-100 dark:bg-gray-800 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-medium p-10 text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-lg font-bold border-cream-200 dark:border-gray-700 mb-1">Password Updated!</h2>
          <p className="text-sm text-ink-400">Redirecting you to the dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-800 flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-100 opacity-50" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-orange-100 opacity-40" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-orange-gradient shadow-medium mb-4">
            <ShieldCheck size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold border-cream-200 dark:border-gray-700">Set Your Password</h1>
          <p className="text-sm text-ink-400 mt-1">
            Hi <span className="font-semibold text-ink-700">{user?.name}</span>, your account uses a temporary password.<br/>
            Please set a new one to continue.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-medium p-8">
          {/* Warning banner */}
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5 text-sm text-amber-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>You must change your temporary password before accessing the system.</span>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm text-red-600">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current (temp) password */}
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1.5">
                Current (Temporary) Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400" />
                <input
                  type={showCur ? 'text' : 'password'}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  placeholder="Enter temporary password"
                  className="w-full pl-10 pr-10 py-3 bg-cream-100 dark:bg-gray-800 rounded-2xl text-sm border-cream-200 dark:border-gray-700
                             placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
                />
                <button type="button" onClick={() => setShowCur(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400 hover:text-ink-500">
                  {showCur ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1.5">New Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full pl-10 pr-10 py-3 bg-cream-100 dark:bg-gray-800 rounded-2xl text-sm border-cream-200 dark:border-gray-700
                             placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
                />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400 hover:text-ink-500">
                  {showNew ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              <StrengthBar password={newPw} />
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1.5">Confirm New Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400" />
                <input
                  type={showCon ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className={`w-full pl-10 pr-10 py-3 bg-cream-100 dark:bg-gray-800 rounded-2xl text-sm border-cream-200 dark:border-gray-700
                             placeholder-ink-300 focus:outline-none focus:ring-2 transition-all
                             ${confirm && newPw !== confirm ? 'focus:ring-red-300 ring-2 ring-red-200' : 'focus:ring-brand-300'}`}
                />
                <button type="button" onClick={() => setShowCon(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400 hover:text-ink-500">
                  {showCon ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              {confirm && newPw !== confirm && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
              {confirm && newPw === confirm && newPw.length >= 6 && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle size={11}/> Passwords match
                </p>
              )}
            </div>

            {/* Password rules */}
            <div className="bg-cream-100 dark:bg-gray-800 rounded-2xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-ink-500">Password requirements</p>
              {[
                { label: 'At least 6 characters', check: newPw.length >= 6 },
                { label: 'Uppercase letter (A–Z)', check: /[A-Z]/.test(newPw) },
                { label: 'Number (0–9)',            check: /[0-9]/.test(newPw) },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-2 text-xs">
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0
                    ${r.check ? 'bg-green-500' : 'bg-cream-300'}`}>
                    {r.check && <CheckCircle size={9} className="text-white" />}
                  </div>
                  <span className={r.check ? 'text-green-700' : 'text-ink-400'}>{r.label}</span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || newPw !== confirm || newPw.length < 6}
              className="w-full py-3 bg-orange-gradient text-white font-semibold rounded-2xl shadow-soft
                         hover:shadow-medium hover:opacity-90 transition-all duration-200
                         disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Updating…</>
                : 'Set New Password'
              }
            </button>
          </form>

          <div className="mt-4 text-center">
            <button onClick={handleLogout} className="text-xs text-ink-300 dark:text-gray-400 hover:text-ink-500 transition-colors">
              Sign out and log in with a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

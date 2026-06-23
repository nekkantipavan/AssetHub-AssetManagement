import { useState } from 'react'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import api from '../../data/api'

function StrengthBar({ password }) {
  const score = [
    password.length >= 6,
    password.length >= 10,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  const colors = ['bg-red-400','bg-orange-400','bg-yellow-400','bg-lime-400','bg-green-500']
  const labels = ['Very weak','Weak','Fair','Good','Strong']

  if (!password) return null
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[0,1,2,3,4].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < score ? colors[score-1] : 'bg-cream-200'}`} />
        ))}
      </div>
      <p className={`text-xs font-medium ${score < 2 ? 'text-red-500' : score < 4 ? 'text-yellow-600' : 'text-green-600'}`}>
        {labels[Math.max(0, score-1)]}
      </p>
    </div>
  )
}

function PwField({ label, value, onChange, show, onToggle, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-700 mb-1.5">{label}</label>
      <div className="relative">
        <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-cream-100 dark:bg-gray-800 rounded-2xl text-sm border-cream-200 dark:border-gray-700
                     placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-300 dark:text-gray-400 hover:text-ink-500">
          {show ? <EyeOff size={14}/> : <Eye size={14}/>}
        </button>
      </div>
    </div>
  )
}

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [current, setCurrent] = useState('')
  const [newPw,   setNewPw]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [s1, setS1] = useState(false)
  const [s2, setS2] = useState(false)
  const [s3, setS3] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  function reset() {
    setCurrent(''); setNewPw(''); setConfirm('')
    setError(''); setSuccess(false)
  }

  function handleClose() { reset(); onClose() }

  async function handleSubmit() {
    setError('')
    if (!current)          { setError('Enter your current password'); return }
    if (newPw.length < 6)  { setError('New password must be at least 6 characters'); return }
    if (newPw === current)  { setError('New password must differ from current'); return }
    if (newPw !== confirm)  { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      await api.put('/auth/change-password', { current_password: current, new_password: newPw })
      setSuccess(true)
      setTimeout(() => { handleClose() }, 2000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Change Password" size="sm">
      {success ? (
        <div className="py-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-green-500" />
          </div>
          <p className="font-semibold border-cream-200 dark:border-gray-700">Password changed successfully!</p>
          <p className="text-sm text-ink-400">Closing in a moment…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={15} className="flex-shrink-0" />{error}
            </div>
          )}

          <PwField
            label="Current Password"
            value={current} onChange={e => setCurrent(e.target.value)}
            show={s1} onToggle={() => setS1(v=>!v)}
            placeholder="Your current password"
          />

          <div>
            <PwField
              label="New Password"
              value={newPw} onChange={e => setNewPw(e.target.value)}
              show={s2} onToggle={() => setS2(v=>!v)}
              placeholder="Min. 6 characters"
            />
            <StrengthBar password={newPw} />
          </div>

          <div>
            <PwField
              label="Confirm New Password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              show={s3} onToggle={() => setS3(v=>!v)}
              placeholder="Re-enter new password"
            />
            {confirm && newPw !== confirm && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
            {confirm && newPw === confirm && newPw.length >= 6 && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={10}/>Passwords match</p>
            )}
          </div>

          {/* Requirements */}
          <div className="bg-cream-100 dark:bg-gray-800 rounded-2xl px-4 py-3 space-y-1.5">
            {[
              { label:'At least 6 characters',  check: newPw.length >= 6    },
              { label:'Uppercase letter (A–Z)',  check: /[A-Z]/.test(newPw)  },
              { label:'Number (0–9)',             check: /[0-9]/.test(newPw)  },
            ].map(r => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 ${r.check ? 'bg-green-500' : 'bg-cream-300'}`}>
                  {r.check && <CheckCircle size={9} className="text-white"/>}
                </div>
                <span className={r.check ? 'text-green-700' : 'text-ink-400'}>{r.label}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading || newPw !== confirm || newPw.length < 6}>
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Saving…</>
                : 'Update Password'
              }
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

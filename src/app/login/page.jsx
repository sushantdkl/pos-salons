'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react'
import { ROLE_LABELS, normalizeRole } from '@/constants/roles'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const { login } = useAuth()

  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await fetch('/api/users/active')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load staff')
        setUsers(data.users || [])
      } catch (err) {
        setUsers([])
        setError(err.message || 'Unable to load active staff')
      } finally {
        setLoadingUsers(false)
      }
    }
    fetchUsers()
  }, [])

  const selectedUser = useMemo(
    () => users.find((user) => user.username === username),
    [users, username]
  )

  const selectUser = (user) => {
    setUsername(user.username)
    setPassword('')
    setError('')
  }

  const handleLogin = async () => {
    if (!username) {
      setError('Please select your staff profile')
      return
    }

    if (!/^\d{4,8}$/.test(password)) {
      setError('Enter your 4 to 8 digit PIN')
      return
    }

    setLoading(true)
    setError('')

    const result = await login(username, password)

    if (!result.success) {
      setError(result.error || 'Invalid PIN')
      setPassword('')
    }

    setLoading(false)
  }

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-neutral-950',
      cashier: 'bg-teal-700',
      barber: 'bg-amber-700',
      stylist: 'bg-indigo-700',
      beautician: 'bg-pink-700',
    }
    return colors[normalizeRole(role)] || 'bg-gray-600'
  }

  const getProfileLabel = (user) => {
    const role = normalizeRole(user.role)
    const serviceRole = normalizeRole(user.salon_role || user.role)
    if (role === 'cashier' && serviceRole === 'beautician') return 'Cashier / Beautician'
    return ROLE_LABELS[role] || 'Staff'
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f4ef] px-4 py-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex flex-col justify-between rounded-3xl bg-[#171411] p-8 text-white shadow-xl">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85">
              <ShieldCheck className="h-4 w-4" />
              Secure staff access
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">The Hair Cut POS</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/70">
              Select your staff profile and enter your private PIN to continue to the salon dashboard.
            </p>
          </div>
        </section>

        <Card className="border-[#e7ded2] bg-white/95 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <LockKeyhole className="h-6 w-6" />
              Staff Login
            </CardTitle>
            <CardDescription>
              {selectedUser ? `Continue as ${selectedUser.full_name}` : 'Choose your staff profile to sign in'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">Staff profile</span>
                {loadingUsers ? <span className="text-xs font-medium text-gray-500">Loading...</span> : null}
              </div>
              <div className="grid max-h-[330px] gap-2 overflow-y-auto pr-1">
                {loadingUsers ? (
                  <div className="rounded-xl border border-dashed border-[#e7ded2] py-10 text-center text-sm text-gray-500">
                    Loading active staff...
                  </div>
                ) : users.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#e7ded2] py-10 text-center text-sm text-gray-500">
                    No active staff found. Contact the administrator.
                  </div>
                ) : (
                  users.map((user) => {
                    const role = normalizeRole(user.role)
                    const selected = username === user.username
                    return (
                      <button
                        key={user.username}
                        type="button"
                        onClick={() => selectUser(user)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-neutral-950 bg-[#f7f4ef] shadow-sm'
                            : 'border-[#e7ded2] bg-white hover:border-neutral-400 hover:bg-[#fffaf8]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${getRoleColor(role)} text-base font-semibold text-white`}>
                            {(user.full_name || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-950">{user.full_name}</div>
                            <div className="text-sm text-gray-600">{getProfileLabel(user)}</div>
                          </div>
                          {selected ? (
                            <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white">Selected</span>
                          ) : null}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-900">PIN Code</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleLogin()
                }}
                disabled={!username || loading}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-lg tracking-[0.35em] text-gray-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-900/15 disabled:bg-gray-100"
                placeholder="••••"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}

            <Button
              onClick={handleLogin}
              disabled={!username || password.length < 4 || loading}
              className="h-12 w-full rounded-2xl text-base"
              size="lg"
            >
              {loading ? 'Signing in...' : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <UserRound className="h-3.5 w-3.5" />
              Staff access only
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

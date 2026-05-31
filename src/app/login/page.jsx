'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogIn } from 'lucide-react'
import { DEMO_ACCESS_PROFILES, ROLE_DEMO_PINS, ROLE_LABELS, USER_DEMO_PINS, normalizeRole } from '@/constants/roles'

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
        if (response.ok) {
          const data = await response.json()
          setUsers(data.users || [])
        }
      } catch {
        setError('Unable to load active users')
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
  const selectedRole = normalizeRole(selectedUser?.role)
  const suggestedPin = USER_DEMO_PINS[selectedUser?.username] || ROLE_DEMO_PINS[selectedRole]

  const selectUser = (user) => {
    setUsername(user.username)
    const role = normalizeRole(user.role)
    setPassword(USER_DEMO_PINS[user.username] || ROLE_DEMO_PINS[role] || '')
    setError('')
  }

  const handleLogin = async () => {
    if (!username) {
      setError('Please select a user')
      return
    }

    if (password.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }

    setLoading(true)
    setError('')

    const result = await login(username, password)

    if (!result.success) {
      setError(result.error || 'Invalid credentials')
    }

    setLoading(false)
  }

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-neutral-900',
      cashier: 'bg-teal-600',
      barber: 'bg-amber-700',
      stylist: 'bg-indigo-600',
      beautician: 'bg-pink-600',
    }
    return colors[normalizeRole(role)] || 'bg-gray-500'
  }

  const getProfileLabel = (user) => {
    const role = normalizeRole(user.role)
    const serviceRole = normalizeRole(user.salon_role || user.role)
    if (role === 'cashier' && serviceRole === 'beautician') return 'Cashier / Beautician'
    return ROLE_LABELS[role]
  }

  return (
    <div className="min-h-screen bg-[#f7f4ef] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid gap-6 md:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-[#e7ded2] shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">The Hair Cut POS</CardTitle>
            <CardDescription>Select your role profile to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-[#e7ded2] bg-[#fffaf4] p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Demo Access</div>
              <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                {DEMO_ACCESS_PROFILES.map((profile) => (
                  <div key={profile.username} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                    <span className="font-medium">{profile.name} ({profile.label})</span>
                    <span className="font-semibold text-gray-950">PIN {profile.pin}</span>
                  </div>
                ))}
              </div>
            </div>
            {loadingUsers ? (
              <div className="py-10 text-center text-sm text-gray-600">Loading active staff...</div>
            ) : users.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-600">No active staff found</div>
            ) : (
              users.map((user) => {
                const role = normalizeRole(user.role)
                return (
                  <button
                    key={user.username}
                    onClick={() => selectUser(user)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      username === user.username
                        ? 'border-neutral-900 bg-white shadow-sm'
                        : 'border-[#e7ded2] bg-white/80 hover:border-neutral-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${getRoleColor(role)} text-lg font-semibold text-white`}>
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-950">{user.full_name}</div>
                        <div className="text-sm text-gray-600">{getProfileLabel(user)}</div>
                      </div>
                      <div className="rounded-lg bg-[#f7f4ef] px-3 py-1 text-xs font-semibold text-gray-700">
                        {USER_DEMO_PINS[user.username] || ROLE_DEMO_PINS[role]}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="border-[#e7ded2] shadow-sm">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              {selectedUser ? `Continue as ${selectedUser.full_name}` : 'Choose a staff profile first'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedUser && (
              <div className="rounded-xl border border-[#e7ded2] bg-[#fffaf4] p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Demo PIN</div>
                <div className="mt-1 text-2xl font-semibold tracking-wider text-gray-950">{suggestedPin}</div>
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-800">PIN Code</span>
              <input
                type="text"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!username || loading}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-gray-100"
                placeholder="Select a role to fill demo PIN"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              onClick={handleLogin}
              disabled={!username || password.length < 4 || loading}
              className="h-12 w-full text-base"
              size="lg"
            >
              {loading ? 'Signing in...' : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

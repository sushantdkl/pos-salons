'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const getDeviceId = () => {
    let deviceId = localStorage.getItem('pos_device_id')
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('pos_device_id', deviceId)
    }
    return deviceId
  }

  useEffect(() => {
    // Check for existing session
    const storedToken = localStorage.getItem('pos_token')
    const storedUser = localStorage.getItem('pos_user')
    
    if (storedToken && storedUser) {
      verifySession(storedToken, JSON.parse(storedUser))
    } else {
      setLoading(false)
    }
  }, [])

  const verifySession = async (storedToken, storedUser) => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: storedToken }),
        signal: AbortSignal.timeout(3000) // 3 second timeout
      })

      if (response.ok) {
        const data = await response.json()
        if (data.valid) {
          setToken(storedToken)
          setUser(storedUser)
        } else {
          logout()
        }
      } else {
        logout()
      }
    } catch (error) {
      console.error('Session verification failed:', error)
      // Clear invalid session
      localStorage.removeItem('pos_token')
      localStorage.removeItem('pos_user')
    } finally {
      setLoading(false)
    }
  }

  const login = async (username, pin) => {
    try {
      const deviceId = getDeviceId()
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin, deviceId })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        localStorage.setItem('pos_token', data.token)
        localStorage.setItem('pos_user', JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        
        // Redirect based on role
        redirectByRole(data.user.role)
        
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Login failed' }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'Network error' }
    }
  }

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
      } catch (error) {
        console.error('Logout error:', error)
      }
    }

    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setToken(null)
    setUser(null)
    router.push('/login')
  }

  const redirectByRole = (role) => {
    switch (role) {
      case 'admin':
        router.push('/admin')
        break
      case 'waiter':
        router.push('/waiter')
        break
      case 'cashier':
        router.push('/cashier')
        break
      case 'kitchen':
        router.push('/kitchen')
        break
      default:
        router.push('/login')
    }
  }

  const apiCall = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (response.status === 401) {
      logout()
      throw new Error('Unauthorized')
    }

    return response
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        apiCall,
        isAuthenticated: !!user && !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

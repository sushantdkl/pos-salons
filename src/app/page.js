'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { dashboardPathForRole } from '@/constants/roles'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, user, loading } = useAuth()
  const [checkingActivation, setCheckingActivation] = useState(true)

  useEffect(() => {
    // Check if system is activated
    const checkActivation = async () => {
      if (process.env.NEXT_PUBLIC_LICENSE_ENABLED !== 'true') {
        setCheckingActivation(false)
        return
      }

      try {
        const res = await fetch('/api/license/check', { 
          signal: AbortSignal.timeout(5000) // 5 second timeout
        })
        const data = await res.json()
        
        if (!data.activated) {
          router.push('/activate')
          return
        }
        
        setCheckingActivation(false)
      } catch (error) {
        console.error('Activation check failed:', error)
        // Skip activation check on error - allow access
        setCheckingActivation(false)
      }
    }

    checkActivation()
  }, [router])

  useEffect(() => {
    console.log('Home page state:', { loading, checkingActivation, isAuthenticated, user: user?.username })
    
    if (!loading && !checkingActivation) {
      if (isAuthenticated && user) {
        router.push(dashboardPathForRole(user.role))
      } else {
        router.push('/login')
      }
    }
  }, [isAuthenticated, user, loading, checkingActivation, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-gray-900 mx-auto"></div>
        <p className="mt-6 text-lg text-gray-700 font-medium">Loading Salon POS...</p>
      </div>
    </div>
  )
}

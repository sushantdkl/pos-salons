'use client'

import { createContext, useContext, useState, useEffect } from 'react'

const ShopContext = createContext(null)

export function ShopProvider({ children }) {
  const [shopInfo, setShopInfo] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('shopInfo')
    if (saved) {
      setShopInfo(JSON.parse(saved))
    }
  }, [])

  const login = (shop) => {
    localStorage.setItem('shopToken', 'authenticated')
    localStorage.setItem('shopInfo', JSON.stringify(shop))
    setShopInfo(shop)
  }

  const logout = () => {
    localStorage.removeItem('shopToken')
    localStorage.removeItem('shopInfo')
    setShopInfo(null)
  }

  // Custom fetch that includes shop_id header
  const shopFetch = async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'x-shop-id': shopInfo?.shop_id || ''
    }

    return fetch(url, { ...options, headers })
  }

  return (
    <ShopContext.Provider value={{ shopInfo, login, logout, shopFetch }}>
      {children}
    </ShopContext.Provider>
  )
}

export function useShop() {
  const context = useContext(ShopContext)
  if (!context) {
    throw new Error('useShop must be used within ShopProvider')
  }
  return context
}

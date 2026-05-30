// Global fetch wrapper - automatically adds shop_id header to all API requests
// Usage: Replace all fetch() calls with shopFetch()

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch
  
  window.fetch = function(...args) {
    const [url, options = {}] = args
    
    // Only intercept API calls
    if (typeof url === 'string' && url.startsWith('/api/') && !url.includes('/admin/') && !url.includes('/shop/login')) {
      const shopInfo = localStorage.getItem('shopInfo')
      if (shopInfo) {
        const shop = JSON.parse(shopInfo)
        const headers = {
          ...options.headers,
          'x-shop-id': shop.shop_id || ''
        }
        return originalFetch(url, { ...options, headers })
      }
    }
    
    return originalFetch(...args)
  }
}

export {}

// Global fetch wrapper that automatically adds shop_id header
export function createShopFetch() {
  return async function shopFetch(url, options = {}) {
    // Get shop info from localStorage
    const shopInfoStr = localStorage.getItem('shopInfo')
    const shopInfo = shopInfoStr ? JSON.parse(shopInfoStr) : null
    
    if (!shopInfo || !shopInfo.shop_id) {
      throw new Error('No shop session found. Please login.')
    }
    
    // Add shop_id to headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'x-shop-id': shopInfo.shop_id
    }
    
    return fetch(url, { ...options, headers })
  }
}

// Create global instance
export const shopFetch = createShopFetch()

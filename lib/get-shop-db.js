// Helper to get the correct database for the current shop session
import { getRestaurantDatabase } from './shop-db'

export function getShopDbFromRequest(request) {
  try {
    // Get shop_id from request headers
    const shopId = request.headers.get('x-shop-id')
    
    if (!shopId) {
      throw new Error('Shop ID not found in request headers')
    }
    
    if (!shopId.startsWith('shop_')) {
      throw new Error('Invalid shop ID format')
    }
    
    // Return shop-specific database
    return getRestaurantDatabase(shopId)
  } catch (error) {
    console.error('Error getting shop database:', error)
    throw error
  }
}

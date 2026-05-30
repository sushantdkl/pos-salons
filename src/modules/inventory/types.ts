export interface SalonProduct {
  id?: number;
  name: string;
  category: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  low_stock_threshold: number;
  supplier?: string;
  expiry_date?: string;
  status: 'active' | 'inactive';
}

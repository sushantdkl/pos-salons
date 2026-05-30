export interface BillLineItem {
  id: number;
  name: string;
  quantity: number;
  staff_id?: number | null;
}

export interface BillingRequest {
  customer_id?: number | null;
  customer?: { name?: string; phone?: string; notes?: string };
  services: BillLineItem[];
  products: BillLineItem[];
  discount_type?: 'amount' | 'percentage';
  discount_value?: number;
  payment_method: 'cash' | 'card' | 'online' | 'split';
}

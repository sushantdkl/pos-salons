export interface StaffProfile {
  user_id?: number;
  full_name: string;
  phone?: string;
  salon_role: 'admin' | 'cashier' | 'stylist' | 'beautician';
  assigned_services?: string;
  commission_percentage: number;
  base_salary?: number;
  is_active?: boolean;
}

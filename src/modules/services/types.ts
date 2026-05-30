export type ServiceCategory =
  | 'Haircut'
  | 'Hair Color'
  | 'Facial'
  | 'Beard'
  | 'Treatment'
  | 'Makeup'
  | 'Spa'
  | 'Other';

export interface SalonServiceInput {
  id?: number;
  name: string;
  category: ServiceCategory;
  price: number;
  duration_minutes: number;
  assigned_staff_ids?: number[] | string;
  description?: string | null;
  is_active?: boolean;
}

export interface SalonServiceRecord extends SalonServiceInput {
  id: number;
  assigned_staff_names?: string;
  created_at?: string;
  updated_at?: string;
}

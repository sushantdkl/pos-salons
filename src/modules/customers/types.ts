export interface CustomerProfile {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  gender?: string;
  address?: string;
  favorite_services?: string;
  preferred_stylist_id?: number | null;
  total_visits?: number;
  total_spent?: number;
  notes?: string;
}

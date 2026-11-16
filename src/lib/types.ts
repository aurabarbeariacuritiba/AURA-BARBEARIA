export type Role = "client" | "barber" | "admin";
export type ApptStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type PayStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";
export type PayMethod = "pix" | "credit_card" | "debit_card" | "cash";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  created_at: string;
}

export interface ShopSettings {
  id: number;
  name: string;
  about: string | null;
  address: string | null;
  whatsapp: string | null;
  instagram: string | null;
  cover_url: string | null;
  slot_interval_min: number;
  min_cancel_hours: number;
  booking_window_days: number;
  online_payment_enabled: boolean;
  pay_at_shop_enabled: boolean;
  amenities: { wifi: boolean; accessibility: boolean; parking: boolean; kids: boolean };
}

export interface BusinessHour {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
  break_start: string | null;
  break_end: string | null;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_min: number;
  image_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface Professional {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  profile_id: string | null;
  active: boolean;
  sort_order: number;
}

export interface Appointment {
  id: string;
  client_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  professional_id: string;
  service_id: string | null;
  service_name: string;
  starts_at: string;
  ends_at: string;
  price: number;
  status: ApptStatus;
  payment_status: PayStatus;
  notes: string | null;
  created_at: string;
  subscription_id: string | null;
  client?: Pick<Profile, "full_name" | "phone" | "email"> | null;
  professional?: Pick<Professional, "name"> | null;
}

export interface Payment {
  id: string;
  appointment_id: string | null;
  client_id: string | null;
  amount: number;
  method: PayMethod | null;
  status: PayStatus;
  provider: "manual" | "mercadopago";
  subscription_id: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  client?: Pick<Profile, "full_name"> | null;
  appointment?: Pick<Appointment, "service_name" | "starts_at"> | null;
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
}

export interface TimeOff {
  id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export type SubStatus = "pending" | "active" | "cancelled";

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  service_ids: string[];
  allowed_weekdays: number[] | null;
  uses_per_period: number | null;
  active: boolean;
  sort_order: number;
}

export interface Subscription {
  id: string;
  client_id: string;
  plan_id: string;
  status: SubStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  notes: string | null;
  created_at: string;
  plan?: Plan | null;
  client?: Pick<Profile, "full_name" | "phone" | "email"> | null;
}

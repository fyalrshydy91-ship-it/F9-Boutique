import { createClient } from '@supabase/supabase-js';

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SupabaseJson = Json;
export type OrderStatus = 'Pending' | 'Processing' | 'Completed' | 'Cancelled';
export type OrderItemSnapshot = {
  product_id: number;
  product_name: string;
  product_name_ar: string;
  boutique_name: string;
  boutique_name_ar: string;
  image: string;
  size: string;
  color: string;
  color_ar: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};
export type OrderRecord = {
  id: string;
  user_id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  currency: string;
  items: Json;
  created_at: string;
};

type Database = {
  public: {
    Tables: {
      favorites: {
        Row: { user_id: string; product_id: number; created_at: string };
        Insert: { user_id: string; product_id: number; created_at?: string };
        Update: { user_id?: string; product_id?: number; created_at?: string };
        Relationships: [];
      };
      orders: {
        Row: OrderRecord;
        Insert: {
          id?: string;
          user_id: string;
          order_number: string;
          status: OrderStatus;
          total: number;
          currency?: string;
          items?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          order_number?: string;
          status?: OrderStatus;
          total?: number;
          currency?: string;
          items?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      place_f9_order: {
        Args: { p_order_items: Json };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error('F9 Boutique needs its Supabase project URL and publishable key.');
}

// Supabase's publishable key is intended for browsers. Never add an admin or
// service-role key to VITE_* variables or the storefront.
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

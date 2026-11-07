import { createClient } from '@supabase/supabase-js';

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
        Row: {
          id: string;
          user_id: string;
          order_number: string;
          status: string;
          total: number;
          currency: string;
          items: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          order_number: string;
          status: string;
          total: number;
          currency?: string;
          items?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          order_number?: string;
          status?: string;
          total?: number;
          currency?: string;
          items?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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

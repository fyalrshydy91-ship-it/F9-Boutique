import type { CatalogProduct } from '@workspace/api-client-react';

// Catalog records come from Supabase via /api/catalog, never a local fallback.
export type Product = CatalogProduct;
export const image = (name: string) => `${import.meta.env.BASE_URL}images/f9-${name}.jpg`;
export type BagItem = { id: number; size: string; color: string; qty: number };
export type Filters = { category: string; brand: string; size: string; min: string; max: string };
export const blankFilters: Filters = { category: '', brand: '', size: '', min: '', max: '' };

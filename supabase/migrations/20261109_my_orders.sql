-- Order history is read-only for customers in F9.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null unique check (char_length(order_number) between 1 and 64),
  status text not null check (char_length(status) between 1 and 32),
  total numeric(12, 3) not null check (total >= 0),
  currency text not null default 'KWD' check (currency ~ '^[A-Z]{3}$'),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);

create index orders_user_created_at_idx
  on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;
revoke all on table public.orders from public, anon, authenticated;
grant select on table public.orders to authenticated;

create policy "Users read their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

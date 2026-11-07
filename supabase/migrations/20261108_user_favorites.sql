-- Customer favorites belong to the authenticated user and follow product deletion.
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index favorites_product_id_idx on public.favorites(product_id);

alter table public.favorites enable row level security;
revoke all on table public.favorites from anon, authenticated;
grant select, insert, delete on table public.favorites to authenticated;

create policy "Users read their own favorites"
  on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own favorites"
  on public.favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users remove their own favorites"
  on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

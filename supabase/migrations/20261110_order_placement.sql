-- Orders are recorded only after an authenticated user submits the existing bag.
-- Customers can read their own records, but may create them only through the
-- price- and variant-validating function below; direct table writes stay denied.
alter table public.orders
  alter column status set default 'Pending',
  add constraint orders_status_valid_check
    check (status in ('Pending', 'Processing', 'Completed', 'Cancelled'));

revoke all on table public.orders from public, anon, authenticated;
grant select on table public.orders to authenticated;

create or replace function public.place_f9_order(p_order_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_boutique public.boutiques%rowtype;
  v_product_id integer;
  v_quantity integer;
  v_size text;
  v_color text;
  v_color_ar text;
  v_line_total numeric(12, 3);
  v_total numeric(12, 3) := 0;
  v_items jsonb := '[]'::jsonb;
  v_created public.orders%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sign in to place an order.';
  end if;

  if p_order_items is null or jsonb_typeof(p_order_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'The order items are invalid.';
  end if;
  if jsonb_array_length(p_order_items) < 1 or jsonb_array_length(p_order_items) > 50 then
    raise exception using errcode = '22023', message = 'An order must contain between 1 and 50 items.';
  end if;

  for v_item in
    select entry.value
    from jsonb_array_elements(p_order_items) as entry(value)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item ->> 'product_id', '') !~ '^[1-9][0-9]{0,9}$'
      or coalesce(v_item ->> 'qty', '') !~ '^[1-9][0-9]{0,2}$' then
      raise exception using errcode = '22023', message = 'A product or quantity in the order is invalid.';
    end if;

    v_product_id := (v_item ->> 'product_id')::integer;
    v_quantity := (v_item ->> 'qty')::integer;
    v_size := nullif(btrim(v_item ->> 'size'), '');
    v_color := nullif(btrim(v_item ->> 'color'), '');

    if v_quantity > 999 or v_size is null or v_color is null then
      raise exception using errcode = '22023', message = 'A product selection in the order is invalid.';
    end if;

    select p.* into v_product
    from public.products as p
    where p.id = v_product_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'A product in the bag is no longer available.';
    end if;

    if not (v_size = any(v_product.sizes)) then
      raise exception using errcode = '22023', message = 'A selected size is no longer available.';
    end if;

    select option.value ->> 1 into v_color_ar
    from jsonb_array_elements(v_product.colors) as option(value)
    where option.value ->> 0 = v_color
    limit 1;
    if not found then
      raise exception using errcode = '22023', message = 'A selected color is no longer available.';
    end if;

    select b.* into v_boutique
    from public.boutiques as b
    where b.id = v_product.brand;
    if not found then
      raise exception using errcode = 'P0002', message = 'The boutique for a product is unavailable.';
    end if;

    v_line_total := v_product.price * v_quantity;
    v_total := v_total + v_line_total;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'product_name_ar', v_product.ar,
      'boutique_name', v_boutique.name,
      'boutique_name_ar', v_boutique.ar,
      'image', v_product.image,
      'size', v_size,
      'color', v_color,
      'color_ar', v_color_ar,
      'quantity', v_quantity,
      'unit_price', v_product.price,
      'line_total', v_line_total
    ));
  end loop;

  insert into public.orders (user_id, order_number, status, total, currency, items)
  values (
    v_user_id,
    'F9-' || upper(replace(gen_random_uuid()::text, '-', '')),
    'Pending',
    v_total,
    'KWD',
    v_items
  )
  returning * into v_created;

  return to_jsonb(v_created);
end;
$function$;

revoke all on function public.place_f9_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_f9_order(jsonb) to authenticated;

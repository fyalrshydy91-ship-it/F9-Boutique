-- Existing order-only records predate Stripe checkout; preserve them as
-- not_required while all new orders default to unpaid until verified.
alter table public.orders
  add column payment_status text not null default 'not_required',
  add column stripe_checkout_session_id text unique,
  add column paid_at timestamptz,
  add constraint orders_payment_status_valid_check
    check (payment_status in ('not_required', 'unpaid', 'paid')),
  add constraint orders_paid_fields_consistent_check
    check (
      (payment_status = 'paid'
        and stripe_checkout_session_id is not null
        and paid_at is not null)
      or
      (payment_status in ('not_required', 'unpaid')
        and paid_at is null)
    );

alter table public.orders
  alter column payment_status set default 'unpaid';

-- Customer sessions can read their own rows but cannot mark orders paid,
-- change status, or attach Stripe sessions. The Edge Function does that only
-- after verifying the session with Stripe on the server.
revoke update (status, payment_status, stripe_checkout_session_id, paid_at)
  on table public.orders
  from public, anon, authenticated;

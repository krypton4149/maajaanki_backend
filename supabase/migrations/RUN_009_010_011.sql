-- Run this entire file once in Supabase → SQL Editor
-- (fixes out-for-delivery WhatsApp when admin dashboard updates status)

-- 009 order status
alter table public.orders
  add column if not exists order_status text not null default 'confirmed',
  add column if not exists out_for_delivery_at timestamptz;

alter table public.orders drop constraint if exists orders_order_status_check;

alter table public.orders
  add constraint orders_order_status_check
  check (
    order_status in (
      'pending',
      'confirmed',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  );

-- 010 sent flag
alter table public.orders
  add column if not exists out_for_delivery_whatsapp_sent boolean not null default false;

-- 013 legacy boolean for admin UI (run 013_out_for_delivery_boolean.sql)

-- 011 trigger: enable pg_net in Dashboard first, then run 012_fix_pgnet_trigger.sql
-- (pg_net block moved to 012 — old "with schema extensions" install often fails silently)

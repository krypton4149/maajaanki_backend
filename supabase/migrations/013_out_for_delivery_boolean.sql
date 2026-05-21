-- Legacy admin dashboard boolean (frontend Live Orders). Keep in sync with order_status.

alter table public.orders
  add column if not exists out_for_delivery boolean not null default false;

comment on column public.orders.out_for_delivery is
  'True when order is out for delivery (admin Live Orders pill). Synced with order_status.';

-- Backfill from order_status when boolean was never set
update public.orders
set out_for_delivery = true
where order_status = 'out_for_delivery'
  and out_for_delivery is distinct from true;

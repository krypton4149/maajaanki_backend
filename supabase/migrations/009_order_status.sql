-- Admin dashboard: kitchen / delivery status (separate from payment_status)

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

comment on column public.orders.order_status is 'Admin live orders: confirmed, out_for_delivery, etc.';
comment on column public.orders.out_for_delivery_at is 'When order was marked out for delivery.';

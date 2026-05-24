-- Delivery charge + GST breakdown on orders (admin dashboard & receipts)

alter table public.orders
  add column if not exists delivery_charge numeric not null default 0,
  add column if not exists cgst numeric not null default 0,
  add column if not exists sgst numeric not null default 0,
  add column if not exists total_gst numeric not null default 0;

comment on column public.orders.delivery_charge is 'Delivery fee applied (₹). 0 when free delivery.';
comment on column public.orders.cgst is 'CGST amount embedded in total (₹), typically 2.5%.';
comment on column public.orders.sgst is 'SGST amount embedded in total (₹), typically 2.5%.';
comment on column public.orders.total_gst is 'Total GST embedded in total (₹), CGST + SGST.';

-- Backfill delivery from stored totals (subtotal − discount + delivery = total)
update public.orders o
set delivery_charge = greatest(
  0,
  round(
    coalesce(o.total, 0)
    - greatest(0, coalesce(o.subtotal, o.total, 0) - coalesce(o.discount_amount, 0))
  )
)
where coalesce(o.delivery_charge, 0) = 0
  and coalesce(o.total, 0) > 0;

-- Backfill GST (5% inclusive: total × 5 / 105)
update public.orders o
set
  total_gst = round(coalesce(o.total, 0) * 5.0 / 105.0),
  cgst = round(round(coalesce(o.total, 0) * 5.0 / 105.0) * 2.5 / 5.0),
  sgst =
    round(coalesce(o.total, 0) * 5.0 / 105.0)
    - round(round(coalesce(o.total, 0) * 5.0 / 105.0) * 2.5 / 5.0)
where coalesce(o.total, 0) > 0
  and coalesce(o.total_gst, 0) = 0;

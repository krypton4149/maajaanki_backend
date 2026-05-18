-- Website checkout: discount breakdown + payment method on orders

alter table public.orders
  add column if not exists subtotal numeric,
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists coupon_code text,
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists order_source text not null default 'whatsapp';

comment on column public.orders.subtotal is 'Cart total before coupon (₹).';
comment on column public.orders.discount_amount is 'Coupon discount applied (₹).';
comment on column public.orders.coupon_code is 'Applied coupon code, e.g. MAAJAANKI20.';
comment on column public.orders.payment_method is 'cod or upi.';
comment on column public.orders.payment_status is 'pending, cod_pending, paid.';
comment on column public.orders.order_source is 'whatsapp or website.';

-- Optional: constrain payment_method when set
alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('cod', 'upi'));

alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (
    payment_status in ('pending', 'cod_pending', 'paid')
  );

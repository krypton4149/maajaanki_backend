-- Coupon codes for WhatsApp / checkout discounts
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check (
    discount_type in ('percentage', 'fixed', 'free_delivery')
  ),
  discount_value numeric not null default 0,
  min_order numeric not null default 0,
  active boolean not null default true,
  expiry_date timestamptz,
  usage_limit integer not null default 100,
  used_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists coupons_code_idx on public.coupons (upper(code));

comment on table public.coupons is 'Promo codes — validated by couponService on WhatsApp checkout.';

-- Maa Jaanki launch coupon: 20% off (case-insensitive at apply time)
insert into public.coupons (
  code,
  discount_type,
  discount_value,
  min_order,
  active,
  usage_limit
)
values (
  'MAAJAANKI20',
  'percentage',
  20,
  0,
  true,
  10000
)
on conflict (code) do update set
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  min_order = excluded.min_order,
  active = excluded.active,
  usage_limit = excluded.usage_limit;

-- Accept old typo code if migration was run earlier
insert into public.coupons (
  code,
  discount_type,
  discount_value,
  min_order,
  active,
  usage_limit
)
values (
  'MAJAAANKI20',
  'percentage',
  20,
  0,
  false,
  0
)
on conflict (code) do nothing;

-- Fix coupon code spelling: maajaanki20 → MAAJAANKI20 (was MAJAAANKI20)
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
  active = true;

update public.coupons
set active = false
where code = 'MAJAAANKI20';

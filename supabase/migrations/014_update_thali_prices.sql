-- Thali price update (May 2026): Jaanki Special Thali → ₹525; Deluxe Thali stays ₹360.

update public.menu_items
set price = 525
where lower(trim(name)) in (
  'jaanki special thali',
  'jaanki special thali (veg)'
);

update public.menu_items
set price = 360
where lower(trim(name)) in (
  'deluxe thali',
  'deluxe thali (veg)'
);

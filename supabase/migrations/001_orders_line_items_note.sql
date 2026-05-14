-- Run in Supabase SQL editor if your `orders` table has no place for free-text lines.
-- Safe to run multiple times.

alter table public.orders
  add column if not exists line_items_note text;

comment on column public.orders.line_items_note is 'WhatsApp order lines when items are not linked to menu_items rows.';

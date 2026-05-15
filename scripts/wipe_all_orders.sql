-- Wipe ALL orders and order line items.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Uses postgres role (bypasses RLS). Safe to re-run after empty tables.

delete from public.order_items;

delete from public.orders;

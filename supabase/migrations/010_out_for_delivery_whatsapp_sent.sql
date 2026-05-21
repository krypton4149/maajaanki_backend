-- Track whether "out for delivery" WhatsApp was sent (dashboard may set status in Supabase first).

alter table public.orders
  add column if not exists out_for_delivery_whatsapp_sent boolean not null default false;

comment on column public.orders.out_for_delivery_whatsapp_sent is
  'True after customer received out-for-delivery WhatsApp.';

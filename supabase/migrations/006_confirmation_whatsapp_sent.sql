alter table public.orders
  add column if not exists confirmation_whatsapp_sent boolean not null default false;

comment on column public.orders.confirmation_whatsapp_sent is 'True after Order Confirmed WhatsApp was sent to customer.';

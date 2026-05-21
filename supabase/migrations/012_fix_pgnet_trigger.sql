-- FIX: Run this AFTER 009/010 columns exist.
-- 1) Supabase → Database → Extensions → search "pg_net" → Enable
-- 2) Run this whole file in SQL Editor

create extension if not exists pg_net;

create or replace function public.notify_orders_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  payload jsonb;
  request_id bigint;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- When order status, legacy out_for_delivery flag, or payment verification changes
  if new.order_status is not distinct from old.order_status
     and new.out_for_delivery is not distinct from old.out_for_delivery
     and new.payment_verified is not distinct from old.payment_verified then
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'UPDATE',
    'table', 'orders',
    'record', to_jsonb(new),
    'old_record', to_jsonb(old)
  );

  select net.http_post(
    url := 'https://maajaanki-backend.vercel.app/api/webhooks/supabase/orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer maajaanki-admin-verify-2026'
    ),
    body := payload
  ) into request_id;

  return new;
exception
  when others then
    raise warning 'notify_orders_webhook: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_orders_notify_webhook on public.orders;

create trigger trg_orders_notify_webhook
after update on public.orders
for each row
execute function public.notify_orders_webhook();

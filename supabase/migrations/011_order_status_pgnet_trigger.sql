-- Auto-call backend when admin dashboard updates order_status in Supabase
-- (so WhatsApp sends even if the dashboard does not call the REST API).
--
-- Enable once in Supabase: Database → Extensions → pg_net → Enable
-- Replace the Bearer token below if ADMIN_VERIFY_KEY differs on Vercel.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_orders_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.order_status is not distinct from old.order_status
     and new.payment_verified is not distinct from old.payment_verified then
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'UPDATE',
    'table', 'orders',
    'record', to_jsonb(new),
    'old_record', to_jsonb(old)
  );

  perform net.http_post(
    url := 'https://maajaanki-backend.vercel.app/api/webhooks/supabase/orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer maajaanki-admin-verify-2026'
    ),
    body := payload
  );

  return new;
exception
  when others then
    raise warning 'notify_orders_webhook failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_orders_notify_webhook on public.orders;

create trigger trg_orders_notify_webhook
after update on public.orders
for each row
execute function public.notify_orders_webhook();

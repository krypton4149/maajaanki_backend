-- Paste in Supabase SQL Editor → Run → read results

-- 1) Required columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'order_status',
    'out_for_delivery_at',
    'out_for_delivery_whatsapp_sent'
  )
order by column_name;

-- 2) pg_net enabled?
select extname, extversion
from pg_extension
where extname = 'pg_net';

-- 3) Trigger installed?
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.orders'::regclass
  and tgname = 'trg_orders_notify_webhook';

-- 4) Function exists?
select proname
from pg_proc
where proname = 'notify_orders_webhook';

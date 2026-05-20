-- UPI payment proof: transaction ID / screenshot reference before order is confirmed

alter table public.orders
  add column if not exists upi_transaction_id text,
  add column if not exists payment_proof_media_id text,
  add column if not exists payment_verified boolean not null default false,
  add column if not exists payment_verified_at timestamptz;

create index if not exists orders_upi_transaction_id_idx
  on public.orders (upi_transaction_id)
  where upi_transaction_id is not null;

comment on column public.orders.upi_transaction_id is 'UPI UTR / transaction reference from customer.';
comment on column public.orders.payment_proof_media_id is 'WhatsApp media id when customer sends payment screenshot.';
comment on column public.orders.payment_verified is 'True after restaurant verifies UPI payment.';

-- Allow pending_verification status for UPI orders awaiting proof check
alter table public.orders drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (
    payment_status in (
      'pending',
      'cod_pending',
      'pending_verification',
      'paid',
      'rejected'
    )
  );

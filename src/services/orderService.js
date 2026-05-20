const { getSupabase, isSupabaseConfigured } = require("../lib/supabaseClient");

exports.isEnabled = isSupabaseConfigured;

function toNum(v) {
  if (v == null) return NaN;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Next order_num = max(existing) + 1 (uses array response — reliable with PostgREST).
 */
async function nextOrderNum(supabase) {
  const { data, error } = await supabase
    .from("orders")
    .select("order_num")
    .order("order_num", { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const last = row?.order_num;
  const n = toNum(last);
  return Number.isFinite(n) ? n + 1 : 1001;
}

function firstInsertedRow(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return typeof data === "object" ? data : null;
}

function isMissingOptionalColumn(error, columnName) {
  const msg = String(error?.message || "");
  const code = error?.code;
  const col = columnName ? String(columnName) : "";
  return (
    code === "PGRST204" ||
    code === "42703" ||
    (col && msg.includes(col)) ||
    /schema cache|column/i.test(msg)
  );
}

function isMissingLineItemsNoteColumn(error) {
  return isMissingOptionalColumn(error, "line_items_note");
}

function stripUnknownColumns(row, error) {
  const msg = String(error?.message || "");
  const next = { ...row };
  for (const key of Object.keys(next)) {
    if (key === "order_num" || key === "total" || key === "customer_name") continue;
    if (msg.includes(key)) delete next[key];
  }
  return next;
}

function wrapInsertError(error) {
  const errObj = {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  };
  const wrapped = new Error(`orders insert failed: ${JSON.stringify(errObj)}`);
  wrapped.cause = error;
  return wrapped;
}

/**
 * @param {Array<{ name: string, priceRupees?: number|null, qty: number, lineTotal?: number }>} lines
 */
async function insertOrderItemsForOrder(supabase, orderId, lines) {
  if (!Array.isArray(lines) || !lines.length) return;

  const rows = lines.map((l) => {
    const qty = Math.max(1, Math.round(Number(l.qty) || 1));
    let unit = 0;
    if (l.priceRupees != null && Number.isFinite(Number(l.priceRupees))) {
      unit = Math.round(Number(l.priceRupees));
    } else if (
      l.lineTotal != null &&
      Number.isFinite(Number(l.lineTotal)) &&
      qty > 0
    ) {
      unit = Math.round(Number(l.lineTotal) / qty);
    }

    const menuItemId = l.menu_item_id || l.menuItemId || null;

    return {
      order_id: orderId,
      menu_item_id: menuItemId,
      item_name: String(l.name || "Item").trim().slice(0, 500),
      unit_price: Math.max(0, unit),
      qty,
      veg: true,
    };
  });

  const { error } = await supabase.from("order_items").insert(rows);
  if (error) throw wrapInsertError(error);
}

/**
 * Inserts public.orders row. Does not use .single() (avoids PGRST116 when
 * RETURNING shape differs). Retries on order_num unique violation (23505).
 * Optionally inserts public.order_items for dashboard line display.
 */
exports.createOrder = async ({
  customer_name,
  phone,
  whatsapp,
  address,
  line_items_note,
  total: totalRupees,
  subtotal: subtotalRupees,
  discount_amount: discountRupees,
  coupon_code,
  payment_method,
  payment_status,
  order_source,
  upi_transaction_id,
  payment_proof_media_id,
  payment_verified,
  orderLines,
}) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const noteRaw =
    line_items_note != null ? String(line_items_note).trim() : "";
  const note = noteRaw.slice(0, 4000);

  const total = Math.max(0, Math.round(Number(totalRupees) || 0));
  const subtotal =
    subtotalRupees != null
      ? Math.max(0, Math.round(Number(subtotalRupees) || 0))
      : total;
  const discount_amount = Math.max(
    0,
    Math.round(Number(discountRupees) || 0)
  );

  const base = {
    customer_name: (customer_name || "Customer").trim().slice(0, 500),
    phone: String(phone || "").replace(/\D/g, "").slice(0, 20),
    whatsapp: String(whatsapp || "").trim().slice(0, 32),
    address: (address || "").trim().slice(0, 2000),
    total,
    subtotal,
    discount_amount,
  };

  if (coupon_code) base.coupon_code = String(coupon_code).trim().slice(0, 64);
  if (payment_method) base.payment_method = payment_method;
  if (payment_status) base.payment_status = payment_status;
  if (order_source) base.order_source = order_source;
  if (upi_transaction_id) {
    base.upi_transaction_id = String(upi_transaction_id).trim().slice(0, 64);
  }
  if (payment_proof_media_id) {
    base.payment_proof_media_id = String(payment_proof_media_id).trim().slice(0, 128);
  }
  if (payment_verified === true) base.payment_verified = true;
  if (note.length) base.line_items_note = note;

  const maxOuter = 8;
  let orderNum = await nextOrderNum(supabase);

  outer: for (let outer = 0; outer < maxOuter; outer++) {
    let row = { order_num: orderNum, ...base };

    for (let attempt = 0; attempt < 12; attempt++) {
      const { data, error } = await supabase
        .from("orders")
        .insert(row)
        .select("id, order_num");

      if (!error) {
        const inserted = firstInsertedRow(data);
        if (!inserted) {
          throw new Error(
            "Insert returned no row (RLS on RETURNING?). Use SUPABASE_SERVICE_ROLE_KEY in server .env."
          );
        }
        try {
          await insertOrderItemsForOrder(supabase, inserted.id, orderLines);
          return {
            ...inserted,
            subtotal,
            discount_amount,
            total,
            coupon_code: base.coupon_code || null,
            payment_method: base.payment_method || null,
            payment_status: base.payment_status || null,
            order_source: base.order_source || null,
          };
        } catch (itemErr) {
          await supabase.from("orders").delete().eq("id", inserted.id);
          throw itemErr;
        }
      }

      if (String(error.code) === "23505") {
        orderNum += 1;
        row = { ...row, order_num: orderNum };
        continue outer;
      }

      const stripped = stripUnknownColumns(row, error);
      if (Object.keys(stripped).length < Object.keys(row).length) {
        row = { order_num: orderNum, ...stripped };
        continue;
      }

      throw wrapInsertError(error);
    }
  }

  throw new Error("orders insert failed: exhausted retries");
};

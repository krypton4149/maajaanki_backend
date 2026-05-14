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

function isMissingLineItemsNoteColumn(error) {
  const msg = String(error?.message || "");
  const code = error?.code;
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /line_items_note|schema cache|column/i.test(msg)
  );
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

    return {
      order_id: orderId,
      menu_item_id: null,
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
  // Cart total in ₹ — required by DB NOT NULL on `orders.total`
  total: totalRupees,
  /** Cart lines for `order_items` (name, qty, priceRupees, lineTotal) */
  orderLines,
}) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const noteRaw =
    line_items_note != null ? String(line_items_note).trim() : "";
  const note = noteRaw.slice(0, 4000);

  const total = Math.max(
    0,
    Math.round(Number(totalRupees) || 0)
  );

  const base = {
    customer_name: (customer_name || "Customer").trim().slice(0, 500),
    phone: String(phone || "").replace(/\D/g, "").slice(0, 20),
    whatsapp: String(whatsapp || "").trim().slice(0, 32),
    address: (address || "").trim().slice(0, 2000),
    total,
  };

  const maxOuter = 8;
  let orderNum = await nextOrderNum(supabase);

  outer: for (let outer = 0; outer < maxOuter; outer++) {
    const tryNoteFirst = note.length > 0;

    const rowsToTry = tryNoteFirst
      ? [
          { order_num: orderNum, ...base, line_items_note: note },
          { order_num: orderNum, ...base },
        ]
      : [{ order_num: orderNum, ...base }];

    for (const row of rowsToTry) {
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
          return inserted;
        } catch (itemErr) {
          await supabase.from("orders").delete().eq("id", inserted.id);
          throw itemErr;
        }
      }

      if (String(error.code) === "23505") {
        orderNum += 1;
        continue outer;
      }

      if (row.line_items_note && isMissingLineItemsNoteColumn(error)) {
        continue;
      }

      throw wrapInsertError(error);
    }
  }

  throw new Error("orders insert failed: exhausted retries");
};

const { getSupabase, isSupabaseConfigured } = require("../lib/supabaseClient");

exports.isEnabled = isSupabaseConfigured;

async function nextOrderNum(supabase) {
  const { data, error } = await supabase
    .from("orders")
    .select("order_num")
    .order("order_num", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const last = data?.order_num;
  const n =
    last == null ? NaN : typeof last === "bigint" ? Number(last) : Number(last);
  return Number.isFinite(n) ? n + 1 : 1001;
}

/**
 * Inserts one row into public.orders (matches Table Editor: order_num, customer_name, phone, whatsapp, address).
 * Optionally sets line_items_note if the column exists (see supabase/migrations/001_orders_line_items_note.sql).
 */
exports.createOrder = async ({
  customer_name,
  phone,
  whatsapp,
  address,
  line_items_note,
}) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const order_num = await nextOrderNum(supabase);

  const base = {
    order_num,
    customer_name: customer_name || "Customer",
    phone: phone || "",
    whatsapp: whatsapp || "",
    address: address || "",
  };

  const withNote =
    line_items_note != null && String(line_items_note).trim() !== ""
      ? { ...base, line_items_note: String(line_items_note).trim() }
      : null;

  let { data, error } = await supabase
    .from("orders")
    .insert(withNote || base)
    .select("id, order_num")
    .single();

  if (error && withNote) {
    const r2 = await supabase
      .from("orders")
      .insert(base)
      .select("id, order_num")
      .single();
    data = r2.data;
    error = r2.error;
  }

  if (error) throw error;
  return data;
};

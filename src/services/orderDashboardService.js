const { getSupabase } = require("../lib/supabaseClient");

function mapOrderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderNum: row.order_num,
    orderId: row.order_num != null ? `MJ${row.order_num}` : null,
    customerName: row.customer_name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    address: row.address,
    subtotal: row.subtotal ?? row.total,
    discountAmount: row.discount_amount ?? 0,
    couponCode: row.coupon_code,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    upiTransactionId: row.upi_transaction_id,
    paymentVerified: row.payment_verified,
    orderSource: row.order_source,
    lineItemsNote: row.line_items_note,
    createdAt: row.created_at || null,
  };
}

async function fetchOrderItems(supabase, orderId) {
  const { data, error } = await supabase
    .from("order_items")
    .select("item_name, unit_price, qty, veg")
    .eq("order_id", orderId);

  if (error) return [];
  return (data || []).map((r) => ({
    name: r.item_name,
    unitPrice: r.unit_price,
    qty: r.qty,
    lineTotal: (Number(r.unit_price) || 0) * (Number(r.qty) || 1),
  }));
}

/** Orders waiting for dashboard UTR verification */
async function listPendingVerificationOrders() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("payment_status", "pending_verification")
    .order("order_num", { ascending: false });

  if (error) throw error;

  const result = [];
  for (const row of orders || []) {
    const items = await fetchOrderItems(supabase, row.id);
    result.push({ ...mapOrderRow(row), items });
  }
  return result;
}

async function getOrderByIdOrNum({ orderId, orderNum }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  let query = supabase.from("orders").select("*");
  if (orderId) query = query.eq("id", orderId);
  else if (orderNum != null) query = query.eq("order_num", Number(orderNum));
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const items = await fetchOrderItems(supabase, data.id);
  return { ...mapOrderRow(data), items };
}

module.exports = {
  listPendingVerificationOrders,
  getOrderByIdOrNum,
  mapOrderRow,
};

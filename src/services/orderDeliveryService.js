const { getSupabase } = require("../lib/supabaseClient");
const { sendTextMessage } = require("./whatsappService");
const orderFlowMessages = require("./orderFlowMessages");
const orderDashboard = require("./orderDashboardService");
const { formatPhoneForWhatsApp } = require("./orderConfirmationService");

function parseOrderNumInput(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const m = raw.match(/MJ-?(\d+)/i);
  if (m) return Number(m[1]);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mark order out for delivery in Supabase and notify customer on WhatsApp.
 */
async function markOutForDelivery({ orderId, orderNum, orderRef, force = false }) {
  const parsedNum =
    orderNum != null
      ? Number(orderNum)
      : parseOrderNumInput(orderRef) ?? parseOrderNumInput(orderId);

  const isUuid =
    orderId &&
    typeof orderId === "string" &&
    /^[0-9a-f-]{36}$/i.test(orderId.trim());

  const order = await orderDashboard.getOrderByIdOrNum({
    orderId: isUuid ? orderId : null,
    orderNum: Number.isFinite(parsedNum) ? parsedNum : null,
  });

  if (!order) {
    return { ok: false, reason: "order_not_found" };
  }

  if (order.orderStatus === "out_for_delivery" && !force) {
    return { ok: true, alreadySent: true, order, skipped: "already_out_for_delivery" };
  }

  const to = formatPhoneForWhatsApp(order.phone, order.whatsapp);
  if (!to || to.length < 10) {
    return { ok: false, reason: "invalid_phone", order };
  }

  const message = orderFlowMessages.buildOutForDelivery({
    orderId: order.orderId || orderFlowMessages.formatOrderId(order.orderNum),
  });

  try {
    await sendTextMessage(to, message);
  } catch (err) {
    console.error("markOutForDelivery WhatsApp failed", order.id, err?.message);
    return {
      ok: false,
      reason: "whatsapp_send_failed",
      detail: err?.message,
      order,
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, reason: "supabase_not_configured", order };
  }

  const patch = {
    order_status: "out_for_delivery",
    out_for_delivery_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("orders").update(patch).eq("id", order.id);

  if (error && /order_status|out_for_delivery_at/i.test(error.message || "")) {
    console.error("markOutForDelivery DB update", error.message);
    return {
      ok: true,
      whatsappSent: true,
      order,
      warning: "WhatsApp sent but order_status column missing — run migration 009.",
    };
  }

  if (error) throw error;

  const full = await orderDashboard.getOrderByIdOrNum({ orderId: order.id });
  return { ok: true, whatsappSent: true, order: full };
}

module.exports = {
  markOutForDelivery,
  parseOrderNumInput,
};

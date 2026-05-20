const { getSupabase } = require("../lib/supabaseClient");
const { sendTextMessage } = require("./whatsappService");
const orderFlowMessages = require("./orderFlowMessages");
const orderDashboard = require("./orderDashboardService");

function formatPhoneForWhatsApp(phone, whatsapp) {
  const digits = String(whatsapp || phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 12) return digits.slice(-12);
  return digits.length >= 10 ? digits : null;
}

/**
 * Send "Order Confirmed" WhatsApp if payment_verified and not sent yet.
 * Safe to call after Supabase manual verify or API verify.
 */
async function sendOrderConfirmedIfNeeded({ orderId, orderNum, force = false }) {
  const order = await orderDashboard.getOrderByIdOrNum({ orderId, orderNum });
  if (!order) {
    return { sent: false, reason: "order_not_found" };
  }

  if (!order.paymentVerified) {
    return { sent: false, reason: "payment_not_verified" };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { sent: false, reason: "supabase_not_configured" };
  }

  let alreadySent = false;
  const { data: row, error: readErr } = await supabase
    .from("orders")
    .select("confirmation_whatsapp_sent")
    .eq("id", order.id)
    .maybeSingle();

  if (!readErr && row?.confirmation_whatsapp_sent === true) {
    alreadySent = true;
  }

  if (!force && alreadySent) {
    return { sent: false, reason: "already_sent", order };
  }

  const to = formatPhoneForWhatsApp(order.phone, order.whatsapp);
  if (!to || to.length < 10) {
    return { sent: false, reason: "invalid_phone", order };
  }

  const paymentMethod =
    order.paymentMethod === "cod" ? "cod" : order.paymentMethod || "upi";

  const message = orderFlowMessages.buildOrderConfirmed({
    orderId: orderFlowMessages.formatOrderId(order.orderNum),
    cart: (order.items || []).map((i) => ({
      name: i.name,
      qty: i.qty,
      lineTotal: i.lineTotal,
      priceRupees: i.unitPrice,
    })),
    total: order.total,
    paymentMethod,
    coupon: order.couponCode
      ? { code: order.couponCode, discount: order.discountAmount }
      : null,
    discount: order.discountAmount || 0,
  });

  await sendTextMessage(to, message);

  const patch = {
    confirmation_whatsapp_sent: true,
    payment_status: "paid",
    payment_verified: true,
    payment_verified_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", order.id);

  if (updateErr && /confirmation_whatsapp_sent/i.test(updateErr.message || "")) {
    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_verified: true,
        payment_verified_at: patch.payment_verified_at,
      })
      .eq("id", order.id);
  } else if (updateErr) {
    throw updateErr;
  }

  return { sent: true, to, order };
}

module.exports = {
  sendOrderConfirmedIfNeeded,
  formatPhoneForWhatsApp,
};

const { getSupabase } = require("../lib/supabaseClient");
const { sendTextMessage } = require("./whatsappService");
const orderFlowMessages = require("./orderFlowMessages");
const orderDashboard = require("./orderDashboardService");
const { verifyOrderPayment } = require("./paymentVerificationService");

/**
 * Customer notifications: use delivery phone from checkout, not the WhatsApp
 * sender id (restaurant staff often order from the business number for testing).
 */
function formatPhoneForWhatsApp(phone, whatsapp) {
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  const last10 =
    phoneDigits.length >= 10 ? phoneDigits.slice(-10) : "";
  if (last10.length === 10) {
    return `91${last10}`;
  }

  const waDigits = String(whatsapp || "").replace(/\D/g, "");
  if (waDigits.length === 10) return `91${waDigits}`;
  if (waDigits.length >= 12) return waDigits.slice(-12);
  return waDigits.length >= 10 ? waDigits : null;
}

function resolveConfirmationRecipient(order) {
  if (order.orderSource === "whatsapp") {
    const chatWa = formatPhoneForWhatsApp(null, order.whatsapp);
    if (chatWa) return chatWa;
  }
  return formatPhoneForWhatsApp(order.phone, order.whatsapp);
}

function isPastConfirmationStage(order) {
  return (
    order.orderStatus === "out_for_delivery" ||
    order.outForDelivery === true ||
    order.outForDeliveryWhatsappSent === true
  );
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

  // Claim send slot before WhatsApp — avoids duplicate when admin API + pg_net webhook race.
  if (!force) {
    const { data: claimed, error: claimErr } = await supabase
      .from("orders")
      .update({ confirmation_whatsapp_sent: true })
      .eq("id", order.id)
      .eq("confirmation_whatsapp_sent", false)
      .select("id")
      .maybeSingle();

    if (claimErr) throw claimErr;
    if (!claimed) {
      return { sent: false, reason: "already_sent", order };
    }
  }

  const to = resolveConfirmationRecipient(order);
  if (!to || to.length < 10) {
    if (!force) {
      await supabase
        .from("orders")
        .update({ confirmation_whatsapp_sent: false })
        .eq("id", order.id);
    }
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

  try {
    await sendTextMessage(to, message);
  } catch (err) {
    if (!force) {
      await supabase
        .from("orders")
        .update({ confirmation_whatsapp_sent: false })
        .eq("id", order.id);
    }
    console.error("sendOrderConfirmed WhatsApp failed", order.id, err?.message);
    return { sent: false, reason: "whatsapp_send_failed", detail: err?.message, order };
  }

  const patch = {
    payment_status: "paid",
    payment_verified: true,
    payment_verified_at: new Date().toISOString(),
  };
  if (!isPastConfirmationStage(order)) {
    patch.order_status = "confirmed";
  }

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

/**
 * Send Order Confirmed before out-for-delivery when admin skips explicit verify.
 * Auto-verifies UPI/COD orders that have payment proof but confirmation was never sent.
 */
async function ensureOrderConfirmedBeforeDelivery({ orderId, orderNum, order: existingOrder }) {
  const order =
    existingOrder ||
    (await orderDashboard.getOrderByIdOrNum({ orderId, orderNum }));
  if (!order) {
    return { sent: false, reason: "order_not_found" };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { sent: false, reason: "supabase_not_configured" };
  }

  const { data: row, error: readErr } = await supabase
    .from("orders")
    .select("confirmation_whatsapp_sent, payment_verified")
    .eq("id", order.id)
    .maybeSingle();

  if (readErr) throw readErr;
  if (row?.confirmation_whatsapp_sent === true) {
    return { sent: false, reason: "already_sent", order };
  }

  if (!order.paymentVerified && !row?.payment_verified) {
    const isCod = order.paymentMethod === "cod";
    const hasUtr = !!order.upiTransactionId;
    if (isCod || hasUtr) {
      await verifyOrderPayment(order.id);
      order.paymentVerified = true;
    } else {
      return { sent: false, reason: "payment_not_verified", order };
    }
  }

  return sendOrderConfirmedIfNeeded({ orderId: order.id, force: false });
}

module.exports = {
  sendOrderConfirmedIfNeeded,
  ensureOrderConfirmedBeforeDelivery,
  formatPhoneForWhatsApp,
  resolveConfirmationRecipient,
};

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

async function readDeliverySentFlag(orderId) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("orders")
    .select("out_for_delivery_whatsapp_sent")
    .eq("id", orderId)
    .maybeSingle();

  if (error && /out_for_delivery_whatsapp_sent/i.test(error.message || "")) {
    return false;
  }
  if (error) throw error;
  return data?.out_for_delivery_whatsapp_sent === true;
}

/**
 * Send out-for-delivery WhatsApp and sync order status in Supabase.
 * Safe when dashboard already set order_status = out_for_delivery (uses sent flag).
 */
async function sendOutForDeliveryIfNeeded({ orderId, orderNum, orderRef, force = false }) {
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

  if (!force) {
    const alreadySent =
      order.outForDeliveryWhatsappSent === true ||
      (await readDeliverySentFlag(order.id));
    if (alreadySent) {
      return {
        ok: true,
        order,
        skipped: "already_sent",
        whatsappSent: false,
      };
    }
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
    console.error("sendOutForDelivery WhatsApp failed", order.id, err?.message);
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

  const now = new Date().toISOString();
  const patch = {
    order_status: "out_for_delivery",
    out_for_delivery_at: order.outForDeliveryAt || now,
    out_for_delivery_whatsapp_sent: true,
  };

  const { error } = await supabase.from("orders").update(patch).eq("id", order.id);

  if (error && /order_status|out_for_delivery/i.test(error.message || "")) {
    const { error: flagErr } = await supabase
      .from("orders")
      .update({ out_for_delivery_whatsapp_sent: true })
      .eq("id", order.id);

    if (flagErr && /out_for_delivery_whatsapp_sent/i.test(flagErr.message || "")) {
      console.error("sendOutForDelivery DB update", error.message);
      return {
        ok: true,
        whatsappSent: true,
        order,
        warning:
          "WhatsApp sent but DB columns missing — run migrations 009 and 010.",
      };
    }
  } else if (error) {
    throw error;
  }

  const full = await orderDashboard.getOrderByIdOrNum({ orderId: order.id });
  return { ok: true, whatsappSent: true, order: full };
}

/** @deprecated alias */
async function markOutForDelivery(opts) {
  return sendOutForDeliveryIfNeeded(opts);
}

module.exports = {
  sendOutForDeliveryIfNeeded,
  markOutForDelivery,
  parseOrderNumInput,
};

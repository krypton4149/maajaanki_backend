const { getSupabase } = require("../lib/supabaseClient");
const { sendTextMessage } = require("./whatsappService");
const orderFlowMessages = require("./orderFlowMessages");
const orderDashboard = require("./orderDashboardService");
const {
  resolveNotificationRecipients,
} = require("../utils/whatsAppRecipients");

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

async function clearDeliverySentFlag(orderId) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("orders")
    .update({ out_for_delivery_whatsapp_sent: false })
    .eq("id", orderId);
}

/** Keep dashboard columns in sync (legacy `out_for_delivery` + `status` + `order_status`). */
function buildOutForDeliveryPatch(order, now) {
  return {
    order_status: "out_for_delivery",
    out_for_delivery: true,
    status: "out_for_delivery",
    out_for_delivery_at: order.outForDeliveryAt || now,
    out_for_delivery_whatsapp_sent: true,
  };
}

async function syncOutForDeliveryColumns(orderId, order, { markSent = true } = {}) {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();
  const patch = buildOutForDeliveryPatch(order, now);
  if (!markSent) {
    delete patch.out_for_delivery_whatsapp_sent;
  }

  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);

  if (error && /order_status|out_for_delivery|status/i.test(error.message || "")) {
    const minimal = {
      out_for_delivery: true,
      out_for_delivery_at: patch.out_for_delivery_at,
    };
    if (markSent) minimal.out_for_delivery_whatsapp_sent = true;
    await supabase.from("orders").update(minimal).eq("id", orderId);
  } else if (error) {
    throw error;
  }
}

async function sendDeliveryWhatsApp(order, message) {
  const recipients = resolveNotificationRecipients(order);
  if (!recipients.length) {
    return { ok: false, reason: "invalid_phone", order };
  }

  const attempts = [];
  for (const { to, kind } of recipients) {
    try {
      await sendTextMessage(to, message);
      return { ok: true, sentTo: to, recipientKind: kind, attempts };
    } catch (err) {
      attempts.push({ to, kind, error: err?.message });
      console.warn("sendOutForDelivery try failed", order.id, to, err?.message);
    }
  }

  return {
    ok: false,
    reason: "whatsapp_send_failed",
    detail: attempts.map((a) => `${a.to}: ${a.error}`).join("; "),
    order,
    attempts,
  };
}

/**
 * Send out-for-delivery WhatsApp and sync order status in Supabase.
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

  if (force) {
    await clearDeliverySentFlag(order.id);
  } else {
    const alreadySent =
      order.outForDeliveryWhatsappSent === true ||
      (await readDeliverySentFlag(order.id));
    if (alreadySent) {
      await syncOutForDeliveryColumns(order.id, order);
      const full = await orderDashboard.getOrderByIdOrNum({ orderId: order.id });
      return {
        ok: true,
        order: full,
        skipped: "already_sent",
        whatsappSent: false,
      };
    }
  }

  const message = orderFlowMessages.buildOutForDelivery({
    orderId: orderFlowMessages.formatOrderId(order.orderNum),
  });

  const sendResult = await sendDeliveryWhatsApp(order, message);
  if (!sendResult.ok) {
    return sendResult;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, reason: "supabase_not_configured", order };
  }

  try {
    await syncOutForDeliveryColumns(order.id, order);
  } catch (err) {
    if (/out_for_delivery_whatsapp_sent|order_status|out_for_delivery/i.test(
      err?.message || ""
    )) {
      console.error("sendOutForDelivery DB update", err.message);
      return {
        ok: true,
        whatsappSent: true,
        sentTo: sendResult.sentTo,
        order,
        warning:
          "WhatsApp sent but DB columns missing — run migrations 009, 010, and 013.",
      };
    }
    throw err;
  }

  const full = await orderDashboard.getOrderByIdOrNum({ orderId: order.id });
  return {
    ok: true,
    whatsappSent: true,
    sentTo: sendResult.sentTo,
    recipientKind: sendResult.recipientKind,
    order: full,
  };
}

async function markOutForDelivery(opts) {
  return sendOutForDeliveryIfNeeded(opts);
}

module.exports = {
  sendOutForDeliveryIfNeeded,
  markOutForDelivery,
  parseOrderNumInput,
  sendDeliveryWhatsApp,
};

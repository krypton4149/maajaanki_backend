const {
  sendOrderConfirmedIfNeeded,
} = require("../services/orderConfirmationService");
const {
  sendOutForDeliveryIfNeeded,
} = require("../services/orderDeliveryService");

function checkWebhookSecret(req) {
  const expected =
    process.env.SUPABASE_WEBHOOK_SECRET || process.env.ADMIN_VERIFY_KEY;
  if (!expected) return true;

  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret =
    req.headers["x-webhook-secret"] ||
    req.headers["x-supabase-webhook-secret"];
  const provided = bearer || headerSecret || req.body?.secret;

  return provided === expected;
}

/**
 * POST /api/webhooks/supabase/orders
 *
 * Supabase Database Webhook on public.orders UPDATE.
 * - payment_verified → true: Order Confirmed WhatsApp
 * - order_status → out_for_delivery: out-for-delivery WhatsApp (dashboard tick)
 */
exports.onOrderUpdate = async (req, res) => {
  try {
    if (!checkWebhookSecret(req)) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }

    const type = req.body?.type;
    const table = req.body?.table;
    const record = req.body?.record || req.body?.new;
    const oldRecord = req.body?.old_record || req.body?.old;

    if (table && table !== "orders") {
      return res.json({ ok: true, skipped: "wrong_table" });
    }

    if (type && type !== "UPDATE" && type !== "INSERT") {
      return res.json({ ok: true, skipped: "wrong_event" });
    }

    if (!record?.id) {
      return res.status(400).json({ ok: false, message: "Missing order record." });
    }

    const response = { ok: true };

    const status = record.order_status;
    const oldStatus = oldRecord?.order_status;
    const outFlag = record.out_for_delivery === true;
    const wasOutFlag = oldRecord?.out_for_delivery === true;
    const becameOutForDelivery =
      (status === "out_for_delivery" && oldStatus !== "out_for_delivery") ||
      (outFlag && !wasOutFlag);
    const needsDeliveryMsg =
      (status === "out_for_delivery" || outFlag) &&
      record.out_for_delivery_whatsapp_sent !== true;

    if (becameOutForDelivery || needsDeliveryMsg) {
      const delivery = await sendOutForDeliveryIfNeeded({
        orderId: record.id,
        force: false,
      });
      response.outForDelivery = delivery;
      if (!delivery.ok && delivery.reason !== "already_sent") {
        console.warn(
          "supabase webhook: out-for-delivery not sent",
          record.id,
          delivery.reason,
          delivery.detail
        );
      }
    }

    const verified = record.payment_verified === true;
    const pastConfirmation =
      status === "out_for_delivery" ||
      outFlag ||
      record.out_for_delivery_whatsapp_sent === true ||
      response.outForDelivery?.whatsappSent === true;

    if (verified && !pastConfirmation) {
      const wasVerified = oldRecord?.payment_verified === true;
      const alreadySent = record.confirmation_whatsapp_sent === true;

      if (!(wasVerified && alreadySent)) {
        const whatsapp = await sendOrderConfirmedIfNeeded({
          orderId: record.id,
          force: false,
        });
        response.whatsappConfirmation = whatsapp;
        if (!whatsapp.sent) {
          console.warn(
            "supabase webhook: confirmation not sent",
            record.id,
            whatsapp.reason
          );
        }
      }
    }

    if (!response.outForDelivery && !response.whatsappConfirmation) {
      response.skipped = "no_action";
    }

    return res.json(response);
  } catch (err) {
    console.error("supabaseWebhook onOrderUpdate", err?.message);
    return res.status(500).json({ ok: false, message: "Webhook handler failed." });
  }
};

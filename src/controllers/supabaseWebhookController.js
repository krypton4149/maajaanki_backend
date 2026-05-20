const {
  sendOrderConfirmedIfNeeded,
} = require("../services/orderConfirmationService");

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
 * When payment_verified becomes true, sends Order Confirmed WhatsApp.
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

    const verified = record.payment_verified === true;
    if (!verified) {
      return res.json({ ok: true, skipped: "payment_not_verified" });
    }

    const wasVerified = oldRecord?.payment_verified === true;
    const alreadySent = record.confirmation_whatsapp_sent === true;

    if (wasVerified && alreadySent) {
      return res.json({ ok: true, skipped: "already_confirmed" });
    }

    const whatsapp = await sendOrderConfirmedIfNeeded({
      orderId: record.id,
      force: false,
    });

    if (!whatsapp.sent) {
      console.warn(
        "supabase webhook: confirmation not sent",
        record.id,
        whatsapp.reason
      );
    }

    return res.json({
      ok: true,
      whatsappConfirmation: whatsapp,
    });
  } catch (err) {
    console.error("supabaseWebhook onOrderUpdate", err?.message);
    return res.status(500).json({ ok: false, message: "Webhook handler failed." });
  }
};

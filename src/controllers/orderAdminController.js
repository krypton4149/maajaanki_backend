const { verifyOrderPayment } = require("../services/paymentVerificationService");
const { sendTextMessage } = require("../services/whatsappService");
const orderDashboard = require("../services/orderDashboardService");
const {
  sendOrderConfirmedIfNeeded,
} = require("../services/orderConfirmationService");
const { getSupabase } = require("../lib/supabaseClient");

function checkAdminKey(req) {
  const key =
    req.headers["x-admin-key"] ||
    req.body?.secret ||
    req.query?.secret;
  const expected = process.env.ADMIN_VERIFY_KEY;
  return expected && key === expected;
}

/**
 * GET /api/admin/orders/pending
 */
exports.listPending = async (req, res) => {
  try {
    if (!checkAdminKey(req)) {
      return res.status(403).json({ ok: false, message: "Unauthorized." });
    }

    const orders = await orderDashboard.listPendingVerificationOrders();
    return res.json({ ok: true, count: orders.length, orders });
  } catch (err) {
    console.error("listPending", err?.message);
    return res.status(500).json({ ok: false, message: "Could not load orders." });
  }
};

/**
 * POST /api/admin/orders/verify-payment
 * Sets payment_verified=true AND sends Order Confirmed WhatsApp.
 */
exports.verifyPayment = async (req, res) => {
  try {
    if (!checkAdminKey(req)) {
      return res.status(403).json({ ok: false, message: "Unauthorized." });
    }

    const orderId = req.body?.orderId;
    const orderNum = req.body?.orderNum;

    if (!orderId && orderNum == null) {
      return res.status(400).json({
        ok: false,
        message: "Send orderId or orderNum.",
      });
    }

    const existing = await orderDashboard.getOrderByIdOrNum({ orderId, orderNum });
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Order not found." });
    }

    if (!existing.upiTransactionId && !existing.paymentVerified) {
      return res.status(400).json({
        ok: false,
        message: "No UTR on this order. Cannot verify.",
      });
    }

    if (!existing.paymentVerified) {
      await verifyOrderPayment(existing.id);
    }

    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_verified: true,
          payment_verified_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }

    const whatsapp = await sendOrderConfirmedIfNeeded({
      orderId: existing.id,
      force: !!req.body?.resend,
    });

    const full = await orderDashboard.getOrderByIdOrNum({ orderId: existing.id });

    if (!whatsapp.sent && whatsapp.reason === "already_sent") {
      return res.json({
        ok: true,
        message: "Payment already verified. Confirmation was sent earlier.",
        order: full,
        whatsappConfirmation: whatsapp,
      });
    }

    if (!whatsapp.sent) {
      return res.json({
        ok: true,
        message: `Payment verified in DB but WhatsApp not sent: ${whatsapp.reason}`,
        order: full,
        whatsappConfirmation: whatsapp,
      });
    }

    return res.json({
      ok: true,
      message: "Payment verified. Order Confirmed sent on WhatsApp.",
      order: full,
      whatsappConfirmation: whatsapp,
    });
  } catch (err) {
    console.error("verifyPayment", err?.message);
    return res.status(500).json({ ok: false, message: "Verification failed." });
  }
};

/**
 * POST /api/admin/orders/send-confirmation
 * Use when you set payment_verified=true manually in Supabase.
 * Body: { orderNum: 1021 } or { orderId: "uuid" }
 */
exports.sendConfirmation = async (req, res) => {
  try {
    if (!checkAdminKey(req)) {
      return res.status(403).json({ ok: false, message: "Unauthorized." });
    }

    const orderId = req.body?.orderId;
    const orderNum = req.body?.orderNum;

    if (!orderId && orderNum == null) {
      return res.status(400).json({
        ok: false,
        message: "Send orderId or orderNum.",
      });
    }

    const whatsapp = await sendOrderConfirmedIfNeeded({
      orderId,
      orderNum,
      force: !!req.body?.resend,
    });

    if (!whatsapp.sent) {
      const msg =
        whatsapp.reason === "payment_not_verified"
          ? "Set payment_verified = true in database first."
          : whatsapp.reason === "already_sent"
            ? "Confirmation already sent. Use resend: true to send again."
            : `Could not send: ${whatsapp.reason}`;

      return res.status(400).json({ ok: false, message: msg, whatsappConfirmation: whatsapp });
    }

    return res.json({
      ok: true,
      message: "Order Confirmed sent on WhatsApp.",
      whatsappConfirmation: whatsapp,
    });
  } catch (err) {
    console.error("sendConfirmation", err?.message);
    return res.status(500).json({ ok: false, message: "Send failed." });
  }
};

/**
 * POST /api/admin/orders/reject-payment
 */
exports.rejectPayment = async (req, res) => {
  try {
    if (!checkAdminKey(req)) {
      return res.status(403).json({ ok: false, message: "Unauthorized." });
    }

    const orderId = req.body?.orderId;
    const orderNum = req.body?.orderNum;
    const reason =
      String(req.body?.reason || "Payment could not be verified.").trim();

    const existing = await orderDashboard.getOrderByIdOrNum({ orderId, orderNum });
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Order not found." });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "rejected",
        payment_verified: false,
        confirmation_whatsapp_sent: false,
      })
      .eq("id", existing.id);

    if (error) throw error;

    const phone = String(existing.whatsapp || existing.phone || "").replace(
      /\D/g,
      ""
    );
    if (phone.length >= 10) {
      const to = phone.length === 10 ? `91${phone}` : phone;
      try {
        await sendTextMessage(
          to,
          [
            "❌ Payment not verified",
            "",
            `Order ${existing.orderId || existing.orderNum} was not confirmed.`,
            reason,
            "",
            "If you paid, reply with correct UTR or contact the restaurant.",
          ].join("\n")
        );
      } catch (err) {
        console.error("reject notify", err?.message);
      }
    }

    return res.json({ ok: true, message: "Order rejected.", orderId: existing.id });
  } catch (err) {
    console.error("rejectPayment", err?.message);
    return res.status(500).json({ ok: false, message: "Reject failed." });
  }
};

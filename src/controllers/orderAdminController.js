const { verifyOrderPayment } = require("../services/paymentVerificationService");
const { sendTextMessage } = require("../services/whatsappService");
const orderFlowMessages = require("../services/orderFlowMessages");

function checkAdminKey(req) {
  const key =
    req.headers["x-admin-key"] ||
    req.body?.secret ||
    req.query?.secret;
  const expected = process.env.ADMIN_VERIFY_KEY;
  return expected && key === expected;
}

/**
 * POST /api/orders/verify-payment
 * Body: { orderId: "uuid" } or { orderNum: 1019 }
 * Header: x-admin-key: YOUR_ADMIN_VERIFY_KEY
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

    const { getSupabase } = require("../lib/supabaseClient");
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({ ok: false, message: "Database not configured." });
    }

    let targetId = orderId;
    if (!targetId && orderNum != null) {
      const { data } = await supabase
        .from("orders")
        .select("id")
        .eq("order_num", Number(orderNum))
        .maybeSingle();
      if (!data?.id) {
        return res.status(404).json({ ok: false, message: "Order not found." });
      }
      targetId = data.id;
    }

    const updated = await verifyOrderPayment(targetId);
    if (!updated) {
      return res.status(404).json({ ok: false, message: "Order not found." });
    }

    const orderIdLabel = orderFlowMessages.formatOrderId(updated.order_num);
    const phone = String(updated.whatsapp || updated.phone || "").replace(
      /\D/g,
      ""
    );
    if (phone.length >= 10) {
      const to = phone.length === 10 ? `91${phone}` : phone;
      try {
        await sendTextMessage(
          to,
          [
            "✅ Payment verified — Order Confirmed",
            "",
            `Order ID: ${orderIdLabel}`,
            `Total: ₹${updated.total}`,
            "",
            "Estimated delivery: 30–40 mins",
            "",
            "Thank you — Maa Jaanki Restaurant 🙏",
          ].join("\n")
        );
      } catch (err) {
        console.error("customer verify notify failed", err?.message);
      }
    }

    return res.json({
      ok: true,
      order: {
        id: updated.id,
        orderNum: updated.order_num,
        payment_status: "paid",
        payment_verified: true,
      },
    });
  } catch (err) {
    console.error("verifyPayment", err?.message);
    return res.status(500).json({ ok: false, message: "Verification failed." });
  }
};

const { verifyOrderPayment } = require("../services/paymentVerificationService");
const { sendTextMessage } = require("../services/whatsappService");
const orderFlowMessages = require("../services/orderFlowMessages");
const orderDashboard = require("../services/orderDashboardService");
const { getSupabase } = require("../lib/supabaseClient");

function checkAdminKey(req) {
  const key =
    req.headers["x-admin-key"] ||
    req.body?.secret ||
    req.query?.secret;
  const expected = process.env.ADMIN_VERIFY_KEY;
  return expected && key === expected;
}

async function notifyCustomerOrderConfirmed(order) {
  const orderIdLabel = orderFlowMessages.formatOrderId(order.order_num);
  const phone = String(order.whatsapp || order.phone || "").replace(/\D/g, "");
  if (phone.length < 10) return { sent: false };

  const to = phone.length === 10 ? `91${phone}` : phone;
  await sendTextMessage(
    to,
    orderFlowMessages.buildOrderConfirmed({
      orderId: orderIdLabel,
      cart: (order.items || []).map((i) => ({
        name: i.name,
        qty: i.qty,
        lineTotal: i.lineTotal,
        priceRupees: i.unitPrice,
      })),
      total: order.total,
      paymentMethod: "upi",
      coupon: order.coupon_code
        ? { code: order.coupon_code, discount: order.discount_amount }
        : null,
      discount: order.discount_amount || 0,
    })
  );
  return { sent: true };
}

/**
 * GET /api/admin/orders/pending
 * Header: x-admin-key
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
 * Body: { orderId } or { orderNum }
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

    if (existing.paymentStatus === "paid" && existing.paymentVerified) {
      return res.json({
        ok: true,
        message: "Already verified.",
        order: existing,
      });
    }

    if (!existing.upiTransactionId) {
      return res.status(400).json({
        ok: false,
        message: "No UTR on this order. Cannot verify.",
      });
    }

    const updated = await verifyOrderPayment(existing.id);
    if (!updated) {
      return res.status(404).json({ ok: false, message: "Order not found." });
    }

    const full = await orderDashboard.getOrderByIdOrNum({ orderId: updated.id });
    let whatsapp = { sent: false };
    try {
      whatsapp = await notifyCustomerOrderConfirmed({
        ...full,
        order_num: updated.order_num,
        total: updated.total,
      });
    } catch (err) {
      console.error("customer confirm notify", err?.message);
    }

    return res.json({
      ok: true,
      message: "Payment verified. Customer notified on WhatsApp.",
      order: full,
      whatsappConfirmation: whatsapp,
    });
  } catch (err) {
    console.error("verifyPayment", err?.message);
    return res.status(500).json({ ok: false, message: "Verification failed." });
  }
};

/**
 * POST /api/admin/orders/reject-payment
 * Body: { orderId } or { orderNum }, optional reason
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
      .update({ payment_status: "rejected", payment_verified: false })
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

const orderService = require("../services/orderService");
const couponService = require("../services/couponService");
const checkoutService = require("../services/checkoutService");
const orderNotification = require("../services/orderNotificationService");
const gstBreakdown = require("../utils/gstBreakdown");
const { isSupabaseConfigured } = require("../lib/supabaseClient");

exports.getPaymentMethods = (req, res) => {
  const config = checkoutService.getPaymentConfig();
  return res.json({ ok: true, ...config });
};

exports.placeOrder = async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        ok: false,
        message: "Ordering is not connected. Please try again later.",
      });
    }

    const body = req.body || {};
    const customer = body.customer || {};
    const name = String(customer.name || "").trim();
    const phone = String(customer.phone || "").replace(/\D/g, "");
    const address = String(customer.address || "").trim();
    const items = body.items;

    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, message: "Customer name is required." });
    }
    if (phone.length < 10) {
      return res.status(400).json({ ok: false, message: "Valid 10-digit phone is required." });
    }
    if (!address || address.length < 4) {
      return res.status(400).json({ ok: false, message: "Delivery address is required." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: "Cart items are required." });
    }

    const paymentMethod = checkoutService.normalizePaymentMethod(
      body.paymentMethod || body.payment_method
    );
    if (!paymentMethod) {
      return res.status(400).json({
        ok: false,
        message: "paymentMethod must be cod or upi.",
      });
    }

    const config = checkoutService.getPaymentConfig();
    if (paymentMethod === "upi" && !config.upiEnabled) {
      return res.status(400).json({
        ok: false,
        message: "UPI is not configured. Choose Cash on Delivery.",
      });
    }

    const calc = await checkoutService.calculateCheckout({
      items,
      couponCode: body.couponCode || body.coupon_code,
    });

    if (body.couponCode && calc.couponError) {
      return res.status(400).json({
        ok: false,
        message: calc.couponError,
      });
    }

    const cartLines = calc.lines.map((l) => ({
      name: l.name,
      priceRupees: l.priceRupees,
      qty: l.qty,
      lineTotal: l.lineTotal,
      menu_item_id: l.menu_item_id,
    }));

    const noteLines = cartLines.map((l) => {
      return `${l.qty} × ${l.name} @ ₹${l.priceRupees} = ₹${l.lineTotal}`;
    });

    const noteParts = [
      "Website order",
      "",
      ...noteLines,
      "",
      `Subtotal: ₹${calc.subtotal}`,
    ];
    if (calc.coupon?.code) {
      noteParts.push(
        `Coupon: ${calc.coupon.code} (${calc.coupon.label || ""})`,
        `Discount: -₹${calc.discount}`
      );
    }
    if (calc.deliveryCharge > 0) {
      noteParts.push(`Delivery charge: ₹${calc.deliveryCharge}`);
    }
    noteParts.push(`Total: ₹${calc.finalTotal}`);
    gstBreakdown.appendGstLines(noteParts, calc.finalTotal);
    noteParts.push(`Payment: ${paymentMethod.toUpperCase()}`);

    const phone10 = phone.slice(-10);
    const wa = orderNotification.formatPhoneForWhatsApp(phone10);

    const upiTxn = String(body.upiTransactionId || body.utr || "").trim();
    const isUpi = paymentMethod === "upi";
    const paymentStatus = isUpi
      ? "pending_verification"
      : checkoutService.paymentStatusFor(paymentMethod);

    if (isUpi && upiTxn) {
      noteParts.push(`UTR: ${upiTxn}`);
    }

    const inserted = await orderService.createOrder({
      customer_name: name,
      phone: phone10,
      whatsapp: wa || phone10,
      address,
      line_items_note: noteParts.join("\n"),
      subtotal: calc.subtotal,
      discount_amount: calc.discount,
      delivery_charge: calc.deliveryCharge,
      cgst: calc.cgst,
      sgst: calc.sgst,
      total_gst: calc.totalGst,
      coupon_code: calc.coupon?.code || null,
      total: calc.finalTotal,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      order_source: "website",
      upi_transaction_id: isUpi && upiTxn ? upiTxn : null,
      payment_verified: !isUpi,
      orderLines: cartLines,
    });

    if (calc.coupon?.code) {
      await couponService.incrementCouponUsage(calc.coupon.code);
    }

    let notify = { sent: false };
    if (!isUpi) {
      notify = await orderNotification.sendOrderConfirmation({
        phone: phone10,
        orderNum: inserted.order_num,
        subtotal: calc.subtotal,
        discountAmount: calc.discount,
        couponCode: calc.coupon?.code,
        total: calc.finalTotal,
        paymentMethod,
        paymentStatus: inserted.payment_status,
        customerName: name,
      });
    }

    const paymentConfig = checkoutService.getPaymentConfig();
    const upiMethod = paymentConfig.methods.find((m) => m.id === "upi");
    const { getQrPublicUrl } = require("../services/upiQrService");

    return res.status(201).json({
      ok: true,
      order: {
        id: inserted.id,
        orderNum: inserted.order_num,
        subtotal: calc.subtotal,
        discountAmount: calc.discount,
        deliveryCharge: calc.deliveryCharge,
        cgst: calc.cgst,
        sgst: calc.sgst,
        totalGst: calc.totalGst,
        couponCode: calc.coupon?.code || null,
        total: calc.finalTotal,
        paymentMethod,
        paymentStatus: inserted.payment_status || checkoutService.paymentStatusFor(paymentMethod),
        orderSource: "website",
      },
      payment:
        paymentMethod === "upi" && upiMethod
          ? {
              upiId: upiMethod.upiId,
              payeeName: upiMethod.payeeName,
              amount: calc.finalTotal,
              note: `Order #${inserted.order_num}`,
              qrImageUrl: getQrPublicUrl() || null,
            }
          : null,
      whatsappConfirmation: notify,
    });
  } catch (err) {
    console.error("POST /api/orders", err?.message, err?.cause?.message);
    return res.status(500).json({
      ok: false,
      message: "Could not place order. Please try again.",
    });
  }
};

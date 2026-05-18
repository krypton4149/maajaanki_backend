const { sendTextMessage } = require("./whatsappService");

function formatPhoneForWhatsApp(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 10) return digits.slice(-12);
  return digits || null;
}

function paymentLabel(method, status) {
  if (method === "cod") return "Cash on Delivery";
  if (method === "upi") {
    return status === "paid" ? "UPI (paid)" : "UPI (pay after placing)";
  }
  return method || "—";
}

/**
 * Sends WhatsApp order confirmation to customer (best-effort).
 */
async function sendOrderConfirmation({
  phone,
  orderNum,
  subtotal,
  discountAmount,
  couponCode,
  total,
  paymentMethod,
  paymentStatus,
  customerName,
}) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.PHONE_NUMBER_ID) {
    return { sent: false, reason: "whatsapp_not_configured" };
  }

  const to = formatPhoneForWhatsApp(phone);
  if (!to || to.length < 10) {
    return { sent: false, reason: "invalid_phone" };
  }

  const lines = [
    "✅ Order placed successfully!",
    "",
    `Order #${orderNum}`,
    customerName ? `Name: ${customerName}` : null,
    "",
    `Subtotal: ₹${subtotal}`,
  ];

  if (discountAmount > 0 && couponCode) {
    lines.push(`Coupon ${couponCode}: -₹${discountAmount}`);
  }
  lines.push(`Total: ₹${total}`);
  lines.push(
    "",
    `Payment: ${paymentLabel(paymentMethod, paymentStatus)}`
  );

  if (paymentMethod === "upi" && process.env.RESTAURANT_UPI_ID) {
    lines.push(
      "",
      `Pay via UPI: ${process.env.RESTAURANT_UPI_ID}`,
      "(Use your UPI app — mention order #" + orderNum + " in note if possible)"
    );
  }

  lines.push(
    "",
    "📞 We will call you shortly to confirm.",
    "Thank you — Maa Jaanki Restaurant 🙏"
  );

  try {
    await sendTextMessage(to, lines.filter(Boolean).join("\n"));
    return { sent: true, to };
  } catch (err) {
    console.error("WhatsApp order confirmation failed", err?.message);
    return { sent: false, reason: err?.message || "send_failed" };
  }
}

module.exports = {
  sendOrderConfirmation,
  formatPhoneForWhatsApp,
};

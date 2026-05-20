const checkoutService = require("./checkoutService");
const { buildPublicPayUrl } = require("./payLinkService");

const DIVIDER = "──────────────";

function formatOrderId(orderNum) {
  return `MJ${orderNum}`;
}

function buildUpiPayLink(upiId, payeeName, amount) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: String(Number(amount).toFixed(2)),
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

function cartLinesPlain(cart) {
  return cart.map((l) => {
    if (l.priceRupees == null) return `${l.name} x${l.qty} (price on call)`;
    return `${l.name} x${l.qty} = ₹${l.lineTotal}`;
  });
}

function buildCartSummary(cart, coupon) {
  const { subtotal, discount, finalTotal } = computeTotals(cart, coupon);
  const lines = ["🛒 Your Cart", "", ...cartLinesPlain(cart), "", `Subtotal = ₹${subtotal}`];

  if (coupon?.code && discount > 0) {
    lines.push(`Discount = -₹${discount}`, `Total = ₹${finalTotal}`);
  } else if (coupon?.code) {
    lines.push(`Total = ₹${finalTotal}`);
  }

  return { text: lines.join("\n"), subtotal, discount, finalTotal };
}

function computeTotals(cart, coupon) {
  const subtotal = cart.reduce((s, l) => s + (l.lineTotal || 0), 0);
  const discount = coupon?.discount
    ? Math.min(subtotal, Number(coupon.discount) || 0)
    : 0;
  const finalTotal = Math.max(0, Math.round(subtotal - discount));
  return {
    subtotal: Math.round(subtotal),
    discount: Math.round(discount),
    finalTotal,
  };
}

function buildCartMenu(cart, coupon) {
  const summary = buildCartSummary(cart, coupon);
  return [
    summary.text,
    "",
    DIVIDER,
    "1️⃣ Apply Coupon",
    "2️⃣ Proceed to Checkout",
    "",
    "Reply *1* or *2*",
    "MENU — browse more categories",
  ].join("\n");
}

function buildCouponPrompt() {
  return [
    "🏷️ Apply Coupon",
    "",
    "Send your coupon code, for example:",
    "maajaanki20",
    "",
    "Or type: COUPON maajaanki20",
    "",
    "Reply MENU to go back without applying.",
  ].join("\n");
}

function buildCouponApplied({ label, saved, finalTotal }) {
  return [
    "✅ Coupon Applied",
    "",
    label || "Discount active",
    "",
    `You Saved ₹${saved}`,
    `New Total = ₹${finalTotal}`,
    "",
    DIVIDER,
    "1️⃣ Continue Checkout",
    "",
    "Reply *1* to enter delivery details.",
  ].join("\n");
}

function buildDetailsPrompt() {
  return [
    "📍 Delivery Details",
    "",
    "Send in *one message* (each line separate):",
    "",
    "Line 1 — Full name",
    "Line 2 — Complete address",
    "Line 3 — Mobile (10 digits) or SAME",
    "",
    "Example:",
    "Asha Mehta",
    "42 MG Road, Delhi - 110001",
    "9876504321",
  ].join("\n");
}

function buildPaymentMenu() {
  const config = checkoutService.getPaymentConfig();
  const lines = [
    "💳 Choose Payment Method",
    "",
    "1️⃣ Cash on Delivery",
  ];

  if (config.upiEnabled) {
    lines.push("2️⃣ UPI & QR Code");
    lines.push("", "Reply *1* for COD  ·  *2* for UPI");
  } else {
    lines.push("", "Reply *1* for Cash on Delivery");
  }

  return lines.join("\n");
}

function buildCodSelected() {
  return "✅ Cash on Delivery Selected\n\nConfirming your order…";
}

function buildUpiAwaitProof(amount) {
  return [
    "🔢 Send Transaction ID (UTR)",
    "",
    `After paying ₹${amount}, reply with your`,
    "*12-digit UPI Transaction ID / UTR*",
    "",
    "Example: 428765432109",
    "",
    "⚠️ Screenshots are not accepted.",
    "⚠️ Typing DONE will NOT confirm your order.",
    "",
    "We confirm only after verifying UTR in our system.",
    "Reply MENU to cancel.",
  ].join("\n");
}

function buildUpiPayment({ upiId, payeeName, amount }) {
  const lines = [
    "✅ UPI & QR Payment",
    "",
    "Scan the QR code in the next message",
    "with PhonePe, Google Pay, or Paytm.",
    "",
    `Amount: ₹${amount}`,
  ];

  if (upiId) {
    lines.push(`UPI ID: ${upiId}`);
    if (payeeName) lines.push(`Name: ${payeeName}`);
    const payUrl = buildPublicPayUrl(amount);
    if (payUrl) {
      lines.push("", "Tap to pay (opens UPI app):", payUrl);
    } else {
      lines.push(
        "",
        "Copy the UPI ID above and pay in PhonePe / GPay / Paytm."
      );
    }
  }

  lines.push(
    "",
    DIVIDER,
    "Next: send your 12-digit UTR (see message after QR)."
  );

  return lines.join("\n");
}

function buildOrderPendingVerification({ orderId, cart, total, utr }) {
  const lines = [
    "⏳ Order received — awaiting verification",
    "",
    `Order ID: ${orderId}`,
    "",
    "Items:",
    ...cartLinesPlain(cart),
    "",
    `Total: ₹${total}`,
    `Payment: UPI`,
    "",
    `UTR submitted: ${utr || "—"}`,
    "",
    "Our team will verify your Transaction ID.",
    "You will receive *Order Confirmed* on WhatsApp",
    "only after verification (usually 5–15 mins).",
    "",
    "Thank you — Maa Jaanki Restaurant 🙏",
  ];

  return lines.join("\n");
}

function buildUtrOnlyRequired() {
  return [
    "We only accept *Transaction ID (UTR)*, not screenshots.",
    "",
    "Open your UPI app → Payment history →",
    "copy the 12-digit reference number and send it here.",
    "",
    "Example: 428765432109",
  ].join("\n");
}

function buildInvalidPaymentProof() {
  return [
    "Invalid Transaction ID.",
    "",
    "Send your *12-digit UPI UTR* only (numbers).",
    "Example: 428765432109",
    "",
    "Screenshots are not accepted.",
  ].join("\n");
}

function buildOrderConfirmed({
  orderId,
  cart,
  total,
  paymentMethod,
  coupon,
  discount,
}) {
  const payment =
    paymentMethod === "upi" ? "UPI" : "Cash on Delivery";

  const lines = [
    "✅ Order Confirmed",
    "",
    `Order ID: ${orderId}`,
    "",
    "Items:",
    ...cartLinesPlain(cart),
    "",
    `Total: ₹${total}`,
  ];

  if (coupon?.code && discount > 0) {
    lines.push(`Coupon: ${coupon.code} (saved ₹${discount})`);
  }

  lines.push(
    `Payment: ${payment}`,
    "",
    "Estimated delivery: 30–40 mins",
    "",
    "Thank you for choosing Maa Jaanki Restaurant 🙏",
    "We will call you shortly if needed."
  );

  return lines.join("\n");
}

function buildCatalogFooter() {
  return [
    DIVIDER,
    "Add items:",
    "• 2 x 3  → qty × item number",
    "• 2 x Veg Momos  → by name",
    "",
    "CART — view bag & checkout",
    "MENU — more categories",
  ].join("\n");
}

function buildAddedToCart(added, totalsWithCoupon) {
  const parts = [
    "✅ Added to cart",
    "",
    ...added.map((a) => `• ${a.qty} × ${a.name}`),
  ];
  if (totalsWithCoupon?.finalTotal != null && totalsWithCoupon.coupon) {
    parts.push("", `Cart total: ₹${totalsWithCoupon.finalTotal} (coupon applied)`);
  }
  parts.push("", "Type *CART* when ready to checkout.");
  return parts.join("\n");
}

function buildWelcomeHint() {
  return [
    "Namaste 🙏 Welcome to Maa Jaanki Restaurant.",
    "",
    "Type *MENU* to browse categories.",
    "Add items like: 2 x Veg Momos",
    "Type *CART* to view your bag & checkout.",
  ].join("\n");
}

module.exports = {
  formatOrderId,
  buildCartSummary,
  buildCartMenu,
  buildCouponPrompt,
  buildCouponApplied,
  buildDetailsPrompt,
  buildPaymentMenu,
  buildCodSelected,
  buildUpiPayment,
  buildUpiAwaitProof,
  buildOrderPendingVerification,
  buildUtrOnlyRequired,
  buildInvalidPaymentProof,
  buildOrderConfirmed,
  buildCatalogFooter,
  buildAddedToCart,
  buildWelcomeHint,
  computeTotals,
};

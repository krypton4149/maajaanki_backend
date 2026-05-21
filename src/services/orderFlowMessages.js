const checkoutService = require("./checkoutService");

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

/** QR image caption — pay info only (instruction sent as separate text). */
function buildUpiQrCaption({ amount, upiId }) {
  const lines = [`*Pay ₹${amount}*`, "Scan QR · PhonePe / GPay / Paytm"];
  if (upiId) lines.push("", upiId);
  return lines.join("\n");
}

/** Standalone prompt — own message bubble reads larger than QR caption. */
function buildTxnLast4Prompt() {
  return [
    "🔢 *AFTER PAYMENT*",
    "",
    "*SEND LAST 4 DIGITS*",
    "*OF TXN ID*",
    "",
    "Example: *3457*",
  ].join("\n");
}

/** Fallback if QR image cannot be sent */
function buildUpiPaymentShort({ upiId, amount }) {
  const lines = [`*Pay ₹${amount}*`];
  if (upiId) lines.push(upiId, "");
  lines.push(
    buildTxnLast4Prompt().split("\n").slice(1).join("\n")
  );
  return lines.join("\n");
}

function buildOrderPendingVerification({ orderId, cart, total, utr }) {
  return [
    "⏳ Order received — awaiting verification",
    "",
    `Order ID: ${orderId}`,
    "",
    "Items:",
    ...cartLinesPlain(cart),
    "",
    `Total: ₹${total}`,
    "Payment: UPI",
    "",
    `Txn ID submitted: ${utr || "—"}`,
    "",
    "Our team will verify your payment.",
    "You will receive *Order Confirmed* on WhatsApp",
    "after verification (about 5 minutes).",
    "",
    "Thank you — Maa Jaanki Restaurant 🙏",
  ].join("\n");
}

function buildTxnLast4Required() {
  return buildTxnLast4Prompt();
}

function buildInvalidPaymentProof() {
  return "Send *4 digits only* (last 4 of txn id).\nExample: 3457";
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
    "Type *item number* (e.g. *3*)",
    "Multiple: *2 3 5* — set quantity *for each* item",
    "Single item: type qty, tap *Add to cart*",
    "",
    "*CART* — checkout  ·  *MENU* — more categories",
  ].join("\n");
}

function buildQuantityPickerText({ items, qty, step }) {
  const list = Array.isArray(items) && items.length ? items : [];
  const it = list[0];
  if (!it) return "Type quantity (e.g. 2). *CANCEL* to go back.";

  const price =
    it.priceRupees == null || Number.isNaN(Number(it.priceRupees))
      ? "Price on call"
      : `₹${Number(it.priceRupees)}`;

  const lines = [];
  if (step?.total > 1) {
    lines.push(`*Item ${step.current} of ${step.total}*`, "");
  }
  lines.push(
    `*${it.name}* · ${price}`,
    "",
    "*Type quantity* for this item (e.g. 2)",
    ""
  );
  if (step?.total > 1) {
    lines.push("Send the number — next item will appear.");
  } else {
    lines.push(`Quantity: *${qty}*`, "Then reply *ADD* or tap *Add to cart*.");
  }
  lines.push("", "*CANCEL* to go back");
  return lines.join("\n");
}

function buildOrderFeedbackRequest() {
  return [
    "💬 *We would love your feedback*",
    "",
    "How was your *WhatsApp ordering experience*?",
    "How was the *food*?",
    "",
    "Reply here — we read every message. Thank you 🙏",
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
  parts.push(
    "",
    "Type *MENU* to add more items.",
    "Type *CART* when ready to checkout."
  );
  return parts.join("\n");
}

function buildWelcomeHint() {
  return [
    "Namaste 🙏 Welcome to Maa Jaanki Restaurant.",
    "",
    "Type *MENU* to browse categories.",
    "Type an *item number* to add (e.g. *3*).",
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
  buildUpiQrCaption,
  buildTxnLast4Prompt,
  buildUpiPaymentShort,
  buildOrderPendingVerification,
  buildTxnLast4Required,
  buildInvalidPaymentProof,
  buildOrderConfirmed,
  buildCatalogFooter,
  buildQuantityPickerText,
  buildOrderFeedbackRequest,
  buildAddedToCart,
  buildWelcomeHint,
  computeTotals,
};

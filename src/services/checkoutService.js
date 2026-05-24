const couponService = require("./couponService");
const { isQrAvailable } = require("./upiQrService");
const deliveryCharge = require("../utils/deliveryCharge");
const gstBreakdown = require("../utils/gstBreakdown");

const PAYMENT_METHODS = {
  cod: {
    id: "cod",
    label: "Cash on Delivery",
    description: "Pay when your order is delivered",
  },
  upi: {
    id: "upi",
    label: "UPI",
    description: "Pay via Google Pay, PhonePe, Paytm",
  },
};

function roundRupees(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function normalizePaymentMethod(method) {
  const m = String(method || "")
    .trim()
    .toLowerCase();
  if (m === "cod" || m === "cash" || m === "cash_on_delivery") return "cod";
  if (m === "upi") return "upi";
  return null;
}

function paymentStatusFor(method) {
  if (method === "cod") return "cod_pending";
  if (method === "upi") return "pending";
  return "pending";
}

/**
 * @param {Array<{ price?: number, priceRupees?: number, qty: number }>} items
 */
function computeSubtotal(items) {
  if (!Array.isArray(items)) return 0;
  return roundRupees(
    items.reduce((sum, line) => {
      const unit = Number(line.priceRupees ?? line.price) || 0;
      const qty = Math.max(1, Math.round(Number(line.qty) || 1));
      return sum + unit * qty;
    }, 0)
  );
}

function normalizeCartLines(items) {
  return items.map((line) => {
    const qty = Math.max(1, Math.round(Number(line.qty) || 1));
    const unit = roundRupees(Number(line.priceRupees ?? line.price) || 0);
    const name = String(line.name || line.item_name || "Item").trim();
    return {
      menu_item_id: line.menuItemId || line.menu_item_id || null,
      name,
      priceRupees: unit,
      qty,
      lineTotal: unit * qty,
    };
  });
}

async function calculateCheckout({ items, couponCode }) {
  const lines = normalizeCartLines(items);
  const subtotal = computeSubtotal(lines);

  let discount = 0;
  let coupon = null;
  let couponError = null;

  if (couponCode && String(couponCode).trim()) {
    const result = await couponService.applyCoupon(couponCode, subtotal);
    if (result.valid) {
      discount = result.discount;
      coupon = {
        code: result.code,
        label: result.label,
        discountType: result.discountType,
      };
    } else {
      couponError = result.message;
    }
  }

  const totals = deliveryCharge.applyDeliveryToTotals({
    subtotal,
    discount,
    coupon,
  });
  const gst = gstBreakdown.computeGstBreakdown(totals.finalTotal);

  return {
    lines,
    subtotal: totals.subtotal,
    discount: totals.discount,
    deliveryCharge: totals.deliveryCharge,
    finalTotal: totals.finalTotal,
    cgst: gst.cgst,
    sgst: gst.sgst,
    totalGst: gst.totalGst,
    coupon,
    couponError,
  };
}

function getPaymentConfig() {
  const upiId = String(process.env.RESTAURANT_UPI_ID || "").trim();
  const payeeName = String(
    process.env.RESTAURANT_UPI_PAYEE_NAME || "Maa Jaanki Restaurant"
  ).trim();
  const qrAvailable = isQrAvailable();

  const methods = [{ ...PAYMENT_METHODS.cod }];

  if (upiId || qrAvailable) {
    methods.push({
      ...PAYMENT_METHODS.upi,
      label: "UPI & QR Code",
      upiId: upiId || null,
      payeeName,
      qrAvailable,
    });
  }

  return { methods, upiEnabled: !!(upiId || qrAvailable) };
}

module.exports = {
  PAYMENT_METHODS,
  computeSubtotal,
  normalizeCartLines,
  calculateCheckout,
  normalizePaymentMethod,
  paymentStatusFor,
  getPaymentConfig,
  roundRupees,
};

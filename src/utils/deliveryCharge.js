/** Orders below this amount (after coupon) incur delivery charge. */
const FREE_MIN_ORDER = Number(process.env.DELIVERY_FREE_MIN_ORDER || 500);
const DELIVERY_CHARGE = Number(process.env.DELIVERY_CHARGE_AMOUNT || 50);

function roundRupees(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function isFreeDeliveryCoupon(coupon) {
  const type = coupon?.discountType || coupon?.discount_type;
  return type === "free_delivery";
}

/**
 * ₹50 delivery when food total (after discount) is under ₹500; free at ₹500+.
 * free_delivery coupon waives the charge.
 */
function computeDeliveryCharge(foodTotalAfterDiscount, coupon) {
  if (isFreeDeliveryCoupon(coupon)) return 0;
  const food = roundRupees(foodTotalAfterDiscount);
  return food < FREE_MIN_ORDER ? DELIVERY_CHARGE : 0;
}

function applyDeliveryToTotals({ subtotal, discount = 0, coupon }) {
  const sub = roundRupees(subtotal);
  const disc = roundRupees(discount);
  const foodTotal = roundRupees(Math.max(0, sub - disc));
  const deliveryCharge = computeDeliveryCharge(foodTotal, coupon);
  const finalTotal = roundRupees(foodTotal + deliveryCharge);

  return {
    subtotal: sub,
    discount: disc,
    foodTotal,
    deliveryCharge,
    finalTotal,
  };
}

/** Short line for welcome / cart footers. */
function deliveryPolicyLine() {
  return `🚚 Delivery: ₹${DELIVERY_CHARGE} on orders under ₹${FREE_MIN_ORDER} · FREE on ₹${FREE_MIN_ORDER}+`;
}

module.exports = {
  FREE_MIN_ORDER,
  DELIVERY_CHARGE,
  computeDeliveryCharge,
  applyDeliveryToTotals,
  deliveryPolicyLine,
  isFreeDeliveryCoupon,
};

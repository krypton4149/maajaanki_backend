const { getSupabase } = require("../lib/supabaseClient");

/** Works even before Supabase migration is run */
const BUILTIN_COUPONS = {
  MAAJAANKI20: {
    code: "MAAJAANKI20",
    discount_type: "percentage",
    discount_value: 20,
    min_order: 0,
    active: true,
    usage_limit: 10000,
    used_count: 0,
  },
};

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

function roundRupees(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function computeDiscount(coupon, subtotal) {
  const total = Math.max(0, Number(subtotal) || 0);
  const type = coupon.discount_type;
  const value = Number(coupon.discount_value) || 0;

  if (type === "percentage") {
    return roundRupees((total * value) / 100);
  }
  if (type === "fixed") {
    return roundRupees(Math.min(total, value));
  }
  if (type === "free_delivery") {
    return 0;
  }
  return 0;
}

function discountLabel(coupon) {
  const type = coupon.discount_type;
  const value = Number(coupon.discount_value) || 0;
  if (type === "percentage") return `${value}% OFF`;
  if (type === "fixed") return `₹${value} OFF`;
  if (type === "free_delivery") return "Free Delivery";
  return "Discount";
}

function validateCouponRow(coupon, subtotal) {
  if (!coupon) {
    return { valid: false, message: "Invalid coupon code." };
  }
  if (!coupon.active) {
    return { valid: false, message: "This coupon is no longer active." };
  }
  if (coupon.expiry_date) {
    const expiry = new Date(coupon.expiry_date);
    if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) {
      return { valid: false, message: "This coupon has expired." };
    }
  }
  const limit = Number(coupon.usage_limit);
  const used = Number(coupon.used_count) || 0;
  if (Number.isFinite(limit) && limit > 0 && used >= limit) {
    return { valid: false, message: "This coupon has reached its usage limit." };
  }
  const minOrder = Number(coupon.min_order) || 0;
  const total = Math.max(0, Number(subtotal) || 0);
  if (total < minOrder) {
    return {
      valid: false,
      message: `Minimum order ₹${roundRupees(minOrder)} required for this coupon.`,
    };
  }
  return { valid: true };
}

/**
 * @param {string} code
 * @param {number} subtotal — cart subtotal in ₹
 */
async function applyCoupon(code, subtotal) {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { valid: false, message: "Please enter a coupon code." };
  }

  const supabase = getSupabase();
  let coupon = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", normalized)
      .maybeSingle();

    if (error) {
      console.error("coupon lookup failed", error.message, error.code);
    } else if (data) {
      coupon = data;
    }
  }

  if (!coupon && BUILTIN_COUPONS[normalized]) {
    coupon = { ...BUILTIN_COUPONS[normalized] };
  }

  const check = validateCouponRow(coupon, subtotal);
  if (!check.valid) return check;

  const discount = computeDiscount(coupon, subtotal);
  const finalTotal = roundRupees(Math.max(0, subtotal - discount));

  return {
    valid: true,
    code: normalized,
    label: discountLabel(coupon),
    discount,
    subtotal: roundRupees(subtotal),
    finalTotal,
    discountType: coupon.discount_type,
    couponId: coupon.id,
  };
}

async function incrementCouponUsage(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: coupon } = await supabase
    .from("coupons")
    .select("id, used_count")
    .eq("code", normalized)
    .maybeSingle();

  if (!coupon?.id) return;

  const next = (Number(coupon.used_count) || 0) + 1;
  const { error } = await supabase
    .from("coupons")
    .update({ used_count: next })
    .eq("id", coupon.id);

  if (error) {
    console.error("coupon usage increment failed", error.message);
  }
}

module.exports = {
  applyCoupon,
  incrementCouponUsage,
  normalizeCode,
  computeDiscount,
  discountLabel,
};

const couponService = require("../services/couponService");
const { computeSubtotal } = require("../services/checkoutService");

exports.validateCoupon = async (req, res) => {
  try {
    const { code, subtotal, items } = req.body || {};
    let cartSubtotal = Number(subtotal);
    if (!Number.isFinite(cartSubtotal) && Array.isArray(items)) {
      cartSubtotal = computeSubtotal(items);
    }
    if (!Number.isFinite(cartSubtotal) || cartSubtotal < 0) {
      return res.status(400).json({
        ok: false,
        valid: false,
        message: "Send subtotal or items array to validate a coupon.",
      });
    }
    if (!code || !String(code).trim()) {
      return res.status(400).json({
        ok: false,
        valid: false,
        message: "Coupon code is required.",
      });
    }

    const result = await couponService.applyCoupon(code, cartSubtotal);
    if (!result.valid) {
      return res.json({
        ok: true,
        valid: false,
        message: result.message,
      });
    }

    return res.json({
      ok: true,
      valid: true,
      code: result.code,
      label: result.label,
      subtotal: result.subtotal,
      discount: result.discount,
      finalTotal: result.finalTotal,
    });
  } catch (err) {
    console.error("POST /api/coupons/validate", err?.message);
    return res.status(500).json({
      ok: false,
      valid: false,
      message: "Could not validate coupon.",
    });
  }
};

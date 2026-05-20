const express = require("express");
const menuController = require("../controllers/menuController");
const couponController = require("../controllers/couponController");
const checkoutController = require("../controllers/checkoutController");
const orderAdminController = require("../controllers/orderAdminController");
const supabaseWebhookController = require("../controllers/supabaseWebhookController");

const router = express.Router();

router.get("/menu", menuController.getMenu);
router.get("/payment-methods", checkoutController.getPaymentMethods);
router.post("/coupons/validate", couponController.validateCoupon);
router.post("/orders", checkoutController.placeOrder);

router.get("/admin/orders/pending", orderAdminController.listPending);
router.post("/admin/orders/verify-payment", orderAdminController.verifyPayment);
router.post("/admin/orders/send-confirmation", orderAdminController.sendConfirmation);
router.post("/admin/orders/reject-payment", orderAdminController.rejectPayment);
router.post("/orders/verify-payment", orderAdminController.verifyPayment);

router.post(
  "/webhooks/supabase/orders",
  supabaseWebhookController.onOrderUpdate
);

module.exports = router;

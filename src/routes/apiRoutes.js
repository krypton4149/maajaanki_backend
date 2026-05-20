const express = require("express");
const menuController = require("../controllers/menuController");
const couponController = require("../controllers/couponController");
const checkoutController = require("../controllers/checkoutController");
const orderAdminController = require("../controllers/orderAdminController");

const router = express.Router();

router.get("/menu", menuController.getMenu);
router.get("/payment-methods", checkoutController.getPaymentMethods);
router.post("/coupons/validate", couponController.validateCoupon);
router.post("/orders", checkoutController.placeOrder);
router.post("/orders/verify-payment", orderAdminController.verifyPayment);

module.exports = router;

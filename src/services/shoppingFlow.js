const couponService = require("./couponService");
const checkoutService = require("./checkoutService");
const flowMsg = require("./orderFlowMessages");
const { buildPublicPayUrl } = require("./payLinkService");
const paymentVerification = require("./paymentVerificationService");

const sessions = new Map();

function computeCartTotals(cart, appliedCoupon) {
  return flowMsg.computeTotals(cart, appliedCoupon);
}

function isChoice1(text) {
  const t = String(text || "").trim();
  return t === "1" || /^1️⃣/.test(t) || /apply\s*coupon/i.test(t);
}

function isChoice2(text) {
  const t = String(text || "").trim();
  return (
    t === "2" ||
    /^2️⃣/.test(t) ||
    /^(checkout|proceed|continue\s*checkout|order)$/i.test(t)
  );
}

function isPaymentCod(text) {
  const t = String(text || "").trim().toLowerCase();
  return t === "1" || t === "cod" || /cash/i.test(t);
}

function isPaymentUpi(text) {
  const t = String(text || "").trim().toLowerCase();
  return t === "2" || t === "upi";
}

function isDoneOnly(text) {
  return /^(done|paid)$/i.test(String(text || "").trim());
}

async function notifyRestaurantNewUpiOrder(sendTextMessage, orderRow, proof) {
  const admin = String(process.env.RESTAURANT_ADMIN_WHATSAPP || "").replace(
    /\D/g,
    ""
  );
  if (!admin || admin.length < 10 || !sendTextMessage) return;

  const to = admin.length === 10 ? `91${admin}` : admin;
  const lines = [
    "🔔 New UPI order — verify payment",
    "",
    `Order #${orderRow.order_num}`,
    `Customer: ${proof.customerName || "—"}`,
    `Total: ₹${proof.total}`,
    proof.utr ? `UTR: ${proof.utr}` : null,
    proof.hasScreenshot ? "Screenshot: received on WhatsApp" : null,
    "",
    "Check Supabase orders → mark payment_verified when paid.",
  ].filter(Boolean);

  try {
    await sendTextMessage(to, lines.join("\n"));
  } catch (err) {
    console.error("admin notify failed", err?.message);
  }
}

exports.clearSession = (from) => {
  sessions.delete(from);
};

exports.onMenuOpened = (from) => {
  const s = sessions.get(from);
  if (!s) return;

  const phase = s.phase || "shop";
  if (phase === "shop" && (!s.cart || s.cart.length === 0)) {
    sessions.delete(from);
    return;
  }

  if (phase !== "shop") {
    sessions.set(from, {
      phase: "shop",
      categoryLabel: s.categoryLabel || "",
      catalog: Array.isArray(s.catalog) ? s.catalog : [],
      cart: Array.isArray(s.cart) ? s.cart.map((c) => ({ ...c })) : [],
      coupon: s.coupon || null,
    });
  }
};

exports.hasSession = (from) => sessions.has(from);

exports.startShopping = (from, { categoryLabel, catalog }) => {
  const existing = sessions.get(from);
  const keepCart =
    existing && Array.isArray(existing.cart) && existing.cart.length > 0
      ? existing.cart.map((c) => ({ ...c }))
      : [];

  const numbered = catalog.map((row, i) => ({
    num: i + 1,
    name: row.name,
    priceRupees: row.priceRupees,
  }));

  sessions.set(from, {
    phase: "shop",
    categoryLabel,
    catalog: numbered,
    cart: keepCart,
    coupon: existing?.coupon || null,
  });
};

function findByNameQuery(catalog, query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const scored = catalog
    .map((row) => {
      const n = row.name.toLowerCase();
      let score = 0;
      if (n === q) score = 1000;
      else if (n.includes(q)) score = 500 + q.length;
      else if (q.length >= 4 && n.includes(q.slice(0, 6))) score = 200;
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.row || null;
}

function splitOrderLines(text) {
  const trimmed = text.trim();
  const byNewline = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  const pieces = trimmed
    .split(/(?=\d+\s*[x×])/i)
    .map((l) => l.trim())
    .filter(Boolean);
  if (pieces.length > 1) return pieces;
  return byNewline;
}

function parseAddsFromText(text, catalog) {
  const added = [];
  const errors = [];
  const lines = splitOrderLines(text);

  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const rest = m[2].trim();
    if (!qty || qty > 99) {
      errors.push(`Invalid quantity in: ${line}`);
      continue;
    }
    let row = null;
    if (/^\d+$/.test(rest)) {
      const idx = parseInt(rest, 10);
      row = catalog.find((c) => c.num === idx) || null;
      if (!row) errors.push(`No item #${idx} in this list.`);
    } else {
      row = findByNameQuery(catalog, rest);
      if (!row) errors.push(`Could not match: ${rest}`);
    }
    if (row) {
      const price = row.priceRupees;
      const lineTotal =
        price == null || Number.isNaN(Number(price))
          ? 0
          : Number(price) * qty;
      added.push({
        name: row.name,
        priceRupees: price,
        qty,
        lineTotal,
      });
    }
  }
  return { added, errors };
}

function parseCouponCommand(text) {
  const trimmed = text.trim();
  const m = trimmed.match(/^coupon\s+(\S+)$/i);
  if (m) return { action: "apply", code: m[1] };
  if (/^coupon\s*$/i.test(trimmed) || /^apply\s+coupon$/i.test(trimmed)) {
    return { action: "prompt" };
  }
  if (/^(remove\s+coupon|coupon\s+remove|clear\s+coupon)$/i.test(trimmed)) {
    return { action: "remove" };
  }
  return null;
}

async function refreshCouponOnCart(s) {
  if (!s.coupon?.code) return;
  const refreshed = await couponService.applyCoupon(
    s.coupon.code,
    computeCartTotals(s.cart, null).subtotal
  );
  if (refreshed.valid) {
    s.coupon = {
      code: refreshed.code,
      label: refreshed.label,
      discount: refreshed.discount,
      discountType: refreshed.discountType,
      couponId: refreshed.couponId,
    };
  } else {
    s.coupon = null;
  }
}

async function applyCouponToSession(s, code) {
  const { subtotal } = computeCartTotals(s.cart, null);
  const result = await couponService.applyCoupon(code, subtotal);
  if (!result.valid) {
    return { ok: false, message: result.message };
  }
  s.coupon = {
    code: result.code,
    label: result.label,
    discount: result.discount,
    discountType: result.discountType,
    couponId: result.couponId,
  };
  const totals = computeCartTotals(s.cart, s.coupon);
  return {
    ok: true,
    message: flowMsg.buildCouponApplied({
      label: result.label,
      saved: totals.discount,
      finalTotal: totals.finalTotal,
    }),
    phase: "post_coupon",
  };
}

function parseCheckoutDetailsBlock(text, waFrom) {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) {
    return {
      error:
        "Please send 3 lines:\n\n1) Full name\n2) Address\n3) Phone (10 digits) or SAME",
    };
  }
  const name = lines[0];
  const phoneLine = lines[lines.length - 1];
  const address = lines.slice(1, -1).join("\n").trim();

  if (!name || name.length < 2) {
    return { error: "Line 1 should be your full name." };
  }
  if (!address || address.length < 4) {
    return { error: "Line 2 should be your complete delivery address." };
  }

  let phoneDigits = "";
  if (phoneLine.toLowerCase() === "same") {
    phoneDigits = String(waFrom || "").replace(/\D/g, "");
    if (phoneDigits.length >= 10) phoneDigits = phoneDigits.slice(-10);
  } else {
    phoneDigits = phoneLine.replace(/\D/g, "");
  }
  if (phoneDigits.length < 10) {
    return {
      error: "Line 3: valid 10-digit mobile, or SAME for this WhatsApp number.",
    };
  }

  return {
    name,
    address,
    phone: phoneDigits.slice(-10),
  };
}

async function showCartMenu(from, s, sendTextMessage) {
  if (!s.cart.length) {
    await sendTextMessage(
      from,
      "Your cart is empty.\n\nAdd items from the menu, then type CART."
    );
    return;
  }
  s.phase = "cart_menu";
  sessions.set(from, s);
  await sendTextMessage(from, flowMsg.buildCartMenu(s.cart, s.coupon));
}

async function goToCheckoutDetails(from, s, sendTextMessage) {
  if (!s.cart.length) {
    await sendTextMessage(from, "Your cart is empty. Add items first.");
    return;
  }
  if (s.coupon?.code) {
    const refreshed = await couponService.applyCoupon(
      s.coupon.code,
      computeCartTotals(s.cart, null).subtotal
    );
    if (!refreshed.valid) {
      s.coupon = null;
      sessions.set(from, s);
      await sendTextMessage(
        from,
        `${refreshed.message}\n\nCoupon removed. Type CART to review.`
      );
      return;
    }
    s.coupon = {
      code: refreshed.code,
      label: refreshed.label,
      discount: refreshed.discount,
      discountType: refreshed.discountType,
      couponId: refreshed.couponId,
    };
  }
  s.phase = "checkout_details";
  sessions.set(from, s);
  await sendTextMessage(from, flowMsg.buildDetailsPrompt());
}

async function goToPaymentSelect(from, s, sendTextMessage) {
  s.phase = "payment_select";
  sessions.set(from, s);
  await sendTextMessage(from, flowMsg.buildPaymentMenu());
}

async function finalizeOrder(from, s, deps, options = {}) {
  const { sendTextMessage, createOrder, waFrom, isOrderEnabled } = deps;
  const pendingVerification = !!options.pendingVerification;

  if (!isOrderEnabled()) {
    await sendTextMessage(
      from,
      "Ordering is temporarily unavailable. Please call the restaurant."
    );
    return;
  }

  const wa = String(waFrom || from);
  const phoneDigits = wa.replace(/\D/g, "");
  const phone10 =
    phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;

  const { subtotal, discount, finalTotal } = computeCartTotals(s.cart, s.coupon);
  const paymentMethod = s.paymentMethod || "cod";
  const paymentStatus = pendingVerification
    ? "pending_verification"
    : checkoutService.paymentStatusFor(paymentMethod);

  const cartLines = s.cart.map((l) => {
    const price =
      l.priceRupees != null ? `₹${l.priceRupees}` : "Ask";
    if (l.priceRupees == null) return `${l.qty} × ${l.name} (${price})`;
    return `${l.qty} × ${l.name} @ ${price} = ₹${l.lineTotal}`;
  });

  const noteParts = [
    `Category: ${s.categoryLabel || ""}`,
    "",
    ...cartLines,
    "",
    `Subtotal: ₹${subtotal}`,
  ];
  if (s.coupon?.code) {
    noteParts.push(
      `Coupon: ${s.coupon.code} (${s.coupon.label || ""})`,
      `Discount: -₹${discount}`
    );
  }
  noteParts.push(
    `Total: ₹${finalTotal}`,
    `Payment: ${paymentMethod.toUpperCase()}`,
    pendingVerification ? "Status: pending payment verification" : null,
    s.paymentProof?.utr ? `UTR: ${s.paymentProof.utr}` : null,
    s.paymentProof?.mediaId ? `Payment screenshot media: ${s.paymentProof.mediaId}` : null,
    "",
    `Customer: ${s.checkout.name}`,
    `Address: ${s.checkout.address}`,
    `Contact: ${s.checkout.phone}`
  );

  const data = await createOrder({
    customer_name: s.checkout.name,
    phone: s.checkout.phone || phone10,
    whatsapp: wa,
    address: s.checkout.address,
    line_items_note: noteParts.filter(Boolean).join("\n").slice(0, 4000),
    subtotal,
    discount_amount: discount,
    coupon_code: s.coupon?.code || null,
    total: finalTotal,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    order_source: "whatsapp",
    upi_transaction_id: s.paymentProof?.utr || null,
    payment_proof_media_id: s.paymentProof?.mediaId || null,
    payment_verified: paymentMethod === "cod",
    orderLines: s.cart,
  });

  if (s.coupon?.code) {
    await couponService.incrementCouponUsage(s.coupon.code);
  }

  const orderId = flowMsg.formatOrderId(data.order_num);

  if (pendingVerification) {
    await sendTextMessage(
      from,
      flowMsg.buildOrderPendingVerification({
        orderId,
        cart: s.cart,
        total: finalTotal,
        utr: s.paymentProof?.utr,
        hasScreenshot: !!s.paymentProof?.mediaId,
      })
    );
    await notifyRestaurantNewUpiOrder(sendTextMessage, data, {
      customerName: s.checkout.name,
      total: finalTotal,
      utr: s.paymentProof?.utr,
      hasScreenshot: !!s.paymentProof?.mediaId,
    });
  } else {
    await sendTextMessage(
      from,
      flowMsg.buildOrderConfirmed({
        orderId,
        cart: s.cart,
        total: finalTotal,
        paymentMethod,
        coupon: s.coupon,
        discount,
      })
    );
  }

  sessions.delete(from);
}

/**
 * Submit UPI payment proof (UTR text or screenshot).
 */
async function submitUpiProof(from, s, proof, deps) {
  s.paymentProof = proof;
  s.paymentMethod = "upi";
  sessions.set(from, s);
  await finalizeOrder(from, s, deps, { pendingVerification: true });
}

exports.tryHandlePaymentProof = async (from, message, deps) => {
  const { sendTextMessage } = deps;
  const s = sessions.get(from);
  if (!s || s.phase !== "upi_await_proof") return false;

  if (message.type === "image") {
    const mediaId =
      message.image?.id ||
      message.image?.media_id ||
      message.document?.id;
    if (!mediaId) {
      await sendTextMessage(from, flowMsg.buildInvalidPaymentProof());
      return true;
    }
    try {
      await submitUpiProof(
        from,
        s,
        { mediaId, utr: null },
        deps
      );
    } catch (err) {
      console.error("submitUpiProof image", err?.message);
      await sendTextMessage(
        from,
        "We could not save your order. Please try again or call us."
      );
    }
    return true;
  }

  return false;
};

/**
 * @returns {Promise<boolean>}
 */
exports.tryHandle = async (from, rawText, deps) => {
  const {
    sendTextMessage,
    sendUpiQrImage,
    sendPayNowButton,
    isOrderEnabled,
    createOrder,
    waFrom,
  } = deps;
  const text = (rawText || "").trim();
  const lower = text.toLowerCase();

  if (lower === "cancel") {
    if (sessions.has(from)) {
      sessions.delete(from);
      await sendTextMessage(from, "Order cancelled.\n\nType MENU to start again.");
      return true;
    }
    return false;
  }

  const s = sessions.get(from);
  if (!s) return false;

  // —— Shopping: add items ——
  if (s.phase === "shop") {
    const couponCmd = parseCouponCommand(text);
    if (couponCmd?.action === "prompt" || (couponCmd?.action === "apply" && !s.cart.length)) {
      await sendTextMessage(from, flowMsg.buildCouponPrompt());
      if (s.cart.length) {
        s.phase = "coupon_enter";
        sessions.set(from, s);
      }
      return true;
    }
    if (couponCmd?.action === "remove") {
      s.coupon = null;
      sessions.set(from, s);
      await sendTextMessage(from, "Coupon removed from your cart.");
      return true;
    }
    if (couponCmd?.action === "apply" && s.cart.length) {
      const applied = await applyCouponToSession(s, couponCmd.code);
      if (!applied.ok) {
        await sendTextMessage(from, applied.message);
        return true;
      }
      s.phase = applied.phase;
      sessions.set(from, s);
      await sendTextMessage(from, applied.message);
      return true;
    }

    if (lower === "cart") {
      await showCartMenu(from, s, sendTextMessage);
      return true;
    }

    if (lower === "order" || lower === "checkout") {
      if (!s.cart.length) {
        await sendTextMessage(from, "Your cart is empty. Add items first.");
        return true;
      }
      await showCartMenu(from, s, sendTextMessage);
      return true;
    }

    const { added, errors } = parseAddsFromText(text, s.catalog);
    if (added.length) {
      s.cart.push(...added);
      await refreshCouponOnCart(s);
      sessions.set(from, s);
      const totals = s.coupon ? computeCartTotals(s.cart, s.coupon) : null;
      await sendTextMessage(
        from,
        flowMsg.buildAddedToCart(added, totals ? { finalTotal: totals.finalTotal, coupon: s.coupon } : null)
      );
      if (errors.length) {
        await sendTextMessage(
          from,
          ["Note:", ...errors.map((e) => `• ${e}`)].join("\n")
        );
      }
      return true;
    }

    if (errors.length) {
      await sendTextMessage(
        from,
        ["Could not add:", ...errors.map((e) => `• ${e}`), "", flowMsg.buildCatalogFooter()].join("\n")
      );
      return true;
    }

    await sendTextMessage(
      from,
      ["How to add:", "• 2 x 3  (item number)", "• 2 x Veg Momos  (by name)", "", flowMsg.buildCatalogFooter()].join("\n")
    );
    return true;
  }

  // —— Cart menu: coupon or checkout ——
  if (s.phase === "cart_menu") {
    if (isChoice1(text)) {
      s.phase = "coupon_enter";
      sessions.set(from, s);
      await sendTextMessage(from, flowMsg.buildCouponPrompt());
      return true;
    }
    if (isChoice2(text)) {
      await goToCheckoutDetails(from, s, sendTextMessage);
      return true;
    }
    const couponCmd = parseCouponCommand(text);
    if (couponCmd?.action === "apply") {
      const applied = await applyCouponToSession(s, couponCmd.code);
      if (!applied.ok) {
        await sendTextMessage(from, applied.message);
        return true;
      }
      s.phase = applied.phase;
      sessions.set(from, s);
      await sendTextMessage(from, applied.message);
      return true;
    }
    if (lower === "cart") {
      await sendTextMessage(from, flowMsg.buildCartMenu(s.cart, s.coupon));
      return true;
    }
    await sendTextMessage(
      from,
      "Reply *1* Apply Coupon · *2* Proceed to Checkout\n\nOr type MENU to add more items."
    );
    return true;
  }

  // —— Enter coupon code ——
  if (s.phase === "coupon_enter") {
    const couponCmd = parseCouponCommand(text);
    const code = couponCmd?.action === "apply" ? couponCmd.code : text;
    if (!code || code.length < 3) {
      await sendTextMessage(from, "Please send a valid coupon code.\nExample: maajaanki20");
      return true;
    }
    const applied = await applyCouponToSession(s, code);
    if (!applied.ok) {
      await sendTextMessage(from, `${applied.message}\n\nTry again or reply MENU.`);
      return true;
    }
    s.phase = applied.phase;
    sessions.set(from, s);
    await sendTextMessage(from, applied.message);
    return true;
  }

  // —— After coupon: continue checkout ——
  if (s.phase === "post_coupon") {
    if (isChoice1(text) || isChoice2(text)) {
      await goToCheckoutDetails(from, s, sendTextMessage);
      return true;
    }
    if (lower === "cart") {
      s.phase = "cart_menu";
      sessions.set(from, s);
      await sendTextMessage(from, flowMsg.buildCartMenu(s.cart, s.coupon));
      return true;
    }
    await sendTextMessage(from, "Reply *1* to Continue Checkout.");
    return true;
  }

  // —— Delivery details ——
  if (s.phase === "checkout_details") {
    if (!text) {
      await sendTextMessage(from, flowMsg.buildDetailsPrompt());
      return true;
    }
    const parsed = parseCheckoutDetailsBlock(text, waFrom || from);
    if (parsed.error) {
      await sendTextMessage(from, parsed.error);
      return true;
    }
    s.checkout = {
      name: parsed.name,
      address: parsed.address,
      phone: parsed.phone,
    };
    sessions.set(from, s);
    await goToPaymentSelect(from, s, sendTextMessage);
    return true;
  }

  // —— Payment method ——
  if (s.phase === "payment_select") {
    const config = checkoutService.getPaymentConfig();
    const { finalTotal } = computeCartTotals(s.cart, s.coupon);

    if (isPaymentCod(text)) {
      s.paymentMethod = "cod";
      sessions.set(from, s);
      await sendTextMessage(from, flowMsg.buildCodSelected());
      try {
        await finalizeOrder(from, s, { sendTextMessage, createOrder, waFrom, isOrderEnabled });
      } catch (err) {
        console.error("finalizeOrder", err?.message);
        await sendTextMessage(
          from,
          "We could not save your order. Please try again or call us."
        );
      }
      return true;
    }

    if (isPaymentUpi(text) && config.upiEnabled) {
      s.paymentMethod = "upi";
      s.phase = "upi_await_proof";
      sessions.set(from, s);
      const upi = config.methods.find((m) => m.id === "upi");
      await sendTextMessage(
        from,
        flowMsg.buildUpiPayment({
          upiId: upi?.upiId,
          payeeName: upi?.payeeName,
          amount: finalTotal,
        })
      );
      const payUrl = buildPublicPayUrl(finalTotal);
      if (sendPayNowButton && payUrl) {
        try {
          await sendPayNowButton(from, { amount: finalTotal, payUrl });
        } catch (err) {
          console.error("sendPayNowButton failed", err?.message);
        }
      }
      if (sendUpiQrImage) {
        try {
          const qr = await sendUpiQrImage(
            from,
            `Scan to pay ₹${finalTotal} · Maa Jaanki Restaurant`
          );
          if (!qr?.sent) {
            await sendTextMessage(
              from,
              "QR image unavailable. Use the UPI ID above to pay."
            );
          }
        } catch (err) {
          console.error("sendUpiQrImage failed", err?.message);
          await sendTextMessage(
            from,
            "Could not send QR image. Use the UPI ID above to pay."
          );
        }
      }
      await sendTextMessage(from, flowMsg.buildUpiAwaitProof(finalTotal));
      return true;
    }

    if (isPaymentUpi(text) && !config.upiEnabled) {
      await sendTextMessage(
        from,
        "UPI is not available right now.\n\nReply *1* for Cash on Delivery."
      );
      return true;
    }

    await sendTextMessage(
      from,
      config.upiEnabled
        ? "Reply *1* for COD  ·  *2* for UPI & QR"
        : "Reply *1* for Cash on Delivery"
    );
    return true;
  }

  // —— UPI: require UTR or payment screenshot ——
  if (s.phase === "upi_await_proof") {
    if (isDoneOnly(text)) {
      await sendTextMessage(
        from,
        [
          "⚠️ We cannot confirm with DONE alone.",
          "",
          "Please send your *12-digit UTR* or a *payment screenshot*",
          "after completing UPI payment.",
          "",
          flowMsg.buildUpiAwaitProof(
            computeCartTotals(s.cart, s.coupon).finalTotal
          ),
        ].join("\n")
      );
      return true;
    }

    const utr = paymentVerification.extractUtr(text);
    if (!utr || !paymentVerification.isValidUtr(utr)) {
      await sendTextMessage(from, flowMsg.buildInvalidPaymentProof());
      return true;
    }

    if (await paymentVerification.isUtrAlreadyUsed(utr)) {
      await sendTextMessage(
        from,
        "This Transaction ID was already used.\n\nSend the correct UTR or a payment screenshot."
      );
      return true;
    }

    try {
      await submitUpiProof(from, s, { utr, mediaId: null }, {
        sendTextMessage,
        createOrder,
        waFrom,
        isOrderEnabled,
      });
    } catch (err) {
      console.error("submitUpiProof utr", err?.message);
      await sendTextMessage(
        from,
        "We could not save your order. Please try again or call us."
      );
    }
    return true;
  }

  return false;
};

exports.formatNumberedCatalogFooter = () => flowMsg.buildCatalogFooter();

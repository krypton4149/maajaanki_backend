const couponService = require("./couponService");

const sessions = new Map();

function computeCartTotals(cart, appliedCoupon) {
  const subtotal = cart.reduce((s, l) => s + (l.lineTotal || 0), 0);
  const discount = appliedCoupon?.discount
    ? Math.min(subtotal, Number(appliedCoupon.discount) || 0)
    : 0;
  const finalTotal = Math.max(0, Math.round(subtotal - discount));
  return {
    subtotal: Math.round(subtotal),
    discount: Math.round(discount),
    finalTotal,
  };
}

exports.clearSession = (from) => {
  sessions.delete(from);
};

/**
 * When user opens MENU: keep cart across categories; only drop checkout progress.
 */
exports.onMenuOpened = (from) => {
  const s = sessions.get(from);
  if (!s) return;
  const phase = s.phase || "";
  if (phase.startsWith("checkout")) {
    sessions.set(from, {
      phase: "shop",
      categoryLabel: s.categoryLabel || "",
      catalog: Array.isArray(s.catalog) ? s.catalog : [],
      cart: Array.isArray(s.cart) ? s.cart.map((c) => ({ ...c })) : [],
      coupon: s.coupon || null,
    });
    return;
  }
  if (phase === "shop" && (!s.cart || s.cart.length === 0)) {
    sessions.delete(from);
  }
};

exports.hasSession = (from) => sessions.has(from);

exports.startShopping = (from, { categoryLabel, catalog }) => {
  const existing = sessions.get(from);
  const keepCart =
    existing &&
    existing.phase === "shop" &&
    Array.isArray(existing.cart) &&
    existing.cart.length > 0
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

function moneyLine(priceRupees) {
  if (priceRupees == null || Number.isNaN(Number(priceRupees))) {
    return "Ask";
  }
  return `₹${Number(priceRupees)}`;
}

function formatCart(cart, appliedCoupon) {
  if (!cart.length) {
    return "Your cart is empty. Add items with:\n• QTY x #  (e.g. 2 x 3  = 2 plates of item #3)\n• QTY x name  (e.g. 2 x Veg Biryani)";
  }
  const lines = cart.map((l, i) => {
    const unit = moneyLine(l.priceRupees);
    const sub =
      l.priceRupees == null
        ? `${l.qty} × ${l.name} (${unit} each)`
        : `${l.qty} × ${l.name} @ ${unit} = ₹${l.lineTotal}`;
    return `${i + 1}. ${sub}`;
  });
  const { subtotal, discount, finalTotal } = computeCartTotals(
    cart,
    appliedCoupon
  );
  const unknown = cart.some((l) => l.priceRupees == null);
  const totalParts = [];
  if (unknown) {
    totalParts.push(
      `Estimated subtotal (Ask items excluded): ₹${subtotal}`,
      "Final total confirmed by restaurant."
    );
  } else if (appliedCoupon?.code && discount > 0) {
    totalParts.push(
      `Subtotal: ₹${subtotal}`,
      `Coupon: ${appliedCoupon.code} (${appliedCoupon.label || "discount"})`,
      `Discount: -₹${discount}`,
      `Total: ₹${finalTotal}`
    );
  } else if (appliedCoupon?.code && appliedCoupon.discountType === "free_delivery") {
    totalParts.push(
      `Subtotal: ₹${subtotal}`,
      `Coupon: ${appliedCoupon.code} (${appliedCoupon.label || "Free Delivery"})`,
      `Total: ₹${finalTotal}`
    );
  } else {
    totalParts.push(`Total: ₹${subtotal}`);
  }
  return ["🛒 YOUR CART", "──────────────", "", ...lines, "", ...totalParts].join(
    "\n"
  );
}

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

function formatCatalogFooter() {
  return [
    "──────────────",
    "How to order:",
    "• 2 x 3  → 2 plates of item #3",
    "• 2 x Veg Biryani  → by name",
    "CART — bag & total",
    "COUPON maajaanki20 — apply 20% off",
    "ORDER — name, address & phone (one reply)",
    "MENU — more categories (your bag is kept)",
  ].join("\n");
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

/** Pull coupon code from a checkout line (COUPON x, or bare maajaanki20). */
function extractCouponCodeFromLine(line) {
  const t = String(line || "").trim();
  if (!t) return null;
  const prefixed = t.match(/^coupon\s+(\S+)$/i);
  if (prefixed) return prefixed[1];
  const digitsOnly = t.replace(/\D/g, "");
  if (digitsOnly.length >= 10 && /^\d[\d\s+\-().]*$/.test(t)) return null;
  if (/^[a-z0-9]{4,32}$/i.test(t)) return t;
  return null;
}

function buildCheckoutConfirmMessage(s) {
  const cartText = formatCart(s.cart, s.coupon);
  const lines = [
    "Please confirm your order:",
    "──────────────",
    `Name: ${s.checkout.name}`,
    `Address: ${s.checkout.address}`,
    `Phone: ${s.checkout.phone}`,
  ];
  if (s.coupon?.code) {
    lines.push(`Coupon: ${s.coupon.code} (${s.coupon.label || "discount"})`);
  }
  lines.push("", cartText, "", "Reply YES to place the order, or NO to cancel.");
  if (!s.coupon?.code) {
    lines.push(
      "",
      "Tip: type COUPON maajaanki20 before YES for 20% off."
    );
  }
  return lines.join("\n");
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
    message: [
      "✅ Coupon applied",
      "",
      result.label,
      "",
      `Subtotal: ₹${totals.subtotal}`,
      result.discount > 0 ? `Discount: -₹${totals.discount}` : null,
      `New total: ₹${totals.finalTotal}`,
      "",
      "Type CART to review · ORDER when ready.",
    ]
      .filter(Boolean)
      .join("\n"),
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
        "Please send 3 parts in one message (each on its own line):\n\n" +
        "1) Your full name\n" +
        "2) Complete delivery address\n" +
        "3) 10-digit mobile number — or type SAME to use this WhatsApp number\n\n" +
        "Example:\n" +
        "Asha Mehta\n" +
        "42, MG Road, Demo City - 400001\n" +
        "9876504321",
    };
  }
  const name = lines[0];
  const phoneLine = lines[lines.length - 1];
  const middleLines = lines.slice(1, -1);
  const addressLines = [];
  let couponCode = null;
  for (const line of middleLines) {
    const code = extractCouponCodeFromLine(line);
    if (code && !couponCode) couponCode = code;
    else addressLines.push(line);
  }
  const address = addressLines.join("\n").trim();

  if (!name || name.length < 2) {
    return { error: "Line 1 should be your full name." };
  }
  if (!address || address.length < 4) {
    return {
      error:
        "Line 2 should be your full address (coupon on its own line is OK — e.g. maajaanki20).",
    };
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
      error:
        "Last line: send a valid 10-digit mobile number, or SAME for this WhatsApp number.",
    };
  }

  return {
    name,
    address,
    phone: phoneDigits.slice(-10),
    couponCode,
  };
}

/**
 * @returns {Promise<boolean>}
 */
exports.tryHandle = async (from, rawText, deps) => {
  const { sendTextMessage, isOrderEnabled, createOrder, waFrom } = deps;
  const text = (rawText || "").trim();
  const lower = text.toLowerCase();

  if (lower === "cancel") {
    if (sessions.has(from)) {
      sessions.delete(from);
      await sendTextMessage(
        from,
        "Cancelled. Type MENU to browse again."
      );
      return true;
    }
    return false;
  }

  const s = sessions.get(from);
  if (!s) return false;

  if (s.phase === "shop") {
    const couponCmd = parseCouponCommand(text);
    if (couponCmd?.action === "prompt") {
      await sendTextMessage(
        from,
        "Send your coupon like:\nCOUPON maajaanki20\n\nType REMOVE COUPON to clear."
      );
      return true;
    }
    if (couponCmd?.action === "remove") {
      s.coupon = null;
      sessions.set(from, s);
      await sendTextMessage(from, "Coupon removed from your cart.");
      return true;
    }
    if (couponCmd?.action === "apply") {
      if (!s.cart.length) {
        await sendTextMessage(
          from,
          "Add items to your cart first, then apply a coupon.\nExample: COUPON maajaanki20"
        );
        return true;
      }
      const applied = await applyCouponToSession(s, couponCmd.code);
      if (!applied.ok) {
        await sendTextMessage(from, applied.message);
        return true;
      }
      sessions.set(from, s);
      await sendTextMessage(from, applied.message);
      return true;
    }

    if (lower === "cart") {
      await sendTextMessage(
        from,
        [
          formatCart(s.cart, s.coupon),
          "",
          "ORDER — send name, address & phone in one reply",
          "COUPON maajaanki20 — 20% off",
          "MENU — more categories (your bag is kept)",
        ].join("\n")
      );
      return true;
    }
    if (lower === "order" || lower === "checkout") {
      if (!s.cart.length) {
        await sendTextMessage(
          from,
          "Your cart is empty. Add items first, then type CART."
        );
        return true;
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
            `${refreshed.message}\n\nCoupon removed. Type CART to see your total, then ORDER again.`
          );
          return true;
        }
        s.coupon = {
          code: refreshed.code,
          label: refreshed.label,
          discount: refreshed.discount,
          discountType: refreshed.discountType,
          couponId: refreshed.couponId,
        };
        sessions.set(from, s);
      }
      if (!isOrderEnabled()) {
        await sendTextMessage(
          from,
          "Ordering is not connected (database). Please call the restaurant."
        );
        return true;
      }
      s.phase = "checkout_details";
      sessions.set(from, s);
      await sendTextMessage(
        from,
        [
          "Great — please send your delivery details in one message (use separate lines):",
          "",
          "1) Full name",
          "2) Complete delivery address",
          "3) Coupon (optional) — e.g. maajaanki20",
          "4) 10-digit mobile — or SAME for this WhatsApp number",
          "",
          "Example:",
          "Asha Mehta",
          "42, MG Road, Demo City - 400001",
          "maajaanki20",
          "9876504321",
          "",
          "Or apply before ORDER: COUPON maajaanki20",
        ].join("\n")
      );
      return true;
    }

    const { added, errors } = parseAddsFromText(text, s.catalog);
    if (added.length) {
      s.cart.push(...added);
      if (s.coupon?.code) {
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
      sessions.set(from, s);
      const parts = ["Added to cart:", ...added.map((a) => `• ${a.qty} × ${a.name}`)];
      if (errors.length) parts.push("", "Notes:", ...errors.map((e) => `• ${e}`));
      if (s.coupon?.code) {
        const totals = computeCartTotals(s.cart, s.coupon);
        parts.push(
          "",
          `Coupon ${s.coupon.code} active · Total: ₹${totals.finalTotal}`
        );
      } else {
        parts.push("", "Type CART to review total, or ORDER when ready.");
      }
      await sendTextMessage(from, parts.join("\n"));
      return true;
    }

    if (errors.length) {
      await sendTextMessage(
        from,
        ["Could not add:", ...errors.map((e) => `• ${e}`), "", formatCatalogFooter()].join(
          "\n"
        )
      );
      return true;
    }

    await sendTextMessage(
      from,
      [
        "Send items like:",
        "• 2 x 5   (2 plates of #5)",
        "• 2 x Veg Biryani",
        "",
        formatCatalogFooter(),
      ].join("\n")
    );
    return true;
  }

  if (s.phase === "checkout_details") {
    const couponCmd = parseCouponCommand(text);
    if (couponCmd?.action === "apply") {
      const applied = await applyCouponToSession(s, couponCmd.code);
      if (!applied.ok) {
        await sendTextMessage(from, applied.message);
        return true;
      }
      sessions.set(from, s);
      await sendTextMessage(
        from,
        `${applied.message}\n\nThen send name, address, coupon (optional), and phone.`
      );
      return true;
    }

    if (!text) {
      await sendTextMessage(
        from,
        "Send your name, address, optional coupon (maajaanki20), and phone — each on its own line."
      );
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
    if (parsed.couponCode) {
      const applied = await applyCouponToSession(s, parsed.couponCode);
      if (!applied.ok) {
        await sendTextMessage(
          from,
          `${applied.message}\n\nSend details again without the coupon, or fix the code.`
        );
        return true;
      }
    }
    s.phase = "checkout_confirm";
    sessions.set(from, s);

    await sendTextMessage(from, buildCheckoutConfirmMessage(s));
    return true;
  }

  if (s.phase === "checkout_confirm") {
    const couponCmd = parseCouponCommand(text);
    if (couponCmd?.action === "apply") {
      const applied = await applyCouponToSession(s, couponCmd.code);
      if (!applied.ok) {
        await sendTextMessage(from, applied.message);
        return true;
      }
      sessions.set(from, s);
      await sendTextMessage(from, buildCheckoutConfirmMessage(s));
      return true;
    }
    if (couponCmd?.action === "remove") {
      s.coupon = null;
      sessions.set(from, s);
      await sendTextMessage(from, buildCheckoutConfirmMessage(s));
      return true;
    }
    const bareCode = extractCouponCodeFromLine(text);
    if (bareCode && lower !== "yes" && lower !== "y" && lower !== "no" && lower !== "n") {
      const applied = await applyCouponToSession(s, bareCode);
      if (!applied.ok) {
        await sendTextMessage(from, applied.message);
        return true;
      }
      sessions.set(from, s);
      await sendTextMessage(from, buildCheckoutConfirmMessage(s));
      return true;
    }

    if (lower === "no" || lower === "n") {
      sessions.delete(from);
      await sendTextMessage(
        from,
        "Order not placed. Type MENU to start again."
      );
      return true;
    }
    if (lower !== "yes" && lower !== "y") {
      await sendTextMessage(
        from,
        "Reply YES to confirm, NO to cancel, or COUPON maajaanki20 to apply 20% off."
      );
      return true;
    }
    try {
      const wa = String(waFrom || from);
      const phoneDigits = wa.replace(/\D/g, "");
      const phone10 =
        phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;

      const cartLines = s.cart.map((l) => {
        const u = moneyLine(l.priceRupees);
        if (l.priceRupees == null) return `${l.qty} × ${l.name} (${u})`;
        return `${l.qty} × ${l.name} @ ${u} = ₹${l.lineTotal}`;
      });
      const { subtotal, discount, finalTotal } = computeCartTotals(
        s.cart,
        s.coupon
      );
      const noteParts = [
        `Category: ${s.categoryLabel || ""}`,
        "",
        ...cartLines,
        "",
        `Items subtotal (where price known): ₹${subtotal}`,
      ];
      if (s.coupon?.code) {
        noteParts.push(
          `Coupon: ${s.coupon.code} (${s.coupon.label || ""})`,
          `Discount: -₹${discount}`
        );
      }
      noteParts.push(
        `Order total: ₹${finalTotal}`,
        "",
        `Customer: ${s.checkout.name}`,
        `Address: ${s.checkout.address}`,
        `Contact: ${s.checkout.phone}`
      );
      const note = noteParts.join("\n");

      const data = await createOrder({
        customer_name: s.checkout.name,
        phone: s.checkout.phone || phone10,
        whatsapp: wa,
        address: s.checkout.address,
        line_items_note: note.slice(0, 4000),
        total: finalTotal,
        orderLines: s.cart,
      });
      if (s.coupon?.code) {
        await couponService.incrementCouponUsage(s.coupon.code);
      }
      sessions.delete(from);
      await sendTextMessage(
        from,
        [
          "✅ Order placed successfully.",
          `Order #${String(data.order_num)}`,
          "",
          "📞 We will call you shortly to confirm this order.",
          "Thank you for choosing Maa Jaanki Restaurant — we appreciate you! 🙏",
        ].join("\n")
      );
    } catch (err) {
      console.error(
        "createOrder failed",
        err?.message,
        err?.details,
        err?.hint,
        err?.code
      );
      await sendTextMessage(
        from,
        "We could not save your order. Please try again or call the restaurant."
      );
    }
    return true;
  }

  return false;
};

exports.formatNumberedCatalogFooter = formatCatalogFooter;

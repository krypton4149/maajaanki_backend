const sessions = new Map();

exports.clearSession = (from) => {
  sessions.delete(from);
};

exports.hasSession = (from) => sessions.has(from);

exports.startShopping = (from, { categoryLabel, catalog }) => {
  const numbered = catalog.map((row, i) => ({
    num: i + 1,
    name: row.name,
    priceRupees: row.priceRupees,
  }));
  sessions.set(from, {
    phase: "shop",
    categoryLabel,
    catalog: numbered,
    cart: [],
  });
};

function moneyLine(priceRupees) {
  if (priceRupees == null || Number.isNaN(Number(priceRupees))) {
    return "Ask";
  }
  return `₹${Number(priceRupees)}`;
}

function formatCart(cart) {
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
  const total = cart.reduce((s, l) => s + (l.lineTotal || 0), 0);
  const unknown = cart.some((l) => l.priceRupees == null);
  const totalLine = unknown
    ? `\nEstimated (items marked Ask excluded): ₹${total}\nFinal total confirmed by restaurant.`
    : `\nTotal: ₹${total}`;
  return ["🛒 YOUR CART", "──────────────", "", ...lines, "", totalLine].join(
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
    "CHECKOUT — delivery details",
    "MENU — categories",
  ].join("\n");
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
    if (lower === "cart") {
      await sendTextMessage(
        from,
        [
          formatCart(s.cart),
          "",
          "CHECKOUT — name, address & phone",
          "MENU — categories",
        ].join("\n")
      );
      return true;
    }
    if (lower === "checkout") {
      if (!s.cart.length) {
        await sendTextMessage(
          from,
          "Your cart is empty. Add items first, then type CART."
        );
        return true;
      }
      if (!isOrderEnabled()) {
        await sendTextMessage(
          from,
          "Ordering is not connected (database). Please call the restaurant."
        );
        return true;
      }
      s.phase = "checkout_name";
      sessions.set(from, s);
      await sendTextMessage(
        from,
        "Great. What is your full name for this order?"
      );
      return true;
    }

    const { added, errors } = parseAddsFromText(text, s.catalog);
    if (added.length) {
      s.cart.push(...added);
      sessions.set(from, s);
      const parts = ["Added to cart:", ...added.map((a) => `• ${a.qty} × ${a.name}`)];
      if (errors.length) parts.push("", "Notes:", ...errors.map((e) => `• ${e}`));
      parts.push("", "Type CART to review total, or CHECKOUT when ready.");
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

  if (s.phase === "checkout_name") {
    if (!text) {
      await sendTextMessage(from, "Please send your name.");
      return true;
    }
    s.checkout = { name: text };
    s.phase = "checkout_address";
    sessions.set(from, s);
    await sendTextMessage(
      from,
      "Thanks. Please send your full delivery address (one message)."
    );
    return true;
  }

  if (s.phase === "checkout_address") {
    if (!text) {
      await sendTextMessage(from, "Please send your address.");
      return true;
    }
    s.checkout.address = text;
    s.phase = "checkout_phone";
    sessions.set(from, s);
    await sendTextMessage(
      from,
      "Mobile number for contact (10 digits), or type SAME to use this WhatsApp number."
    );
    return true;
  }

  if (s.phase === "checkout_phone") {
    let phoneDigits = "";
    if (lower === "same") {
      phoneDigits = String(waFrom || from).replace(/\D/g, "");
      if (phoneDigits.length >= 10) phoneDigits = phoneDigits.slice(-10);
    } else {
      phoneDigits = text.replace(/\D/g, "");
    }
    if (phoneDigits.length < 10) {
      await sendTextMessage(
        from,
        "Please send a valid 10-digit mobile number, or SAME."
      );
      return true;
    }
    s.checkout.phone = phoneDigits.slice(-10);
    s.phase = "checkout_confirm";
    sessions.set(from, s);

    const cartText = formatCart(s.cart);
    await sendTextMessage(
      from,
      [
        "Please confirm your order:",
        "──────────────",
        `Name: ${s.checkout.name}`,
        `Address: ${s.checkout.address}`,
        `Phone: ${s.checkout.phone}`,
        "",
        cartText,
        "",
        "Reply YES to place the order, or NO to cancel.",
      ].join("\n")
    );
    return true;
  }

  if (s.phase === "checkout_confirm") {
    if (lower === "no" || lower === "n") {
      sessions.delete(from);
      await sendTextMessage(
        from,
        "Order not placed. Type MENU to start again."
      );
      return true;
    }
    if (lower !== "yes" && lower !== "y") {
      await sendTextMessage(from, "Reply YES to confirm or NO to cancel.");
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
      const total = s.cart.reduce((sum, l) => sum + (l.lineTotal || 0), 0);
      const note = [
        `Category: ${s.categoryLabel || ""}`,
        "",
        ...cartLines,
        "",
        `Items total (where price known): ₹${total}`,
        "",
        `Customer: ${s.checkout.name}`,
        `Address: ${s.checkout.address}`,
        `Contact: ${s.checkout.phone}`,
      ].join("\n");

      const data = await createOrder({
        customer_name: s.checkout.name,
        phone: s.checkout.phone || phone10,
        whatsapp: wa,
        address: s.checkout.address,
        line_items_note: note.slice(0, 4000),
        total,
      });
      sessions.delete(from);
      await sendTextMessage(
        from,
        [
          "✅ Order placed successfully.",
          `Order #${String(data.order_num)}`,
          "",
          "We will contact you on WhatsApp. Thank you!",
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

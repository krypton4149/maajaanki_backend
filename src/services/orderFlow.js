const sessions = new Map();

exports.clearSession = (from) => {
  sessions.delete(from);
};

function startKeywords(lower) {
  return lower === "order" || lower === "place order" || lower === "book order";
}

/**
 * @returns {Promise<boolean>} true if this message was consumed by the order flow
 */
exports.tryHandleOrderMessage = async (from, rawText, deps) => {
  const { sendTextMessage, isOrderEnabled, createOrder } = deps;
  const text = (rawText || "").trim();
  const lower = text.toLowerCase();

  if (lower === "cancel" && sessions.has(from)) {
    sessions.delete(from);
    await sendTextMessage(
      from,
      "Order cancelled. Type MENU to browse or ORDER to start again."
    );
    return true;
  }

  if (!sessions.has(from)) {
    if (!startKeywords(lower)) return false;
    if (!isOrderEnabled()) {
      await sendTextMessage(
        from,
        "Ordering is not connected yet. Add Supabase keys on the server, then try again."
      );
      return true;
    }
    sessions.set(from, { step: "name" });
    await sendTextMessage(
      from,
      "Let’s take your order. What name should we use?"
    );
    return true;
  }

  const s = sessions.get(from);

  if (s.step === "name") {
    if (!text) {
      await sendTextMessage(from, "Please send a name, or type CANCEL.");
      return true;
    }
    sessions.set(from, { step: "address", name: text });
    await sendTextMessage(
      from,
      "Thanks. Please send your full delivery address in one message."
    );
    return true;
  }

  if (s.step === "address") {
    if (!text) {
      await sendTextMessage(from, "Please send your address, or type CANCEL.");
      return true;
    }
    sessions.set(from, { step: "items", name: s.name, address: text });
    await sendTextMessage(
      from,
      "Send your items (one per line). Example:\n2 x Deluxe Thali\n1 x Butter Naan"
    );
    return true;
  }

  if (s.step === "items") {
    if (!text) {
      await sendTextMessage(from, "Please list items, or type CANCEL.");
      return true;
    }
    try {
      const wa = String(from).replace(/\D/g, "");
      const phone = wa.length >= 10 ? wa.slice(-10) : wa;
      const data = await createOrder({
        customer_name: s.name,
        phone,
        whatsapp: String(from),
        address: s.address,
        line_items_note: text.slice(0, 4000),
      });
      sessions.delete(from);
      await sendTextMessage(
        from,
        [
          "Order received and saved.",
          `Order #${data.order_num}`,
          "",
          "We will confirm on WhatsApp. Thank you!",
        ].join("\n")
      );
    } catch (err) {
      console.error("createOrder", err);
      await sendTextMessage(
        from,
        "We could not save your order. Please try again in a moment or call the restaurant."
      );
    }
    return true;
  }

  return false;
};

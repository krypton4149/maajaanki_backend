const { formatPhoneForWhatsApp } = require("../services/orderConfirmationService");

/**
 * Out-for-delivery: notify the WhatsApp number used to place the order,
 * not the delivery contact phone (may be someone else at the address).
 */
function resolveOutForDeliveryRecipients(order) {
  const seen = new Set();
  const recipients = [];

  const add = (to, kind) => {
    if (!to || to.length < 10 || seen.has(to)) return;
    seen.add(to);
    recipients.push({ to, kind });
  };

  const chatWa = formatPhoneForWhatsApp(null, order.whatsapp);
  if (chatWa) {
    add(chatWa, "whatsapp_chat");
  }

  // Website / phone-only orders when no WhatsApp id on the row
  const deliveryPhone = formatPhoneForWhatsApp(order.phone, null);
  if (deliveryPhone) {
    add(deliveryPhone, "delivery_phone_fallback");
  }

  return recipients;
}

/**
 * General notifications (legacy) — delivery contact first.
 */
function resolveNotificationRecipients(order) {
  const seen = new Set();
  const recipients = [];

  const add = (to, kind) => {
    if (!to || to.length < 10 || seen.has(to)) return;
    seen.add(to);
    recipients.push({ to, kind });
  };

  const primary = formatPhoneForWhatsApp(order.phone, order.whatsapp);
  if (primary) {
    add(primary, "primary");
  }

  const chatWa = formatPhoneForWhatsApp(null, order.whatsapp);
  if (chatWa) {
    add(chatWa, "whatsapp_chat");
  }

  return recipients;
}

module.exports = {
  resolveOutForDeliveryRecipients,
  resolveNotificationRecipients,
};

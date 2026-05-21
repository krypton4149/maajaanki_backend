const { formatPhoneForWhatsApp } = require("../services/orderConfirmationService");

/**
 * Who should receive outbound WhatsApp (order updates, out for delivery).
 * - WhatsApp orders: person who chatted (active 24h window).
 * - Delivery phone: contact from checkout (may differ for gift orders).
 */
function resolveNotificationRecipients(order) {
  const seen = new Set();
  const recipients = [];

  const add = (to, kind) => {
    if (!to || to.length < 10 || seen.has(to)) return;
    seen.add(to);
    recipients.push({ to, kind });
  };

  // Same priority as Order Confirmed: checkout phone first, then WhatsApp chat id.
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

module.exports = { resolveNotificationRecipients };

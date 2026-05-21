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

  const deliveryPhone = formatPhoneForWhatsApp(order.phone, null);
  const chatWa = formatPhoneForWhatsApp(null, order.whatsapp);

  if (order.orderSource === "whatsapp" && chatWa) {
    add(chatWa, "whatsapp_chat");
  }

  if (deliveryPhone) {
    add(deliveryPhone, "delivery_phone");
  }

  if (!recipients.length && chatWa) {
    add(chatWa, "fallback_whatsapp");
  }

  return recipients;
}

module.exports = { resolveNotificationRecipients };

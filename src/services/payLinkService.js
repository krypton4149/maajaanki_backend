function getAppBaseUrl() {
  const base =
    String(process.env.APP_PUBLIC_URL || "").trim() ||
    String(process.env.PUBLIC_BASE_URL || "").trim();
  return base.replace(/\/$/, "");
}

function buildUpiDeepLink(upiId, payeeName, amount) {
  const params = new URLSearchParams({
    pa: String(upiId || "").trim(),
    pn: String(payeeName || "Maa Jaanki Restaurant").trim(),
    am: String(Number(amount).toFixed(2)),
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

/** HTTPS link — tappable in WhatsApp (upi:// is not). */
function buildPublicPayUrl(amount) {
  const base = getAppBaseUrl();
  if (!base) return null;
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  return `${base}/pay?amount=${amt}`;
}

module.exports = {
  getAppBaseUrl,
  buildUpiDeepLink,
  buildPublicPayUrl,
};

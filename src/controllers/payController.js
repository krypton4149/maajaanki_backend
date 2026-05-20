const {
  buildUpiDeepLink,
  getAppBaseUrl,
} = require("../services/payLinkService");

exports.payPage = (req, res) => {
  const amount = Math.max(0, Math.round(Number(req.query.amount) || 0));
  const upiId = String(process.env.RESTAURANT_UPI_ID || "").trim();
  const payeeName = String(
    process.env.RESTAURANT_UPI_PAYEE_NAME || "Maa Jaanki Restaurant"
  ).trim();

  if (!upiId || amount <= 0) {
    return res.status(400).send("Invalid payment link. Amount or UPI not configured.");
  }

  const upiLink = buildUpiDeepLink(upiId, payeeName, amount);
  const qrUrl = getAppBaseUrl()
    ? `${getAppBaseUrl()}/assets/upi-qr.png`
    : "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pay ₹${amount} — Maa Jaanki</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; background: #f6f6f6; }
    .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.08); text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; color: #c45c26; }
    .amt { font-size: 2rem; font-weight: 700; margin: 12px 0; color: #111; }
    .btn { display: block; background: #25D366; color: #fff; text-decoration: none; padding: 14px 20px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .upi { background: #f0f0f0; padding: 10px; border-radius: 8px; word-break: break-all; font-size: 0.95rem; }
    img { max-width: 220px; margin: 12px auto; display: block; }
    p { color: #555; font-size: 0.9rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Maa Jaanki Restaurant</h1>
    <p>Pay via UPI</p>
    <p class="amt">₹${amount}</p>
    <a class="btn" href="${upiLink}">Open UPI App & Pay</a>
    <p>Or copy UPI ID:</p>
    <p class="upi">${upiId}</p>
    ${qrUrl ? `<p>Or scan QR:</p><img src="${qrUrl}" alt="UPI QR" />` : ""}
    <p>After paying, return to WhatsApp and reply <strong>DONE</strong>.</p>
  </div>
  <script>
    (function () {
      var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        setTimeout(function () { window.location.href = ${JSON.stringify(upiLink)}; }, 600);
      }
    })();
  </script>
</body>
</html>`);
};

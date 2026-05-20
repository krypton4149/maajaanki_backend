const axios = require("axios");
const fs = require("fs");
const path = require("path");
const {
  MENU_SECTIONS,
  getWelcomeBody,
  BRAND_NAME,
} = require("../data/jaankiMenu");
const { getQrLocalPath, getQrPublicUrl } = require("./upiQrService");

const GRAPH = `https://graph.facebook.com/v19.0`;
const BASE_URL = `${GRAPH}/${process.env.PHONE_NUMBER_ID}/messages`;

const WA_TEXT_MAX = 4096;

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    ...extra,
  };
}

async function uploadImageFile(filePath) {
  const abs = path.resolve(filePath);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([buf], { type: mime }), path.basename(abs));

  const res = await fetch(`${GRAPH}/${process.env.PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || "WhatsApp media upload failed");
  }
  return json.id;
}

exports.sendImageMessage = async (to, { link, mediaId, caption }) => {
  const image = mediaId ? { id: mediaId } : { link };
  if (caption) image.caption = String(caption).slice(0, 1024);

  await axios.post(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image,
    },
    { headers: authHeaders({ "Content-Type": "application/json" }) }
  );
};

/** Sends bundled UPI QR (public URL or upload from assets/upi-qr.png). */
exports.sendUpiQrImage = async (to, caption) => {
  const publicUrl = getQrPublicUrl();
  if (publicUrl) {
    await exports.sendImageMessage(to, { link: publicUrl, caption });
    return { sent: true, via: "link" };
  }

  const localPath = getQrLocalPath();
  if (!localPath) {
    return { sent: false, reason: "qr_not_configured" };
  }

  const mediaId = await uploadImageFile(localPath);
  await exports.sendImageMessage(to, { mediaId, caption });
  return { sent: true, via: "upload" };
};

/** Tappable Pay Now button (HTTPS only — works in WhatsApp). */
exports.sendPayNowButton = async (to, { amount, payUrl }) => {
  if (!payUrl) return { sent: false, reason: "no_pay_url" };

  await axios.post(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: {
          text: `Pay ₹${amount} securely via UPI. Tap the button below.`,
        },
        action: {
          name: "cta_url",
          parameters: {
            display_text: "Pay Now",
            url: payUrl,
          },
        },
      },
    },
    { headers: authHeaders({ "Content-Type": "application/json" }) }
  );
  return { sent: true };
};

/** Quantity step: type a number, then tap Add to cart. */
exports.sendQuantityPicker = async (to, { items, qty, step }) => {
  const list = Array.isArray(items) && items.length ? items : [];
  const { itemName, priceRupees } = list[0] || {};
  const price =
    priceRupees == null || Number.isNaN(Number(priceRupees))
      ? "Price on call"
      : `₹${Number(priceRupees)}`;

  const stepLine =
    step?.total > 1
      ? `*Item ${step.current} of ${step.total}*`
      : null;

  const body = [
    stepLine,
    `*${itemName}*`,
    price,
    "",
    "*Type quantity* for this item (e.g. 2)",
    "",
    step?.total > 1
      ? "Next item comes after you send quantity."
      : "Then tap *Add to cart* below.",
  ]
    .filter(Boolean)
    .join("\n");

  await axios.post(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "qty_add", title: "Add to cart" },
            },
          ],
        },
      },
    },
    { headers: authHeaders({ "Content-Type": "application/json" }) }
  );
};

exports.sendTextMessage = async (to, body) => {
  const text =
    typeof body === "string" && body.length > WA_TEXT_MAX
      ? body.slice(0, WA_TEXT_MAX - 20) + "\n…(truncated)"
      : body;

  await axios.post(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    { headers: authHeaders({ "Content-Type": "application/json" }) }
  );
};

exports.sendInteractiveListMenu = async (to, rows) => {
  const listRowsRaw =
    Array.isArray(rows) && rows.length > 0
      ? rows
      : MENU_SECTIONS.map((s) => ({
          id: s.id,
          title: s.listTitle,
          description: s.listDescription,
        }));
  const listRows = listRowsRaw.slice(0, 10);

  await axios.post(
    BASE_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: `🍽️ ${BRAND_NAME}`,
        },
        body: {
          text: getWelcomeBody(),
        },
        footer: {
          text: "Prices in ₹ · Tap a row",
        },
        action: {
          button: "Browse menu",
          sections: [
            {
              title: "Pick a section",
              rows: listRows,
            },
          ],
        },
      },
    },
    { headers: authHeaders({ "Content-Type": "application/json" }) }
  );
};

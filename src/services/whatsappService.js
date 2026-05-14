const axios = require("axios");
const {
  MENU_SECTIONS,
  getWelcomeBody,
  BRAND_NAME,
} = require("../data/jaankiMenu");

const BASE_URL = `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`;

const WA_TEXT_MAX = 4096;

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
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
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
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
};

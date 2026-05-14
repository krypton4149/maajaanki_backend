const {
  sendTextMessage,
  sendInteractiveListMenu,
} = require("../services/whatsappService");
const { MENU_SECTIONS, getSectionById } = require("../data/jaankiMenu");
const menuDbService = require("../services/menuDbService");
const orderFlow = require("../services/orderFlow");
const { createOrder, isEnabled: isOrderDbEnabled } = require("../services/orderService");
const { isUuid } = require("../utils/isUuid");

const MENU_KEYWORDS = new Set([
  "hi",
  "hello",
  "hey",
  "menu",
  "hii",
  "hlo",
  "start",
]);

function wantsMenu(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim().toLowerCase();
  if (MENU_KEYWORDS.has(t)) return true;
  if (t.startsWith("menu")) return true;
  return false;
}

function staticListRows() {
  return MENU_SECTIONS.map((s) => ({
    id: s.id,
    title: s.listTitle,
    description: s.listDescription,
  }));
}

async function resolveMenuListRows() {
  const fromDb = await menuDbService.getListRows();
  if (fromDb?.length) return fromDb;
  return staticListRows();
}

exports.handleIncomingMessage = async (message) => {
  const from = message.from;

  if (message.type === "interactive") {
    const listId = message.interactive?.list_reply?.id;
    if (listId) {
      if (isUuid(listId)) {
        const body = await menuDbService.getCategoryMenuText(listId.trim());
        if (body) {
          return sendTextMessage(from, body);
        }
        return sendTextMessage(
          from,
          "This menu section is unavailable. Type MENU to try again."
        );
      }
      const section = getSectionById(listId);
      if (section) {
        return sendTextMessage(from, section.format());
      }
    }
    return sendTextMessage(
      from,
      "Tap Browse menu or type MENU to see sections."
    );
  }

  const text = message.text?.body;

  if (wantsMenu(text)) {
    orderFlow.clearSession(from);
    const rows = await resolveMenuListRows();
    return sendInteractiveListMenu(from, rows);
  }

  const orderHandled = await orderFlow.tryHandleOrderMessage(from, text, {
    sendTextMessage,
    isOrderEnabled: isOrderDbEnabled,
    createOrder,
  });
  if (orderHandled) {
    return;
  }

  return sendTextMessage(
    from,
    [
      "Namaste — you're chatting with Jaanki Mahal.",
      "",
      "Type MENU (or Hi / Hello) to browse dishes.",
      "Type ORDER to place an order (saved to our system).",
    ].join("\n")
  );
};

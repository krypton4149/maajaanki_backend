const {
  sendTextMessage,
  sendInteractiveListMenu,
  sendUpiQrImage,
} = require("../services/whatsappService");
const { MENU_SECTIONS, getSectionById } = require("../data/jaankiMenu");
const menuDbService = require("../services/menuDbService");
const shoppingFlow = require("../services/shoppingFlow");
const { createOrder, isEnabled: isOrderDbEnabled } = require("../services/orderService");
const { isUuid } = require("../utils/isUuid");
const { getLineItems: getStaticLineItems } = require("../data/staticMenuCatalog");

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

function buildNumberedCategoryMessage(title, catalogRows) {
  const lines = catalogRows.flatMap((r, i) => {
    const p =
      r.priceRupees == null || Number.isNaN(Number(r.priceRupees))
        ? "Ask"
        : `₹${Number(r.priceRupees)}`;
    const head = `${i + 1}. ${r.name} — ${p}`;
    if (Array.isArray(r.includes) && r.includes.length) {
      const sub = r.includes.map((x) => `   • ${x}`);
      return [head, ...sub];
    }
    return [head];
  });
  return [
    "═".repeat(22),
    String(title).toUpperCase(),
    "═".repeat(22),
    "",
    ...lines,
    "",
    shoppingFlow.formatNumberedCatalogFooter(),
  ].join("\n");
}

exports.handleIncomingMessage = async (message) => {
  const from = message.from;

  if (message.type === "interactive") {
    const listId = message.interactive?.list_reply?.id;
    if (listId) {
      if (isUuid(listId)) {
        const pack = await menuDbService.getLineItemsForCategory(
          listId.trim()
        );
        if (pack?.items?.length) {
          shoppingFlow.startShopping(from, {
            categoryLabel: pack.categoryLabel,
            catalog: pack.items,
          });
          return sendTextMessage(
            from,
            buildNumberedCategoryMessage(pack.categoryLabel, pack.items)
          );
        }
        return sendTextMessage(
          from,
          "This menu section is unavailable. Type MENU to try again."
        );
      }

      const staticRows = getStaticLineItems(listId);
      if (staticRows?.length) {
        const sec = getSectionById(listId);
        const label = sec?.listTitle || listId;
        shoppingFlow.startShopping(from, {
          categoryLabel: label,
          catalog: staticRows,
        });
        return sendTextMessage(
          from,
          buildNumberedCategoryMessage(label, staticRows)
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
    shoppingFlow.onMenuOpened(from);
    const rows = await resolveMenuListRows();
    return sendInteractiveListMenu(from, rows);
  }

  const shoppingHandled = await shoppingFlow.tryHandle(from, text, {
    sendTextMessage,
    sendUpiQrImage,
    isOrderEnabled: isOrderDbEnabled,
    createOrder,
    waFrom: from,
  });
  if (shoppingHandled) {
    return;
  }

  return sendTextMessage(
    from,
    [
      "Namaste 🙏 Maa Jaanki Restaurant.",
      "",
      "Type MENU for categories · add like 2 x Veg Momos.",
      "Type CART to view bag → coupon → checkout → pay (COD / UPI).",
    ].join("\n")
  );
};

const DIVIDER = "─".repeat(22);

/**
 * WhatsApp supports *bold* but not font colors — 🟢 marks category headers.
 */
function formatCategoryHeader(title) {
  const name = String(title || "Menu")
    .trim()
    .toUpperCase();
  return [DIVIDER, `🟢 *${name}*`, DIVIDER, ""].join("\n");
}

function formatSectionFooter(hint) {
  return [DIVIDER, hint || "Reply MENU for more categories."].join("\n");
}

module.exports = {
  DIVIDER,
  formatCategoryHeader,
  formatSectionFooter,
};

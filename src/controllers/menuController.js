const menuDbService = require("../services/menuDbService");
const { MENU_SECTIONS } = require("../data/jaankiMenu");
const { getLineItems } = require("../data/staticMenuCatalog");

exports.getMenu = async (req, res) => {
  try {
    const fromDb = await menuDbService.getFullMenu();
    if (fromDb?.categories?.length) {
      return res.json({ ok: true, source: "database", ...fromDb });
    }

    const categories = MENU_SECTIONS.map((sec) => {
      const rows = getLineItems(sec.id) || [];
      return {
        id: sec.id,
        name: sec.listTitle,
        items: rows.map((r, i) => ({
          id: `${sec.id}-${i + 1}`,
          name: r.name,
          price:
            r.priceRupees != null && !Number.isNaN(Number(r.priceRupees))
              ? Number(r.priceRupees)
              : null,
          veg: true,
        })),
      };
    }).filter((c) => c.items.length > 0);

    return res.json({ ok: true, source: "static", categories });
  } catch (err) {
    console.error("GET /api/menu", err?.message);
    return res.status(500).json({ ok: false, message: "Could not load menu." });
  }
};

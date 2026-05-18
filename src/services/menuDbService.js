const { getSupabase, isSupabaseConfigured } = require("../lib/supabaseClient");

const LINE = "─".repeat(22);

function truncate(str, max) {
  if (!str || str.length <= max) return str || "";
  return str.slice(0, max - 1) + "…";
}

function formatPrice(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (Number.isInteger(num)) return `₹${num}`;
  return `₹${num.toFixed(0)}`;
}

exports.isEnabled = isSupabaseConfigured;

/**
 * Rows for WhatsApp list (max 10). Expects public.menu_categories (id, name, optional description, optional sort_order).
 */
exports.getListRows = async () => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("menu_categories")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(10);

  if (error || !data?.length) return null;

  return data.map((c) => ({
    id: String(c.id),
    title: truncate(String(c.name), 24),
  }));
};

/**
 * Plain-text menu for one category from public.menu_items.
 * Expects menu_items: category_id, name, price (numeric). Other price columns can be added later.
 */
exports.getCategoryMenuText = async (categoryId) => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: cat, error: catErr } = await supabase
    .from("menu_categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  if (catErr) return null;

  let { data: items, error: itemsErr } = await supabase
    .from("menu_items")
    .select("name, price")
    .eq("category_id", categoryId)
    .order("name", { ascending: true });

  if (itemsErr) {
    const r2 = await supabase
      .from("menu_items")
      .select("name")
      .eq("category_id", categoryId)
      .order("name", { ascending: true });
    items = r2.data;
    itemsErr = r2.error;
  }

  if (itemsErr || !items?.length) return null;

  const title = cat?.name ? `🍽️ ${String(cat.name).toUpperCase()}` : "🍽️ MENU";
  const lines = [
    `${"═".repeat(22)}`,
    title,
    `${"═".repeat(22)}`,
    "",
    ...items.map((it) => `• ${it.name} — ${formatPrice(it.price)}`),
    "",
    LINE,
    "Reply MENU for categories.",
  ];
  return lines.join("\n");
};

/**
 * @returns {Promise<{ categoryLabel: string, items: { name: string, priceRupees: number|null }[] }|null>}
 */
/**
 * Full menu for website (categories + items with ids and prices).
 */
exports.getFullMenu = async () => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: categories, error: catErr } = await supabase
    .from("menu_categories")
    .select("id, name")
    .order("name", { ascending: true });

  if (catErr || !categories?.length) return null;

  let { data: items, error: itemsErr } = await supabase
    .from("menu_items")
    .select("id, name, price, category_id, veg")
    .order("name", { ascending: true });

  if (itemsErr) {
    const r2 = await supabase
      .from("menu_items")
      .select("id, name, price, category_id")
      .order("name", { ascending: true });
    items = r2.data;
    itemsErr = r2.error;
  }

  if (itemsErr) return null;

  const byCategory = new Map();
  for (const c of categories) {
    byCategory.set(String(c.id), {
      id: String(c.id),
      name: String(c.name),
      items: [],
    });
  }

  for (const it of items || []) {
    const catId = String(it.category_id);
    const bucket = byCategory.get(catId);
    if (!bucket) continue;
    bucket.items.push({
      id: String(it.id),
      name: String(it.name),
      price: it.price != null ? Number(it.price) : null,
      veg: it.veg !== false,
    });
  }

  return {
    categories: [...byCategory.values()].filter((c) => c.items.length > 0),
  };
};

exports.getLineItemsForCategory = async (categoryId) => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: cat, error: catErr } = await supabase
    .from("menu_categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  if (catErr) return null;

  let { data: items, error: itemsErr } = await supabase
    .from("menu_items")
    .select("name, price")
    .eq("category_id", categoryId)
    .order("name", { ascending: true });

  if (itemsErr) {
    const r2 = await supabase
      .from("menu_items")
      .select("name")
      .eq("category_id", categoryId)
      .order("name", { ascending: true });
    items = r2.data;
    itemsErr = r2.error;
  }

  if (itemsErr || !items?.length) return null;

  return {
    categoryLabel: cat?.name ? String(cat.name) : "Menu",
    items: items.map((it) => ({
      name: String(it.name),
      priceRupees:
        it.price != null && it.price !== ""
          ? Number(it.price)
          : null,
    })),
  };
};

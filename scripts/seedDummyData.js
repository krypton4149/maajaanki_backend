#!/usr/bin/env node
/**
 * Seeds demo rows into public.orders + public.order_items.
 * Uses SUPABASE_URL + SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) from .env.
 *
 * Usage:
 *   npm run seed
 *   node scripts/seedDummyData.js
 *   node scripts/seedDummyData.js --wipe-demo   # removes rows where customer_name starts with "[Demo] "
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { createClient } = require("@supabase/supabase-js");

const DEMO_PREFIX = "[Demo] ";

async function getMaxOrderNum(sb) {
  const { data, error } = await sb
    .from("orders")
    .select("order_num")
    .order("order_num", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const n = row?.order_num;
  const num = typeof n === "bigint" ? Number(n) : Number(n);
  return Number.isFinite(num) ? num : 0;
}

/** Totals must match sum(qty * unit_price) for consistency with your dashboard */
const DEMO_ORDERS = [
  {
    customer_name: `${DEMO_PREFIX}Raj Kumar`,
    phone: "9810010001",
    whatsapp: "919810010001",
    address: "Station Road, Shikohabad",
    total: 765,
    items: [
      { item_name: "Veg Biryani", unit_price: 340, qty: 2, veg: true },
      { item_name: "Butter Naan", unit_price: 85, qty: 1, veg: true },
    ],
  },
  {
    customer_name: `${DEMO_PREFIX}Priya Sharma`,
    phone: "9820020002",
    whatsapp: "919820020002",
    address: "Civil Lines, Firozabad",
    total: 530,
    items: [
      { item_name: "Deluxe Thali", unit_price: 360, qty: 1, veg: true },
      { item_name: "Butter Naan", unit_price: 85, qty: 2, veg: true },
    ],
  },
  {
    customer_name: `${DEMO_PREFIX}Amit Verma`,
    phone: "9830030003",
    whatsapp: "919830030003",
    address: "Near Bus Stand, Mainpuri",
    total: 700,
    items: [
      { item_name: "Paneer Butter Masala", unit_price: 425, qty: 1, veg: true },
      { item_name: "Plain Roti", unit_price: 25, qty: 2, veg: true },
      { item_name: "Jeera Rice", unit_price: 225, qty: 1, veg: true },
    ],
  },
  {
    customer_name: `${DEMO_PREFIX}Sneha Patel`,
    phone: "9840040004",
    whatsapp: "919840040004",
    address: "Block B, Parasvnath Paradise, Agra",
    total: 914,
    items: [
      { item_name: "Veg Hakka Noodles", unit_price: 185, qty: 2, veg: true },
      { item_name: "Veg Fried Rice", unit_price: 245, qty: 1, veg: true },
      { item_name: "Spring Roll Dosa", unit_price: 299, qty: 1, veg: true },
    ],
  },
  {
    customer_name: `${DEMO_PREFIX}Vikram Singh`,
    phone: "9850050005",
    whatsapp: "919850050005",
    address: "Lord Krishna Hospital Rd, Shikohabad",
    total: 525,
    items: [
      { item_name: "Jaanki Special Tandoori Platter", unit_price: 525, qty: 1, veg: true },
    ],
  },
];

async function wipeDemo(sb) {
  const { data: orders, error: qe } = await sb
    .from("orders")
    .select("id")
    .like("customer_name", `${DEMO_PREFIX}%`);
  if (qe) throw qe;
  if (!orders?.length) return 0;
  const ids = orders.map((o) => o.id);
  await sb.from("order_items").delete().in("order_id", ids);
  const { error: de } = await sb.from("orders").delete().in("id", ids);
  if (de) throw de;
  return ids.length;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (process.argv.includes("--wipe-demo")) {
    const n = await wipeDemo(sb);
    console.log(`Removed ${n} demo order(s) and their order_items.`);
    return;
  }

  let nextNum = (await getMaxOrderNum(sb)) + 1;

  for (const demo of DEMO_ORDERS) {
    const order_num = nextNum++;
    const { data: oRows, error: oe } = await sb
      .from("orders")
      .insert({
        order_num,
        customer_name: demo.customer_name,
        phone: demo.phone,
        whatsapp: demo.whatsapp,
        address: demo.address,
        total: demo.total,
      })
      .select("id, order_num");

    if (oe) throw oe;
    const order = Array.isArray(oRows) ? oRows[0] : oRows;
    if (!order?.id) throw new Error("Insert order returned no id");

    const itemRows = demo.items.map((it) => ({
      order_id: order.id,
      menu_item_id: null,
      item_name: it.item_name,
      unit_price: it.unit_price,
      qty: it.qty,
      veg: it.veg !== false,
    }));

    const { error: ie } = await sb.from("order_items").insert(itemRows);
    if (ie) {
      await sb.from("orders").delete().eq("id", order.id);
      throw ie;
    }

    console.log(
      `OK order_num=${order.order_num} customer=${demo.customer_name} lines=${itemRows.length}`
    );
  }

  console.log(`Done. ${DEMO_ORDERS.length} demo orders inserted.`);
  console.log(`Run with --wipe-demo to remove them.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

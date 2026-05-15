#!/usr/bin/env node
/**
 * Deletes all rows from public.order_items and public.orders via the API.
 * Requires a key that is allowed to DELETE (e.g. SUPABASE_SERVICE_ROLE_KEY).
 * Publishable/anon keys often cannot delete due to RLS — then use SQL instead.
 *
 *   node scripts/wipeAllOrders.js --yes
 *   npm run wipe:orders -- --yes
 *
 * Fallback: run scripts/wipe_all_orders.sql in Supabase SQL Editor.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

async function confirm(question) {
  if (process.argv.includes("--yes")) return true;
  if (!process.stdin.isTTY) {
    console.error("Non-interactive: pass --yes to confirm wipe.");
    return false;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(question, resolve);
  });
  rl.close();
  return String(answer).trim().toLowerCase() === "yes";
}

async function countRows(sb, table) {
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function deleteChunked(sb, table) {
  const maxPasses = 200;
  for (let pass = 0; pass < maxPasses; pass++) {
    const before = await countRows(sb, table);
    if (before === 0) return true;

    const { data, error } = await sb.from(table).select("id").limit(500);
    if (error) throw error;
    if (!data?.length) return (await countRows(sb, table)) === 0;

    const ids = data.map((r) => r.id);
    const { error: delErr } = await sb.from(table).delete().in("id", ids);
    if (delErr) throw delErr;

    const after = await countRows(sb, table);
    if (after === before) {
      return false;
    }
  }
  return (await countRows(sb, table)) === 0;
}

function printSqlFallback() {
  const sqlPath = path.join(__dirname, "wipe_all_orders.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.error("\n--- API delete did not remove rows (likely RLS). Run this in SQL Editor: ---\n");
  console.error(sql);
  console.error("--- File:", sqlPath, "---\n");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or key in .env");
    process.exit(1);
  }

  const ok = await confirm(
    "This will DELETE every order and order line. Type yes to continue: "
  );
  if (!ok) {
    console.log("Aborted.");
    process.exit(0);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const itemsBefore = await countRows(sb, "order_items");
  const ordersBefore = await countRows(sb, "orders");
  console.log(`Before: order_items=${itemsBefore}, orders=${ordersBefore}`);

  const itemsOk = await deleteChunked(sb, "order_items");
  const ordersOk = await deleteChunked(sb, "orders");

  const itemsAfter = await countRows(sb, "order_items");
  const ordersAfter = await countRows(sb, "orders");
  console.log(`After:  order_items=${itemsAfter}, orders=${ordersAfter}`);

  if (itemsAfter > 0 || ordersAfter > 0 || !itemsOk || !ordersOk) {
    console.error("Wipe via API incomplete.");
    printSqlFallback();
    process.exit(1);
  }

  console.log("All orders and order_items removed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

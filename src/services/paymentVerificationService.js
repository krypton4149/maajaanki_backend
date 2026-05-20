const { getSupabase } = require("../lib/supabaseClient");

/**
 * Extract UPI UTR / transaction reference from customer message.
 */
function extractUtr(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const labeled = raw.match(
    /\b(?:utr|txn|transaction|ref|reference)[:\s#-]*([A-Za-z0-9]{8,22})\b/i
  );
  if (labeled) return labeled[1].toUpperCase();

  const twelveDigits = raw.match(/\b(\d{12})\b/);
  if (twelveDigits) return twelveDigits[1];

  const alnum = raw.match(/\b([A-Za-z0-9]{10,20})\b/);
  if (alnum && !/^(done|paid|yes|menu|cancel)$/i.test(alnum[1])) {
    return alnum[1].toUpperCase();
  }

  return null;
}

function isValidUtr(utr) {
  if (!utr || utr.length < 8 || utr.length > 22) return false;
  return /^[A-Z0-9]+$/.test(utr);
}

/** Last 4 digits of UPI txn id (WhatsApp flow). */
function extractTxnLast4(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) return raw;
  const labeled = raw.match(
    /\b(?:utr|txn|transaction|ref)[:\s#-]*(\d{4,})\b/i
  );
  if (labeled) {
    const d = labeled[1].replace(/\D/g, "");
    if (d.length >= 4) return d.slice(-4);
  }
  const four = raw.match(/\b(\d{4})\b/);
  if (four) return four[1];
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return null;
}

function isValidTxnLast4(value) {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

async function isUtrAlreadyUsed(utr) {
  const supabase = getSupabase();
  if (!supabase || !utr) return false;

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_num")
    .eq("upi_transaction_id", utr)
    .limit(1);

  if (error) {
    console.error("UTR lookup failed", error.message);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * Restaurant marks UPI payment verified (dashboard / admin API).
 */
async function verifyOrderPayment(orderId) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_verified: true,
      payment_verified_at: new Date().toISOString(),
      payment_status: "paid",
    })
    .eq("id", orderId)
    .select("id, order_num, whatsapp, phone, customer_name, total, coupon_code, discount_amount")
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = {
  extractUtr,
  isValidUtr,
  extractTxnLast4,
  isValidTxnLast4,
  isUtrAlreadyUsed,
  verifyOrderPayment,
};

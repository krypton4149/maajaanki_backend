const { getSupabase } = require("../lib/supabaseClient");

const memory = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

function normalizeId(whatsappId) {
  const digits = String(whatsappId || "").replace(/\D/g, "");
  if (!digits) return String(whatsappId || "");
  // Canonical key: 91 + last 10 digits (avoids 9198… vs 98… mismatches between requests).
  if (digits.length >= 10) {
    return `91${digits.slice(-10)}`;
  }
  return digits;
}

function legacyNormalizeId(whatsappId) {
  return String(whatsappId || "").replace(/\D/g, "").slice(-15) || String(whatsappId || "");
}

async function loadFromSupabase(supabase, id) {
  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select("state, updated_at")
    .eq("whatsapp_id", id)
    .maybeSingle();

  if (error) {
    console.error("whatsapp_session get", error.message);
    return null;
  }
  return data;
}

/**
 * Load session: memory first, then Supabase (survives Vercel cold starts).
 */
async function get(whatsappId) {
  const id = normalizeId(whatsappId);
  const cached = memory.get(id);
  if (cached) return { ...cached };

  const supabase = getSupabase();
  if (!supabase) return null;

  let data = await loadFromSupabase(supabase, id);

  let migratedFromLegacy = false;
  if (!data?.state) {
    const legacyId = legacyNormalizeId(whatsappId);
    if (legacyId && legacyId !== id) {
      data = await loadFromSupabase(supabase, legacyId);
      if (data?.state && typeof data.state === "object") {
        migratedFromLegacy = true;
        await supabase.from("whatsapp_sessions").delete().eq("whatsapp_id", legacyId);
      }
    }
  }

  if (!data?.state || typeof data.state !== "object") return null;

  const updated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - updated > TTL_MS) {
    await remove(whatsappId);
    return null;
  }

  const state = { ...data.state };
  memory.set(id, state);
  if (migratedFromLegacy) {
    await set(whatsappId, state);
  }
  return state;
}

async function set(whatsappId, state) {
  const id = normalizeId(whatsappId);
  const snapshot = JSON.parse(JSON.stringify(state));
  memory.set(id, snapshot);

  const supabase = getSupabase();
  if (!supabase) {
    console.warn("whatsapp_session set: Supabase not configured — session is in-memory only");
    return;
  }

  const { error } = await supabase.from("whatsapp_sessions").upsert(
    {
      whatsapp_id: id,
      state: snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "whatsapp_id" }
  );

  if (error) console.error("whatsapp_session set", error.message);
}

async function remove(whatsappId) {
  const id = normalizeId(whatsappId);
  memory.delete(id);

  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from("whatsapp_sessions")
    .delete()
    .eq("whatsapp_id", id);

  if (error) console.error("whatsapp_session remove", error.message);
}

async function has(whatsappId) {
  const s = await get(whatsappId);
  return !!s;
}

module.exports = { get, set, remove, has, normalizeId };

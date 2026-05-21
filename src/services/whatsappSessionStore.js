const { getSupabase } = require("../lib/supabaseClient");

const memory = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

function normalizeId(whatsappId) {
  return String(whatsappId || "").replace(/\D/g, "").slice(-15) || String(whatsappId || "");
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

  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select("state, updated_at")
    .eq("whatsapp_id", id)
    .maybeSingle();

  if (error) {
    console.error("whatsapp_session get", error.message);
    return null;
  }

  if (!data?.state || typeof data.state !== "object") return null;

  const updated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - updated > TTL_MS) {
    await remove(whatsappId);
    return null;
  }

  const state = { ...data.state };
  memory.set(id, state);
  return state;
}

async function set(whatsappId, state) {
  const id = normalizeId(whatsappId);
  memory.set(id, state);

  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("whatsapp_sessions").upsert(
    {
      whatsapp_id: id,
      state,
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

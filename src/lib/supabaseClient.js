const { createClient } = require("@supabase/supabase-js");

let client;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY
  );
}

/**
 * Server-side Supabase client. Prefer SUPABASE_SERVICE_ROLE_KEY so inserts
 * work regardless of RLS on orders/menu tables.
 */
function getSupabase() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function isSupabaseConfigured() {
  return !!getSupabaseUrl() && !!getSupabaseKey();
}

module.exports = { getSupabase, isSupabaseConfigured };

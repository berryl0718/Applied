// Connects to Supabase (our login system and database).
// The library is loaded from the jsDelivr CDN, so there is nothing to install.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

/** True once js/config.js has real values in it. */
export const isConfigured = /^https:\/\/.+/.test(SUPABASE_URL) && !SUPABASE_KEY.startsWith("PASTE-");

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

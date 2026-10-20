// Records every API request the page makes (to Supabase, the AI function or
// our own site): method, path, status and how long it took. Used by the Admin
// Control Centre's live API monitor. Only the address PATH is kept: no keys,
// tokens or data.
//
// It must be imported FIRST, before anything that talks to Supabase, so the
// Supabase library uses this recording version of fetch().
const MAX_CALLS = 200;
export const apiCalls = [];
const listeners = new Set();

/** Call fn(entry) after every request. */
export function onApiCall(fn) {
  listeners.add(fn);
}

/** "auth", "database", "rpc", "ai function", "storage" or "website". */
export function apiKind(entry) {
  if (entry.path.startsWith("/auth/")) return "auth";
  if (entry.path.startsWith("/rest/v1/rpc/")) return "rpc";
  if (entry.path.startsWith("/rest/")) return "database";
  if (entry.path.startsWith("/functions/")) return "ai function";
  if (entry.path.startsWith("/storage/")) return "storage";
  return "website";
}

const originalFetch = window.fetch.bind(window);

window.fetch = async function recordedFetch(input, init = {}) {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, window.location.href);
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const entry = { at: new Date(), method, host: url.host, path: url.pathname, status: 0, ms: 0, ok: false };
  const started = performance.now();
  try {
    const response = await originalFetch(input, init);
    entry.status = response.status;
    entry.ok = response.ok;
    return response;
  } catch (error) {
    entry.error = String(error?.message || error);
    throw error;
  } finally {
    entry.ms = Math.round(performance.now() - started);
    apiCalls.unshift(entry);
    if (apiCalls.length > MAX_CALLS) apiCalls.pop();
    listeners.forEach((fn) => {
      try { fn(entry); } catch { /* a broken listener must not break the request */ }
    });
  }
};

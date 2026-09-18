import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const configuredSecretKey = process.env.SUPABASE_SECRET_KEY;
const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// A publishable key must never be treated as a server key, even when it was
// accidentally pasted into SUPABASE_SECRET_KEY.
const serverKey = configuredSecretKey?.startsWith("sb_secret_")
  ? configuredSecretKey
  : legacyServiceRoleKey?.startsWith("eyJ")
    ? legacyServiceRoleKey
    : undefined;

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Creates a short-lived client for password sign-in and token verification. */
export function createSupabaseAuthClient(accessToken?: string) {
  return url && publishableKey
    ? createClient(url, publishableKey, {
        ...options,
        global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined
      })
    : null;
}

/** True only when both a browser-safe key and a server-only key are available. */
export const hasSupabaseBackend = Boolean(url && publishableKey && serverKey);

/** Server-only client. Never expose SUPABASE_SECRET_KEY to the browser. */
export const supabaseAdmin = url && serverKey ? createClient(url, serverKey, options) : null;

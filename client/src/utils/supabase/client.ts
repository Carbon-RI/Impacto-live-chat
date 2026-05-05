import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient<Database>(url, anonKey);
}

/**
 * Browser-only Supabase client (use only in Client Components).
 * Anonymous sign-in (signInAnonymously) requires the Anonymous provider to be
 * enabled under Dashboard → Authentication → Providers.
 */
export const supabase = createSupabaseBrowserClient();

import { createClient } from '@supabase/supabase-js';

/**
 * The previous version hardcoded a *different* Supabase project as a fallback
 * for both the URL and the anon key. If the env var were ever missing, the
 * frontend would silently retarget a database that the Python worker does not
 * write to — the app would look empty and no error would ever surface.
 *
 * There is now no fallback: a missing configuration fails loudly at startup.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in dashboard/.env.local before starting the app. ' +
      'Refusing to fall back to a hardcoded project, because that would point the ' +
      'frontend at a different database than the backend uses.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

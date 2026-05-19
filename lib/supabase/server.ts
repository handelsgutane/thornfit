/**
 * Supabase server-side clients.
 *
 * Two flavours:
 * - `createServerClient()` — user-scoped, reads auth cookie. Use in RSC, route
 *   handlers, and server actions where you need the current user.
 * - `createServiceRoleClient()` — bypasses RLS. Use ONLY for sync jobs,
 *   webhook handlers, and other trusted server paths. Never expose to clients.
 *
 * See docs/integrations.md > Supabase.
 */

// Build-time tripwire: if a client component ever imports this module (directly
// or transitively), Next.js throws a clear error during compile. Combined with
// the runtime check in `lib/env.ts`, this makes it effectively impossible to
// leak the service-role key into the browser bundle.
import 'server-only';

import { createServerClient as supabaseCreateServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { clientEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/types/supabase';

/**
 * Server client bound to the current request's auth cookie.
 * Call inside RSC, route handlers, or server actions.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return supabaseCreateServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Setting cookies from a Server Component throws — swallow it.
            // Middleware will refresh the session cookie on the next request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. Only use in trusted server paths:
 * webhook handlers, cron jobs, admin endpoints. Never expose to clients.
 */
export function createServiceRoleClient() {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

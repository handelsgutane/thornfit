/**
 * Supabase browser client.
 *
 * Use sparingly — most catalog reads should happen server-side. This client is
 * for interactive flows (auth UI, realtime subscriptions if we add them).
 *
 * See docs/integrations.md > Supabase.
 */

import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '@/lib/env';
import type { Database } from '@/types/supabase';

export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

import { createClient } from '@supabase/supabase-js';

// Admin client using service_role key — bypasses RLS.
// Only use server-side (API routes, server actions, cron jobs).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

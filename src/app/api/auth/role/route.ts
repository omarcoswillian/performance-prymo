import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth-role';

/**
 * GET /api/auth/role
 * Returns the current user's role (admin or client).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(user.id);

    return NextResponse.json({ role, user_id: user.id, email: user.email });
  } catch (err) {
    console.error('[Auth Role]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

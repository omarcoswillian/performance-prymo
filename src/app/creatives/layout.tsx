import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AccountProvider } from '@/components/creatives/account-context';

export default async function CreativesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AccountProvider>
        {children}
      </AccountProvider>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AccountProvider } from '@/components/creatives/account-context';
import { Sidebar } from '@/components/creatives/sidebar';
import { TopHeader } from '@/components/creatives/top-header';

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
    <AccountProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopHeader />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </AccountProvider>
  );
}

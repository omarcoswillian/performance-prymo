'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAccount } from '@/components/creatives/account-context';
import {
  LayoutDashboard,
  Crosshair,
  Search,
  BarChart3,
  Globe,
  GitCompare,
  Sparkles,
  FileText,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Bell,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'mc_sidebar_collapsed';

const navItems = [
  { href: '/creatives/overview', label: 'Visao Geral', icon: LayoutDashboard },
  { href: '/creatives', label: 'Comando', icon: Crosshair },
  { href: '/creatives/diagnostico', label: 'Diagnostico', icon: Search },
  { href: '/creatives/comparar', label: 'Comparar', icon: BarChart3 },
  { href: '/creatives/alinhamento', label: 'Alinhamento', icon: GitCompare },
  { href: '/creatives/paginas', label: 'Paginas', icon: Globe },
  { href: '/creatives/destaques', label: 'Insights', icon: Sparkles },
  { href: '/creatives/relatorios', label: 'Relatorios', icon: FileText },
  { href: '/creatives/alertas', label: 'Alertas', icon: Bell },
];

const bottomItems = [
  { href: '/creatives/configuracoes', label: 'Configuracoes', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();
  const { selectedAccount } = useAccount();
  const [collapsed, setCollapsed] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {}
  }, []);

  // Fetch unresolved alert count
  const fetchAlertCount = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`/api/meta/alerts?ad_account_id=${selectedAccount}&status=active`);
      if (res.ok) {
        const data = await res.json();
        setAlertCount(data.alerts?.length || 0);
      }
    } catch {}
  }, [selectedAccount]);

  useEffect(() => {
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchAlertCount]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  };

  const isActive = (href: string) => {
    if (href === '/creatives') return pathname === '/creatives';
    return pathname.startsWith(href);
  };

  const renderItem = (item: (typeof navItems)[number]) => {
    const active = isActive(item.href);
    const isAlerts = item.href === '/creatives/alertas';

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors relative',
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {isAlerts && alertCount > 0 && (
          <span className={cn(
            'flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold',
            collapsed ? 'absolute -top-0.5 -right-0.5 h-4 w-4' : 'ml-auto h-4 min-w-[16px] px-1'
          )}>
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Image
          src={mounted && theme === 'dark' ? '/logo-icon-white.svg' : '/logo-icon-black.svg'}
          alt="Monitor Criativo"
          width={28}
          height={28}
          className="shrink-0 rounded-md"
        />
        {!collapsed && (
          <span className="text-sm font-semibold truncate">Monitor Criativo</span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map(renderItem)}
      </nav>

      {/* Bottom nav */}
      <div className="space-y-1 px-2 pb-2">
        {bottomItems.map(renderItem)}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sair' : undefined}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Sair</span>}
        </button>
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span className="truncate">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

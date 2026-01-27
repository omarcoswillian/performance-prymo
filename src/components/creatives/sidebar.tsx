'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Crosshair,
  Search,
  Globe,
  GitCompare,
  Sparkles,
  FileText,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

const STORAGE_KEY = 'mc_sidebar_collapsed';

const navItems = [
  { href: '/creatives', label: 'Comando', icon: Crosshair },
  { href: '/creatives/diagnostico', label: 'Diagnostico', icon: Search },
  { href: '/creatives/alinhamento', label: 'Alinhamento', icon: GitCompare },
  { href: '/creatives/paginas', label: 'Paginas', icon: Globe },
  { href: '/creatives/destaques', label: 'Insights', icon: Sparkles },
  { href: '/creatives/relatorios', label: 'Relatorios', icon: FileText },
];

const bottomItems = [
  { href: '/creatives/configuracoes', label: 'Configuracoes', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {}
  }, []);

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
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
          MC
        </div>
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

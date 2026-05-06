'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Truck, List, Star, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/lib/types';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Truck },
  { href: '/listings', label: 'Listings', icon: List },
  { href: '/favorites', label: 'Favorites', icon: Star },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function NavSidebar() {
  const pathname = usePathname();
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then(r => r.json()),
  });

  const newCount = stats?.newCount ?? 0;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-16 md:fixed md:inset-y-0 md:left-0 md:z-50 md:border-r md:border-border md:bg-sidebar">
        <div className="flex h-14 items-center justify-center border-b border-border">
          <Truck className="size-6 text-sidebar-primary" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2 pt-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <div className="relative">
                  <Icon className="size-5" />
                  {label === 'Dashboard' && newCount > 0 && (
                    <Badge className="absolute -right-2 -top-2 h-4 min-w-4 px-1 text-[10px]">
                      {newCount}
                    </Badge>
                  )}
                </div>
                <span className="leading-none">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-background md:hidden">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <Icon className="size-5" />
                {label === 'Dashboard' && newCount > 0 && (
                  <Badge className="absolute -right-2 -top-2 h-4 min-w-4 px-1 text-[10px]">
                    {newCount}
                  </Badge>
                )}
              </div>
              <span className="sr-only">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

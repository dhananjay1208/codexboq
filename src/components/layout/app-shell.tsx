"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  FileSpreadsheet,
  FileText,
  Home,
  LogOut,
  Menu,
  PackageCheck,
  PackageMinus,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  Warehouse,
  X,
} from "lucide-react";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AiActivityChip } from "@/components/ai-activity-chip";

const navItems = [
  { label: "Dashboard", href: "/", Icon: Home },
  { label: "Sites", href: "/sites", Icon: Building2 },
  { label: "BOQ", href: "/boq", Icon: FileSpreadsheet },
  { label: "GRN", href: "/grn", Icon: PackageCheck },
  { label: "Consumption", href: "/consumption", Icon: PackageMinus },
  { label: "Inventory", href: "/inventory", Icon: Warehouse },
  { label: "Compliance", href: "/compliance", Icon: ShieldCheck },
  { label: "MIR Reports", href: "/reports/mir", Icon: FileText },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

function SidebarContent({
  collapsed,
  pathname,
  onNavigate,
  onClose,
  onLogout,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
  onClose?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "mb-8 flex items-center gap-3 px-2",
          collapsed && "justify-center px-0"
        )}
      >
        <Link
          href="/"
          aria-label="Dashboard"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <Sparkles className="size-5 text-[var(--accent)]" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                BOQ.ai
              </p>
              <p className="text-xs text-slate-500">Agent command</p>
            </div>
          ) : null}
        </Link>

        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto size-9 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white md:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </Button>
        ) : null}
      </div>

      <nav className="grid gap-2">
        {navItems.map(({ label, href, Icon }) => {
          const active = isActivePath(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-label={label}
              onClick={onNavigate}
              className={cn(
                "relative flex h-11 items-center rounded-xl text-sm text-slate-400 transition hover:bg-white/10 hover:text-white",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active &&
                  "bg-white/10 text-white ring-1 ring-[var(--brand)]/60 shadow-[0_0_24px_rgba(59,130,246,0.25)]"
              )}
            >
              {active ? (
                <span
                  className={cn(
                    "absolute size-2 rounded-full bg-[var(--accent)] shadow-[0_0_16px_rgba(217,70,239,0.9)]",
                    collapsed ? "right-2 top-2" : "right-3"
                  )}
                />
              ) : null}
              <Icon className="size-4 shrink-0" />
              {!collapsed ? <span className="truncate">{label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "mt-auto rounded-2xl border border-white/10 bg-black/20 p-3",
          collapsed && "p-2"
        )}
      >
        {!collapsed ? (
          <>
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="mb-3 text-sm font-medium text-white">demo</p>
          </>
        ) : null}
        <Button
          variant="outline"
          title={collapsed ? "Logout" : undefined}
          aria-label="Logout"
          className={cn(
            "h-9 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
            collapsed ? "w-full justify-center px-0" : "w-full justify-start gap-2"
          )}
          onClick={onLogout}
        >
          <LogOut className="size-4" />
          {!collapsed ? "Logout" : null}
        </Button>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent text-slate-100">
      <AiActivityChip />

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#080a10]/90 px-4 backdrop-blur-xl md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-xl text-slate-200 hover:bg-white/10 hover:text-white"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </Button>
        <Link href="/" className="flex items-center gap-2" aria-label="Dashboard">
          <div className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <Sparkles className="size-4 text-[var(--accent)]" />
          </div>
          <span className="bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] bg-clip-text text-xl font-semibold tracking-tight text-transparent">
            BOQ.ai
          </span>
        </Link>
        <div className="size-10" aria-hidden="true" />
      </header>

      {mobileNavOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
            aria-label="Close navigation overlay"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-40 flex w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-white/10 bg-[#080a10]/95 px-4 py-5 shadow-[0_0_40px_rgba(59,130,246,0.18)] backdrop-blur-xl md:hidden">
            <SidebarContent
              collapsed={false}
              pathname={pathname}
              onNavigate={() => setMobileNavOpen(false)}
              onClose={() => setMobileNavOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </>
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-white/10 bg-white/5 px-4 py-5 shadow-[0_0_40px_rgba(59,130,246,0.12)] backdrop-blur-xl transition-[width] duration-200 md:flex",
          sidebarCollapsed ? "w-20" : "w-[240px]"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute -right-4 top-5 size-8 rounded-full border border-white/10 bg-[#0b0d14] text-slate-300 shadow-lg hover:bg-white/10 hover:text-white"
          onClick={() => setSidebarCollapsed((value) => !value)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
        <SidebarContent
          collapsed={sidebarCollapsed}
          pathname={pathname}
          onLogout={handleLogout}
        />
      </aside>

      <main
        className={cn(
          "min-h-screen min-w-0 transition-[padding] duration-200 md:pl-[240px]",
          sidebarCollapsed && "md:pl-20"
        )}
      >
        <div
          key={pathname}
          className="route-fade mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 md:px-8 md:py-8"
        >
          {children}
        </div>
      </main>
    </div>
  );
}

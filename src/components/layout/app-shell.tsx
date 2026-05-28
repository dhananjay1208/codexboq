"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  FileSpreadsheet,
  FileText,
  Home,
  LogOut,
  PackageCheck,
  PackageMinus,
  ShieldCheck,
  Sparkles,
  Warehouse,
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <AiActivityChip />
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[240px] flex-col border-r border-white/10 bg-white/5 px-4 py-5 shadow-[0_0_40px_rgba(59,130,246,0.12)] backdrop-blur-xl">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <Sparkles className="size-5 text-[var(--accent)]" />
          </div>
          <div>
            <p className="bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
              BOQ.ai
            </p>
            <p className="text-xs text-slate-500">Agent command</p>
          </div>
        </Link>

        <nav className="grid gap-2">
          {navItems.map(({ label, href, Icon }) => {
            const active = isActivePath(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white",
                  active &&
                    "bg-white/10 text-white ring-1 ring-[var(--brand)]/60 shadow-[0_0_24px_rgba(59,130,246,0.25)]"
                )}
              >
                {active ? (
                  <span className="absolute right-3 size-2 rounded-full bg-[var(--accent)] shadow-[0_0_16px_rgba(217,70,239,0.9)]" />
                ) : null}
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="mb-3 text-sm font-medium text-white">demo</p>
          <Button
            variant="outline"
            className="h-9 w-full justify-start gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </aside>

      <main className="min-h-screen pl-[240px]">
        <div key={pathname} className="route-fade mx-auto w-full max-w-7xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

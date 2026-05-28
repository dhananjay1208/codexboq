"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [authState, setAuthState] = useState<"checking" | "authed">(
    "checking"
  );

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (!isMounted || isLogin) {
        return;
      }

      const session = getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      setAuthState("authed");
    });

    return () => {
      isMounted = false;
    };
  }, [isLogin, router]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (authState !== "authed") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="h-10 w-10 rounded-full border border-white/15 border-t-[var(--brand)] animate-spin" />
      </main>
    );
  }

  return <AppShell>{children}</AppShell>;
}

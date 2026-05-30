"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, User } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getSession()) {
      router.replace("/guide");
    }
  }, [router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const session = login(username.trim(), password);

    if (!session) {
      setIsSubmitting(false);
      toast.error("Use demo / demo to enter BOQ.ai.");
      return;
    }

    toast.success("Welcome to BOQ.ai");
    router.replace("/guide");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <GlassCard className="w-full max-w-md p-6">
        <div className="mb-8 text-center">
          <h1 className="bg-gradient-to-r from-[var(--brand)] to-[var(--accent)] bg-clip-text text-5xl font-semibold tracking-tight text-transparent">
            BOQ.ai
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Demo command center for agentic BOQ management
          </p>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="username" className="text-slate-200">
              Username
            </Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 border-white/10 bg-white/5 pl-10 text-white"
                autoComplete="username"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password" className="text-slate-200">
              Password
            </Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 border-white/10 bg-white/5 pl-10 text-white"
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="h-11 bg-[var(--brand)] text-white hover:bg-blue-500"
            disabled={isSubmitting}
          >
            Enter demo guide
          </Button>
        </form>
      </GlassCard>
    </main>
  );
}

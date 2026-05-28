import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  ctaHref = "/grn",
  ctaLabel = "Try AI Invoice Extraction",
}: {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <GlassCard className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 shadow-[0_0_28px_rgba(217,70,239,0.24)]">
        <Sparkles className="size-6 text-[var(--accent)]" />
      </div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      <Link
        href={ctaHref}
        className={cn(
          buttonVariants(),
          "mt-5 h-10 gap-2 bg-[var(--brand)] text-white hover:bg-blue-500"
        )}
      >
        {ctaLabel}
        <ArrowRight className="size-4" />
      </Link>
    </GlassCard>
  );
}

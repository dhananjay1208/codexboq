import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GlassCardProps = React.ComponentProps<typeof Card>;

export function GlassCard({ className, ...props }: GlassCardProps) {
  return (
    <Card
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_40px_rgba(59,130,246,0.15)] backdrop-blur-xl",
        className
      )}
      {...props}
    />
  );
}

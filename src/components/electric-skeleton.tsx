import { cn } from "@/lib/utils";

export function ElectricSkeleton({
  className,
  rows = 3,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div className={cn("grid gap-3", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="electric-shimmer rounded-2xl border border-white/10 bg-white/[0.04] p-4"
        >
          <div className="h-4 w-2/5 rounded-full bg-blue-300/15" />
          <div className="mt-4 h-3 w-4/5 rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-3/5 rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export function ElectricTableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <tbody className="divide-y divide-white/10">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="electric-shimmer">
          {Array.from({ length: columns }).map((__, cellIndex) => (
            <td key={cellIndex} className="px-4 py-4">
              <div className="h-3 rounded-full bg-blue-300/10" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

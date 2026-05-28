"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { ElectricSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Site = {
  id: string;
  name: string;
};

type PackageRow = {
  id: string;
  name: string | null;
  created_at: string | null;
};

type HeadlineRow = {
  id: string;
  package_id: string;
  sl_no: string | null;
  title: string | null;
  sort_order: number | null;
};

type LineItemRow = {
  id: string;
  headline_id: string;
  sl_no: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
};

function formatNumber(value: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

export default function SiteBoqPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [headlines, setHeadlines] = useState<HeadlineRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [activePackageId, setActivePackageId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const activePackage = useMemo(
    () => packages.find((pkg) => pkg.id === activePackageId) ?? packages[0],
    [activePackageId, packages]
  );

  const visibleHeadlines = useMemo(() => {
    if (!activePackage) {
      return [];
    }

    return headlines
      .filter((headline) => headline.package_id === activePackage.id)
      .map((headline) => ({
        ...headline,
        lineItems: lineItems.filter(
          (lineItem) => lineItem.headline_id === headline.id
        ),
      }));
  }, [activePackage, headlines, lineItems]);

  useEffect(() => {
    async function loadBoq() {
      setIsLoading(true);

      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .select("id,name")
        .eq("id", params.siteId)
        .maybeSingle();

      if (siteError) {
        toast.error(`Could not load site: ${siteError.message}`);
        setIsLoading(false);
        return;
      }

      const { data: packageData, error: packageError } = await supabase
        .from("packages")
        .select("id,name,created_at")
        .eq("site_id", params.siteId)
        .order("created_at", { ascending: false });

      if (packageError) {
        toast.error(`Could not load BOQ packages: ${packageError.message}`);
        setIsLoading(false);
        return;
      }

      const nextPackages = packageData ?? [];
      const packageIds = nextPackages.map((pkg) => pkg.id);
      let nextHeadlines: HeadlineRow[] = [];
      let nextLineItems: LineItemRow[] = [];

      if (packageIds.length > 0) {
        const { data: headlineData, error: headlineError } = await supabase
          .from("boq_headlines")
          .select("id,package_id,sl_no,title,sort_order")
          .in("package_id", packageIds)
          .order("sort_order", { ascending: true });

        if (headlineError) {
          toast.error(`Could not load BOQ headlines: ${headlineError.message}`);
          setIsLoading(false);
          return;
        }

        nextHeadlines = headlineData ?? [];
        const headlineIds = nextHeadlines.map((headline) => headline.id);

        if (headlineIds.length > 0) {
          const { data: lineItemData, error: lineItemError } = await supabase
            .from("boq_line_items")
            .select("id,headline_id,sl_no,description,unit,quantity,rate,amount")
            .in("headline_id", headlineIds)
            .order("sl_no", { ascending: true });

          if (lineItemError) {
            toast.error(
              `Could not load BOQ line items: ${lineItemError.message}`
            );
            setIsLoading(false);
            return;
          }

          nextLineItems = lineItemData ?? [];
        }
      }

      setSite(siteData);
      setPackages(nextPackages);
      setHeadlines(nextHeadlines);
      setLineItems(nextLineItems);
      setActivePackageId((current) => current || nextPackages[0]?.id || "");
      setIsLoading(false);
    }

    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        loadBoq();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [params.siteId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button
            variant="outline"
            className="mb-4 gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            onClick={() => router.push("/boq")}
          >
            <ArrowLeft className="size-4" />
            Back to import
          </Button>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <FileSpreadsheet className="size-4 text-[var(--accent)]" />
            Imported BOQ
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            {site?.name ?? "BOQ"}
          </h1>
        </div>
        <Badge
          variant="outline"
          className="border-blue-400/20 bg-blue-400/10 text-blue-200"
        >
          {packages.length} package{packages.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <GlassCard className="p-5">
        {isLoading ? (
          <ElectricSkeleton rows={4} />
        ) : packages.length === 0 ? (
          <EmptyState
            title="No imported BOQ yet"
            description="Import a workbook from the BOQ Normalizer page, then return here to inspect package rows."
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  className={cn(
                    "rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white",
                    activePackage?.id === pkg.id &&
                      "border-blue-400/40 bg-blue-500/15 text-white shadow-[0_0_22px_rgba(59,130,246,0.22)]"
                  )}
                  onClick={() => setActivePackageId(pkg.id)}
                >
                  {pkg.name || "Untitled package"}
                </button>
              ))}
            </div>

            <div className="grid gap-5">
              {visibleHeadlines.map((headline) => (
                <div
                  key={headline.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="font-medium text-white">
                      {headline.sl_no ? `${headline.sl_no}. ` : ""}
                      {headline.title || "Untitled headline"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {headline.lineItems.length} line item
                      {headline.lineItems.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-3 font-medium">S.No</th>
                          <th className="px-4 py-3 font-medium">
                            Description
                          </th>
                          <th className="px-4 py-3 font-medium">Unit</th>
                          <th className="px-4 py-3 text-right font-medium">
                            Qty
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Rate
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {headline.lineItems.map((lineItem) => (
                          <tr key={lineItem.id} className="text-slate-300">
                            <td className="px-4 py-3 text-slate-400">
                              {lineItem.sl_no || "-"}
                            </td>
                            <td className="px-4 py-3">
                              {lineItem.description || "-"}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {lineItem.unit || "-"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatNumber(lineItem.quantity)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatNumber(lineItem.rate)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatNumber(lineItem.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

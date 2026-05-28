"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  PackageSearch,
  IndianRupee,
  Search,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { ElectricTableSkeleton } from "@/components/electric-skeleton";
import { EmptyState } from "@/components/empty-state";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type SiteOption = {
  id: string;
  name: string;
};

type InvoiceRow = {
  id: string;
  grn_date: string | null;
};

type GrnLineRow = {
  material_id: string | null;
  material_name: string | null;
  quantity: number | string | null;
  unit: string | null;
  grn_invoice_id: string;
  amount_with_gst: number | string | null;
};

type ConsumptionRow = {
  material_id: string | null;
  material_name: string | null;
  quantity: number | string | null;
  unit: string | null;
  consumption_date: string | null;
};

type MaterialCategory = {
  id: string;
  category: string | null;
};

type InventoryRow = {
  material_id: string;
  material_name: string;
  category: string;
  unit: string;
  receivedQty: number;
  consumedQty: number;
  availableQty: number;
  receivedValue: number;
  availableValue: number;
  receiptCount: number;
  lastReceipt: string | null;
  lastConsumption: string | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return parsed && Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function newerDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function displayDate(date: string | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function materialKey(row: {
  material_id: string | null;
  material_name: string | null;
}) {
  return row.material_id || `unmapped:${row.material_name || "Unknown material"}`;
}

export default function InventoryPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const loadInventory = useCallback(async () => {
    setIsLoading(true);

    const { data: siteRows, error: siteError } = await supabase
      .from("sites")
      .select("id,name")
      .order("created_at", { ascending: false });

    if (siteError) {
      toast.error(siteError.message);
      setSites([]);
      setRows([]);
      setIsLoading(false);
      return;
    }

    setSites(siteRows ?? []);
    const siteId = selectedSiteId || siteRows?.[0]?.id || "";
    if (!selectedSiteId && siteId) {
      setSelectedSiteId(siteId);
    }

    if (!siteId) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    const { data: invoices, error: invoiceError } = await supabase
      .from("grn_invoices")
      .select("id,grn_date")
      .eq("site_id", siteId);

    if (invoiceError) {
      toast.error(invoiceError.message);
      setRows([]);
      setIsLoading(false);
      return;
    }

    const invoiceRows = (invoices ?? []) as InvoiceRow[];
    const invoiceIds = invoiceRows.map((invoice) => invoice.id);
    const invoiceDateMap = new Map(
      invoiceRows.map((invoice) => [invoice.id, invoice.grn_date])
    );

    let grnLines: GrnLineRow[] = [];
    if (invoiceIds.length > 0) {
      const { data, error } = await supabase
        .from("grn_line_items")
        .select("material_id,material_name,quantity,unit,grn_invoice_id,amount_with_gst")
        .in("grn_invoice_id", invoiceIds);

      if (error) {
        toast.error(error.message);
      } else {
        grnLines = (data ?? []) as GrnLineRow[];
      }
    }

    const { data: consumptionData, error: consumptionError } = await supabase
      .from("material_consumption")
      .select("material_id,material_name,quantity,unit,consumption_date")
      .eq("site_id", siteId);

    if (consumptionError) {
      toast.error(consumptionError.message);
    }

    const consumptionRows = (consumptionData ?? []) as ConsumptionRow[];
    const materialIds = Array.from(
      new Set(
        [...grnLines, ...consumptionRows]
          .map((row) => row.material_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const categories = new Map<string, string>();
    if (materialIds.length > 0) {
      const { data, error } = await supabase
        .from("master_materials")
        .select("id,category")
        .in("id", materialIds);

      if (error) {
        toast.error(error.message);
      } else {
        for (const material of (data ?? []) as MaterialCategory[]) {
          categories.set(material.id, material.category || "Uncategorized");
        }
      }
    }

    const aggregated = new Map<string, InventoryRow>();

    for (const line of grnLines) {
      const key = materialKey(line);
      const existing =
        aggregated.get(key) ??
        {
          material_id: key,
          material_name: line.material_name || "Unmapped material",
          category: line.material_id
            ? categories.get(line.material_id) || "Uncategorized"
            : "Unmapped",
          unit: line.unit || "-",
          receivedQty: 0,
          consumedQty: 0,
          availableQty: 0,
          receivedValue: 0,
          availableValue: 0,
          receiptCount: 0,
          lastReceipt: null,
          lastConsumption: null,
        };

      existing.receivedQty += asNumber(line.quantity);
      existing.receivedValue += asNumber(line.amount_with_gst);
      existing.receiptCount += 1;
      existing.lastReceipt = newerDate(existing.lastReceipt, invoiceDateMap.get(line.grn_invoice_id) ?? null);
      aggregated.set(key, existing);
    }

    for (const consumption of consumptionRows) {
      const key = materialKey(consumption);
      const existing =
        aggregated.get(key) ??
        {
          material_id: key,
          material_name: consumption.material_name || "Unmapped material",
          category: consumption.material_id
            ? categories.get(consumption.material_id) || "Uncategorized"
            : "Unmapped",
          unit: consumption.unit || "-",
          receivedQty: 0,
          consumedQty: 0,
          availableQty: 0,
          receivedValue: 0,
          availableValue: 0,
          receiptCount: 0,
          lastReceipt: null,
          lastConsumption: null,
        };

      existing.consumedQty += asNumber(consumption.quantity);
      existing.lastConsumption = newerDate(existing.lastConsumption, consumption.consumption_date);
      aggregated.set(key, existing);
    }

    const nextRows = Array.from(aggregated.values()).map((row) => ({
      ...row,
      availableQty: row.receivedQty - row.consumedQty,
      availableValue:
        row.receivedQty > 0
          ? Math.max(0, row.receivedValue * ((row.receivedQty - row.consumedQty) / row.receivedQty))
          : 0,
    }));

    nextRows.sort((a, b) =>
      a.category.localeCompare(b.category) || a.material_name.localeCompare(b.material_name)
    );
    setRows(nextRows);
    setExpandedCategories(new Set(Array.from(new Set(nextRows.map((row) => row.category)))));
    setIsLoading(false);
  }, [selectedSiteId]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) loadInventory();
    });
    return () => {
      mounted = false;
    };
  }, [loadInventory]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter(
      (row) =>
        row.material_name.toLowerCase().includes(normalized) ||
        row.category.toLowerCase().includes(normalized)
    );
  }, [query, rows]);

  const groupedRows = useMemo(() => {
    return filteredRows.reduce<Record<string, InventoryRow[]>>((acc, row) => {
      acc[row.category] = [...(acc[row.category] ?? []), row];
      return acc;
    }, {});
  }, [filteredRows]);

  const belowZeroCount = rows.filter((row) => row.availableQty < 0).length;
  const currentInventoryValue = rows.reduce((sum, row) => sum + row.availableValue, 0);
  const receivedInventoryValue = rows.reduce((sum, row) => sum + row.receivedValue, 0);
  const lastActivity = rows.reduce<string | null>((latest, row) => {
    return newerDate(latest, newerDate(row.lastReceipt, row.lastConsumption));
  }, null);

  function toggleCategory(category: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-400">
            <Boxes className="size-4 text-[var(--accent)]" />
            Site material balance
          </p>
          <h1 className="bg-gradient-to-r from-white via-blue-100 to-fuchsia-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Inventory
          </h1>
        </div>
      </header>

      <GlassCard className="p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(16rem,22rem)_1fr] md:items-center">
          <select
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="h-10 rounded-xl border border-white/10 bg-[#0b0d14] px-3 text-sm text-white outline-none focus:border-blue-400/60"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search material or category..."
              className="h-10 border-white/10 bg-white/5 pl-10 text-white"
            />
          </div>
        </div>
      </GlassCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <PackageSearch className="size-5 text-blue-300" />
          </div>
          <p className="text-sm text-slate-400">Total Materials Tracked</p>
          <p className="mt-2 text-3xl font-semibold text-white">{rows.length}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
            <IndianRupee className="size-5 text-emerald-300" />
          </div>
          <p className="text-sm text-slate-400">Current Inventory Value</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {formatCurrency(currentInventoryValue)}
          </p>
          <p className="mt-2 text-xs text-slate-500">Invoice value adjusted by available qty</p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10">
            <IndianRupee className="size-5 text-blue-300" />
          </div>
          <p className="text-sm text-slate-400">Received Value</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {formatCurrency(receivedInventoryValue)}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/10">
            <TrendingDown className="size-5 text-red-300" />
          </div>
          <p className="text-sm text-slate-400">Materials Below Zero</p>
          <p className="mt-2 text-3xl font-semibold text-red-200">{belowZeroCount}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <Boxes className="size-5 text-fuchsia-300" />
          </div>
          <p className="text-sm text-slate-400">Last Activity</p>
          <p className="mt-2 text-3xl font-semibold text-white">{displayDate(lastActivity)}</p>
        </GlassCard>
      </section>

      {isLoading ? (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <ElectricTableSkeleton rows={6} columns={7} />
            </table>
          </div>
        </GlassCard>
      ) : Object.keys(groupedRows).length === 0 ? (
        <EmptyState
          title="No inventory rows yet"
          description="Create GRNs and material issues for this site to see stock balances."
          ctaHref="/grn"
          ctaLabel="Go to GRN"
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRows).map(([category, categoryRows]) => {
            const expanded = expandedCategories.has(category);
            return (
              <GlassCard key={category} className="overflow-hidden">
                <button
                  className="flex w-full items-center justify-between gap-3 border-b border-white/10 p-5 text-left transition hover:bg-white/[0.03]"
                  onClick={() => toggleCategory(category)}
                >
                  <span className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" />
                    )}
                    <span className="text-lg font-semibold text-white">{category}</span>
                  </span>
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
                    {categoryRows.length} materials
                  </Badge>
                </button>

                {expanded ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-sm">
                      <thead className="bg-white/[0.03] text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Material</th>
                          <th className="px-4 py-3 font-medium">Last Receipt</th>
                          <th className="px-4 py-3 text-right font-medium">Receipt Count</th>
                          <th className="px-4 py-3 text-right font-medium">Received</th>
                          <th className="px-4 py-3 text-right font-medium">Used</th>
                          <th className="px-4 py-3 text-right font-medium">Available</th>
                          <th className="px-4 py-3 text-right font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {categoryRows.map((row) => (
                          <tr key={row.material_id} className="text-slate-300 hover:bg-white/[0.04]">
                            <td className="px-4 py-3">
                              <p className="font-medium text-white">{row.material_name}</p>
                              <p className="mt-1 text-xs text-slate-500">Unit: {row.unit}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{displayDate(row.lastReceipt)}</td>
                            <td className="px-4 py-3 text-right">{row.receiptCount}</td>
                            <td className="px-4 py-3 text-right">
                              <Badge
                                variant="outline"
                                className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                              >
                                {formatQty(row.receivedQty)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-white">
                              {formatCurrency(row.availableValue)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Badge
                                variant="outline"
                                className="border-amber-400/20 bg-amber-400/10 text-amber-200"
                              >
                                {formatQty(row.consumedQty)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  row.availableQty >= 0
                                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                    : "border-red-400/20 bg-red-400/10 text-red-200"
                                )}
                              >
                                {formatQty(row.availableQty)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
